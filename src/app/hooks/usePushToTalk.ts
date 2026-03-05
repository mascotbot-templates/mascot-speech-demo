"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PushToTalkState = "idle" | "recording" | "transcribing";

interface UsePushToTalkReturn {
  state: PushToTalkState;
  transcript: string;
  interimTranscript: string;
  startRecording: () => Promise<void>;
  stopAndSend: () => Promise<string | null>;
  cancel: () => void;
  error: string | null;
}

/** Convert Float32 audio samples to 16-bit signed integer PCM */
function float32ToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/** Convert Int16Array to base64 string */
function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface UsePushToTalkOptions {
  /**
   * When true, uses ElevenLabs realtime WebSocket STT via a server-generated
   * single-use token (from /api/stt-token). Falls back to MediaRecorder +
   * server-side /api/transcribe when false.
   */
  useElevenLabsSTT?: boolean;
}

const SAMPLE_RATE = 16000;

/**
 * Push-to-talk with real-time streaming transcription via ElevenLabs WebSocket STT.
 *
 * On mic click:
 * 1. Mic capture starts IMMEDIATELY (instant — no WebSocket wait)
 * 2. Single-use token fetched + WebSocket opens in parallel, PCM chunks buffer in memory
 * 3. Once WebSocket connects (~100-200ms), buffered chunks flush + live streaming begins
 * 4. partial_transcript / committed_transcript arrive in real-time
 *
 * By the time the user hits send, most speech is already transcribed — minimal delay.
 *
 * Falls back to MediaRecorder + server-side /api/transcribe if useElevenLabsSTT is false.
 */
export function usePushToTalk(options: UsePushToTalkOptions = {}): UsePushToTalkReturn {
  const { useElevenLabsSTT = true } = options;

  const [state, setState] = useState<PushToTalkState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // For fallback (no ElevenLabs)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Accumulated committed text
  const committedTextRef = useRef("");
  const wsReadyRef = useRef(false);

  // Buffer for PCM chunks captured before WebSocket is ready
  const audioBufferRef = useRef<string[]>([]);

  // Track whether we used ElevenLabs for this recording session
  const usedElevenLabsRef = useRef(false);

  // Pre-fetched single-use token (fetched on mount, refreshed after each use)
  const prefetchedTokenRef = useRef<string | null>(null);
  const tokenFetchingRef = useRef(false);

  const prefetchToken = useCallback(async () => {
    if (tokenFetchingRef.current) return;
    tokenFetchingRef.current = true;
    try {
      const res = await fetch("/api/stt-token", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        prefetchedTokenRef.current = data.token;
        console.log("[PTT] Token prefetched");
      } else {
        console.warn("[PTT] Token prefetch failed:", res.status);
      }
    } catch (err) {
      console.warn("[PTT] Token prefetch error:", err);
    } finally {
      tokenFetchingRef.current = false;
    }
  }, []);

  // Prefetch token on mount
  useEffect(() => {
    if (useElevenLabsSTT) {
      prefetchToken();
    }
  }, [useElevenLabsSTT, prefetchToken]);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    wsReadyRef.current = false;
    audioBufferRef.current = [];

    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch {}
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  /** Flush buffered audio chunks through the WebSocket */
  const flushBuffer = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const buffered = audioBufferRef.current;
    if (buffered.length > 0) {
      console.log(`[PTT] Flushing ${buffered.length} buffered audio chunks`);
      for (const base64 of buffered) {
        ws.send(JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: base64,
          commit: false,
          sample_rate: SAMPLE_RATE,
        }));
      }
      audioBufferRef.current = [];
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    setInterimTranscript("");
    committedTextRef.current = "";
    audioBufferRef.current = [];

    try {
      // Mic capture starts IMMEDIATELY
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      if (useElevenLabsSTT) {
        // ── ElevenLabs WebSocket STT ──
        console.log("[PTT] Starting ElevenLabs realtime STT");
        usedElevenLabsRef.current = true;

        // 1. Start AudioContext + PCM capture RIGHT AWAY (before WebSocket connects)
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          const pcmFloat = e.inputBuffer.getChannelData(0);
          const pcmInt16 = float32ToInt16(pcmFloat);
          const base64 = int16ToBase64(pcmInt16);

          if (wsReadyRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              message_type: "input_audio_chunk",
              audio_base_64: base64,
              commit: false,
              sample_rate: SAMPLE_RATE,
            }));
          } else {
            audioBufferRef.current.push(base64);
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        // 2. Use prefetched token (or fetch inline as fallback)
        let token = prefetchedTokenRef.current;
        if (!token) {
          console.log("[PTT] No prefetched token, fetching inline...");
          const tokenRes = await fetch("/api/stt-token", { method: "POST" });
          if (!tokenRes.ok) {
            const tokenErr = await tokenRes.json().catch(() => ({}));
            throw new Error(tokenErr.error || "Failed to get STT token");
          }
          const data = await tokenRes.json();
          token = data.token;
        }
        prefetchedTokenRef.current = null; // consumed — will prefetch a new one after use
        console.log("[PTT] Opening WebSocket with token...");

        const wsUrl = new URL("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
        wsUrl.searchParams.set("model_id", "scribe_v2_realtime");
        wsUrl.searchParams.set("language_code", "en");
        wsUrl.searchParams.set("audio_format", `pcm_${SAMPLE_RATE}`);
        wsUrl.searchParams.set("token", token!);

        const ws = new WebSocket(wsUrl.toString());
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[PTT] WebSocket connected — flushing buffered audio");
          wsReadyRef.current = true;
          flushBuffer();
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.message_type === "session_started") {
              console.log("[PTT] STT session started:", msg.session_id);
            } else if (msg.message_type === "partial_transcript") {
              setInterimTranscript(msg.text || "");
            } else if (msg.message_type === "committed_transcript") {
              const committed = msg.text || "";
              committedTextRef.current += (committedTextRef.current ? " " : "") + committed;
              setTranscript(committedTextRef.current);
              setInterimTranscript("");
              console.log("[PTT] Committed:", committed);
            } else if (msg.message_type === "error" || msg.message_type === "auth_error") {
              console.error("[PTT] STT error:", msg);
              setError(msg.error || msg.message || "STT error");
            }
          } catch {}
        };

        ws.onerror = () => {
          console.error("[PTT] WebSocket error");
        };

        ws.onclose = (event) => {
          console.log("[PTT] WebSocket closed:", event.code, event.reason);
          wsReadyRef.current = false;
          // Prefetch a fresh token for the next recording
          prefetchToken();
        };
      } else {
        // ── Fallback: MediaRecorder + server-side transcription ──
        console.log("[PTT] Using MediaRecorder fallback");
        usedElevenLabsRef.current = false;

        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
          .find((t) => MediaRecorder.isTypeSupported(t)) || "audio/webm";

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.start();
      }

      setState("recording");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Microphone access denied";
      setError(message);
      cleanup();
    }
  }, [useElevenLabsSTT, cleanup, flushBuffer, prefetchToken]);

  const stopAndSend = useCallback(async (): Promise<string | null> => {
    if (state !== "recording") return null;

    if (usedElevenLabsRef.current && wsRef.current) {
      // ── ElevenLabs path: transcript already accumulated ──
      // Send a final commit to flush any remaining audio
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: "",
          commit: true,
          sample_rate: SAMPLE_RATE,
        }));

        // Brief wait for final committed_transcript to arrive
        await new Promise<void>((resolve) => {
          const ws = wsRef.current;
          if (!ws) { resolve(); return; }

          const timeout = setTimeout(resolve, 500);

          const originalOnMessage = ws.onmessage;
          ws.onmessage = (event) => {
            if (originalOnMessage) originalOnMessage.call(ws, event);

            try {
              const msg = JSON.parse(event.data);
              if (msg.message_type === "committed_transcript") {
                clearTimeout(timeout);
                setTimeout(resolve, 50);
              }
            } catch {}
          };
        });
      }

      const finalText = (committedTextRef.current + (interimTranscript ? " " + interimTranscript : "")).trim();

      cleanup();
      setTranscript("");
      setInterimTranscript("");
      committedTextRef.current = "";
      setState("idle");

      console.log("[PTT] Final transcript:", finalText);
      return finalText || null;
    } else {
      // ── Fallback: server-side transcription ──
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        cleanup();
        setState("idle");
        return null;
      }

      const blob = await new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const mimeType = recorder.mimeType || "audio/webm";
          resolve(new Blob(chunksRef.current, { type: mimeType }));
        };
        recorder.stop();
      });

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      mediaRecorderRef.current = null;

      if (blob.size === 0) {
        setState("idle");
        setError("No audio recorded");
        return null;
      }

      setState("transcribing");

      try {
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        const file = new File([blob], `recording.${ext}`, { type: blob.type });
        const formData = new FormData();
        formData.append("audio", file);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Transcription failed (${response.status})`);
        }

        const data = await response.json();
        setState("idle");
        return data.text || null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transcription failed";
        setError(message);
        setState("idle");
        return null;
      }
    }
  }, [state, interimTranscript, cleanup]);

  const cancel = useCallback(() => {
    cleanup();
    setTranscript("");
    setInterimTranscript("");
    committedTextRef.current = "";
    setState("idle");
    setError(null);
  }, [cleanup]);

  return {
    state,
    transcript,
    interimTranscript,
    startRecording,
    stopAndSend,
    cancel,
    error,
  };
}
