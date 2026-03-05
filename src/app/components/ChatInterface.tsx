"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "ai/react";
import { ArrowUp, Square, Settings, Mic, X, Check, Loader2 } from "lucide-react";
import {
  MascotRive,
  TTSParams,
  useMascotSpeech,
} from "@mascotbot-sdk/react";
import { useSentenceStreamer } from "../hooks/useSentenceStreamer";
import { usePushToTalk } from "../hooks/usePushToTalk";
import { TTSSettingsModal } from "./TTSSettingsModal";

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// Avatar config — must match page.tsx
enum Avatar {
  NotionGuy = "NotionGuy",
  Panda = "Panda",
  RealisticFemale = "RealisticFemale",
}

const avatars = [
  {
    key: Avatar.NotionGuy,
    thumbnailImage: "/mascots-previews/notionguy.png",
  },
  {
    key: Avatar.Panda,
    thumbnailImage: "/mascots-previews/panda.png",
  },
  {
    key: Avatar.RealisticFemale,
    thumbnailImage: "/mascots-previews/girl.png",
  },
];

interface ChatInterfaceProps {
  selectedAvatar: Avatar;
  setSelectedAvatar: (avatar: Avatar) => void;
  ttsEngine: "mascotbot" | "elevenlabs" | "cartesia";
  setTTSEngine: (engine: "mascotbot" | "elevenlabs" | "cartesia") => void;
  elevenLabsApiKey: string;
  setElevenLabsApiKey: (key: string) => void;
  elevenLabsVoiceId: string;
  setElevenLabsVoiceId: (id: string) => void;
  elevenLabsCustomVoiceId: string;
  setElevenLabsCustomVoiceId: (id: string) => void;
  elevenLabsSpeed: number;
  setElevenLabsSpeed: (speed: number) => void;
  cartesiaApiKey: string;
  setCartesiaApiKey: (key: string) => void;
  cartesiaVoiceId: string;
  setCartesiaVoiceId: (id: string) => void;
  cartesiaCustomVoiceId: string;
  setCartesiaCustomVoiceId: (id: string) => void;
  cartesiaSpeed: number;
  setCartesiaSpeed: (speed: number) => void;
}

export function ChatInterface({
  selectedAvatar,
  setSelectedAvatar,
  ttsEngine,
  setTTSEngine,
  elevenLabsApiKey,
  setElevenLabsApiKey,
  elevenLabsVoiceId,
  setElevenLabsVoiceId,
  elevenLabsCustomVoiceId,
  setElevenLabsCustomVoiceId,
  elevenLabsSpeed,
  setElevenLabsSpeed,
  cartesiaApiKey,
  setCartesiaApiKey,
  cartesiaVoiceId,
  setCartesiaVoiceId,
  cartesiaCustomVoiceId,
  setCartesiaCustomVoiceId,
  cartesiaSpeed,
  setCartesiaSpeed,
}: ChatInterfaceProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [isCompact, setIsCompact] = useState(false);

  // TTFB tracking
  const [ttfbShown, setTtfbShown] = useState(false);
  const [currentTtfb, setCurrentTtfb] = useState<number | null>(null);

  // Status display
  const [showStatus, setShowStatus] = useState(false);
  const [statusOpacity, setStatusOpacity] = useState(1);
  const [cachedStatusMessage, setCachedStatusMessage] = useState("");
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Chat message list ref for auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Speech hook
  const speech = useMascotSpeech({
    apiEndpoint: "/api/visemes-audio",
    defaultVoice: "am_puck",
    enableNaturalLipSync: true,
    naturalLipSyncConfig: {
      minVisemeInterval: 40,
      mergeWindow: 60,
      keyVisemePreference: 0.6,
      preserveSilence: true,
      similarityThreshold: 0.4,
      preserveCriticalVisemes: true,
      desktopTransitionDuration: 18,
      mobileTransitionDuration: 22,
    },
  });

  // Immediate playback
  useEffect(() => {
    speech.setBufferSize(0);
  }, [speech]);

  // Push-to-talk — uses ElevenLabs realtime WebSocket STT via server-generated token
  const ptt = usePushToTalk();

  // Chat hook
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: chatHandleSubmit,
    append: chatAppend,
    isLoading: isChatLoading,
    stop: stopGeneration,
    error: chatError,
  } = useChat({
    api: "/api/chat",
  });

  // Responsive breakpoint
  useEffect(() => {
    const checkWidth = () => setIsCompact(window.innerWidth < 768);
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Build TTS options for addToQueue
  const buildTTSOptions = useCallback(() => {
    if (ttsEngine === "elevenlabs") {
      const voiceToUse =
        elevenLabsCustomVoiceId.trim() || elevenLabsVoiceId;
      const ttsParams: TTSParams = {
        tts_engine: "elevenlabs",
        tts_api_key: elevenLabsApiKey,
        voice: voiceToUse,
        speed: elevenLabsSpeed,
      };
      return { ttsParams };
    } else if (ttsEngine === "cartesia") {
      const voiceToUse =
        cartesiaCustomVoiceId.trim() || cartesiaVoiceId;
      const ttsParams: TTSParams = {
        tts_engine: "cartesia",
        tts_api_key: cartesiaApiKey,
        voice: voiceToUse,
        speed: cartesiaSpeed,
      };
      return { ttsParams };
    }
    return { voice: "am_puck" };
  }, [
    ttsEngine,
    elevenLabsApiKey,
    elevenLabsVoiceId,
    elevenLabsCustomVoiceId,
    elevenLabsSpeed,
    cartesiaApiKey,
    cartesiaVoiceId,
    cartesiaCustomVoiceId,
    cartesiaSpeed,
  ]);

  // Get the currently streaming assistant message content
  const streamingContent = useMemo(() => {
    if (!isChatLoading) return "";
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant") {
      return lastMessage.content;
    }
    return "";
  }, [messages, isChatLoading]);

  // Wire sentence detection → speech queue
  const handleNewSentence = useCallback(
    (sentence: string) => {
      console.log("[ChatInterface] New sentence detected:", sentence);
      const options = buildTTSOptions();
      speech.addToQueue(sentence, options);
    },
    [speech, buildTTSOptions],
  );

  const { reset: resetSentenceStreamer } = useSentenceStreamer({
    streamingContent,
    isStreaming: isChatLoading,
    onSentence: handleNewSentence,
    enabled: true,
  });

  // Auto-scroll chat messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Track TTFB
  useEffect(() => {
    if (
      speech.playbackStartDelay &&
      !ttfbShown &&
      (speech.isSpeaking || speech.isProcessingQueue)
    ) {
      setCurrentTtfb(speech.playbackStartDelay);
      setTtfbShown(true);
    }

    if (
      !speech.isSpeaking &&
      !speech.isProcessingQueue &&
      speech.queueLength === 0
    ) {
      setTtfbShown(false);
      setCurrentTtfb(null);
    }
  }, [
    speech.playbackStartDelay,
    speech.isSpeaking,
    speech.isProcessingQueue,
    speech.queueLength,
    ttfbShown,
  ]);

  // Status display with delayed fade-out
  useEffect(() => {
    const shouldShowImmediately =
      speech.isLoading ||
      speech.isSpeaking ||
      speech.isProcessingQueue ||
      speech.queueLength > 0;

    if (shouldShowImmediately) {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }

      setShowStatus(true);
      setStatusOpacity(1);

      const currentMessage = speech.isLoading
        ? `Loading... (TTS: ${ttsEngine})`
        : speech.isSpeaking || speech.isProcessingQueue
          ? `Speaking (${speech.queueLength} in queue) • TTS: ${ttsEngine}${currentTtfb ? ` • TTFB: ${currentTtfb.toFixed(0)}ms` : ""}`
          : `${speech.queueLength} items in queue • TTS: ${ttsEngine}`;
      setCachedStatusMessage(currentMessage);
    } else if (showStatus) {
      fadeTimeoutRef.current = setTimeout(() => {
        setStatusOpacity(0);
        hideTimeoutRef.current = setTimeout(() => {
          setShowStatus(false);
          setStatusOpacity(1);
        }, 1000);
      }, 4000);
    }

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [
    speech.isLoading,
    speech.isSpeaking,
    speech.isProcessingQueue,
    speech.queueLength,
    showStatus,
    ttsEngine,
    currentTtfb,
  ]);

  // Handle send — stop current speech before sending new message
  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;

      // Stop current speech so the new response starts fresh
      speech.stopAndClear();
      resetSentenceStreamer();

      chatHandleSubmit(e);
    },
    [input, speech, resetSentenceStreamer, chatHandleSubmit],
  );

  // Handle mic send — stop recording, get transcript, send as message
  const handleMicSend = useCallback(async () => {
    const text = await ptt.stopAndSend();
    if (!text) return;

    speech.stopAndClear();
    resetSentenceStreamer();

    chatAppend({ role: "user", content: text });
  }, [ptt, speech, resetSentenceStreamer, chatAppend]);

  // Handle stop — stops both generation and speech
  const handleStop = useCallback(() => {
    stopGeneration();
    speech.stopAndClear();
    resetSentenceStreamer();
  }, [stopGeneration, speech, resetSentenceStreamer]);

  const isRecording = ptt.state === "recording";
  const isTranscribing = ptt.state === "transcribing";

  const isSendDisabled =
    !input.trim() ||
    (ttsEngine === "elevenlabs" && !elevenLabsApiKey) ||
    (ttsEngine === "cartesia" && !cartesiaApiKey);

  const isActive =
    isChatLoading ||
    speech.isSpeaking ||
    speech.isProcessingQueue ||
    speech.queueLength > 0;

  // Avatar selector
  const renderAvatarSelector = (size: number) => (
    <div className="flex gap-[2px] justify-center">
      {avatars.map((avatar) => {
        const isSelected = selectedAvatar === avatar.key;
        const innerSize = size - 6;
        return (
          <div
            key={avatar.key}
            className="relative cursor-pointer transition-all duration-200"
            onClick={() => setSelectedAvatar(avatar.key)}
            style={{ width: `${size}px`, height: `${size}px` }}
          >
            {isSelected && (
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ border: "2px solid rgba(255, 138, 61, 0.7)" }}
              />
            )}
            <div
              className="absolute rounded-full overflow-hidden pointer-events-none"
              style={{
                width: `${innerSize}px`,
                height: `${innerSize}px`,
                left: "3px",
                top: "3px",
                backgroundColor: "#FFF8F0",
                border: isSelected
                  ? "none"
                  : "1px solid rgba(139, 108, 80, 0.2)",
              }}
            >
              <img
                src={avatar.thumbnailImage}
                alt={`${avatar.key} avatar`}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  // Filter for display: only show user and assistant messages
  const displayMessages = messages.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );

  return (
    <>
      {/* Mascot Display */}
      <div className="relative w-full h-full">
        {/* Mascot wrapper — absolute inset-0 for explicit bounds */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-full">
            <MascotRive />
          </div>
        </div>

        {/* Chat message overlay — left side on desktop, above controls on mobile */}
        {displayMessages.length > 0 && (
          <div
            className={cn(
              "absolute z-15 overflow-y-auto",
              isCompact
                ? "left-2 right-2 bottom-24 max-h-[40%]"
                : "left-4 top-4 bottom-36 w-[320px]",
            )}
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(139, 108, 80, 0.2) transparent",
            }}
          >
            <div className="flex flex-col gap-2 p-2">
              {displayMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    message.role === "user"
                      ? "self-end"
                      : "self-start",
                  )}
                  style={
                    message.role === "user"
                      ? {
                          backgroundColor: "rgba(255, 138, 61, 0.85)",
                          color: "#ffffff",
                        }
                      : {
                          backgroundColor: "rgba(245, 235, 223, 0.9)",
                          color: "rgba(91, 71, 55, 0.95)",
                          border: "1px solid rgba(139, 108, 80, 0.15)",
                        }
                  }
                >
                  {message.content}
                  {/* Streaming indicator */}
                  {message.role === "assistant" &&
                    isChatLoading &&
                    message.id ===
                      messages[messages.length - 1]?.id && (
                      <span
                        className="inline-block ml-1 animate-pulse"
                        style={{ color: "rgba(91, 71, 55, 0.4)" }}
                      >
                        ▍
                      </span>
                    )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Controls positioned at the bottom */}
        <div className="absolute left-0 right-0 bottom-4 md:bottom-12 flex items-center justify-center z-20 px-2 md:px-6">
          {isRecording || isTranscribing ? (
            /* ── Recording / Transcribing state ── */
            <div
              className={cn(
                "relative w-full max-w-3xl",
                isCompact
                  ? "flex flex-col gap-3 rounded-2xl p-3"
                  : "flex items-center rounded-full gap-2 px-3 py-2",
              )}
              style={{
                backgroundColor: "#F5EBDF",
                border: "1px solid rgba(139, 108, 80, 0.2)",
              }}
            >
              <div className="flex items-center gap-2 w-full">
                {/* Cancel button */}
                <button
                  type="button"
                  onClick={ptt.cancel}
                  disabled={isTranscribing}
                  className="rounded-full p-2.5 transition-colors hover:opacity-80 flex-shrink-0"
                  style={{
                    backgroundColor: "rgba(255, 138, 61, 0.08)",
                    color: "rgba(91, 71, 55, 0.95)",
                  }}
                  aria-label="Cancel recording"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Transcript display / listening indicator */}
                <div
                  className="flex-1 min-w-0 overflow-hidden rounded-full px-4 py-2.5 text-sm flex items-center gap-2 min-h-[40px]"
                  style={{
                    backgroundColor: "#FFF8F0",
                    color: "rgba(91, 71, 55, 0.95)",
                    border: "1px solid rgba(139, 108, 80, 0.15)",
                  }}
                >
                  {isTranscribing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: "#ff8a3d" }} />
                      <span style={{ color: "rgba(91, 71, 55, 0.6)" }}>Transcribing...</span>
                    </>
                  ) : (
                    <>
                      {/* Pulsing red dot */}
                      <span className="relative flex-shrink-0 w-2.5 h-2.5">
                        <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
                        <span className="relative block w-2.5 h-2.5 rounded-full bg-red-500" />
                      </span>
                      {ptt.transcript || ptt.interimTranscript ? (
                        <span className="truncate">
                          {ptt.transcript}
                          {ptt.interimTranscript && (
                            <span style={{ color: "rgba(91, 71, 55, 0.5)" }}>
                              {ptt.transcript ? " " : ""}{ptt.interimTranscript}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: "rgba(91, 71, 55, 0.5)" }}>Listening...</span>
                      )}
                    </>
                  )}
                </div>

                {/* Send (checkmark) button */}
                <button
                  type="button"
                  onClick={handleMicSend}
                  disabled={isTranscribing}
                  className="rounded-full p-2.5 font-medium transition-all hover:opacity-90 flex-shrink-0"
                  style={{
                    backgroundColor: isTranscribing
                      ? "rgba(255, 138, 61, 0.3)"
                      : "#ff8a3d",
                    color: "#ffffff",
                  }}
                  aria-label="Send recording"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* ── Idle state: normal input bar ── */
            <form
              onSubmit={handleSend}
              className={cn(
                "relative w-full max-w-3xl",
                isCompact
                  ? "flex flex-col gap-3 rounded-2xl p-3"
                  : "flex items-center rounded-full gap-2 px-3 py-2",
              )}
              style={{
                backgroundColor: "#F5EBDF",
                border: "1px solid rgba(139, 108, 80, 0.2)",
              }}
            >
              {/* Mobile: Avatar Selector at top */}
              {isCompact && renderAvatarSelector(40)}

              {/* Desktop: Avatar Selector on the left */}
              {!isCompact && renderAvatarSelector(36)}

              {/* Input and buttons row */}
              <div className="flex items-center gap-2 w-full">
                <input
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  placeholder="Ask your mascot anything..."
                  className="flex-1 rounded-full px-4 py-2.5 text-sm focus:outline-none transition-all"
                  style={{
                    backgroundColor: "#FFF8F0",
                    color: "rgba(91, 71, 55, 0.95)",
                    border: "1px solid rgba(139, 108, 80, 0.15)",
                  }}
                />

                {/* Control buttons */}
                <div className="flex items-center gap-1.5">
                  {/* Settings button */}
                  <button
                    type="button"
                    onClick={() => setShowSettings(true)}
                    className="rounded-full p-2.5 transition-colors hover:opacity-80 flex-shrink-0"
                    style={{
                      backgroundColor: "rgba(255, 138, 61, 0.08)",
                      color: "rgba(91, 71, 55, 0.95)",
                    }}
                    aria-label="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  {/* Stop button — visible when generating or speaking */}
                  {isActive && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="rounded-full p-2.5 transition-colors hover:opacity-80 flex-shrink-0"
                      style={{
                        backgroundColor: "rgba(255, 138, 61, 0.08)",
                        color: "rgba(91, 71, 55, 0.95)",
                      }}
                      aria-label="Stop"
                    >
                      <Square className="w-4 h-4" />
                    </button>
                  )}

                  {/* Send button — before mic so mic stays rightmost */}
                  <button
                    type="submit"
                    disabled={isSendDisabled}
                    className={cn(
                      "rounded-full font-medium transition-all hover:opacity-90 flex-shrink-0",
                      isCompact ? "p-2.5" : "px-5 py-2.5",
                      isSendDisabled && "cursor-not-allowed opacity-50",
                    )}
                    style={{
                      backgroundColor: isSendDisabled
                        ? "rgba(255, 138, 61, 0.3)"
                        : "#ff8a3d",
                      color: "#ffffff",
                    }}
                    aria-label={isCompact ? "Send" : "Send"}
                  >
                    {isCompact ? (
                      <ArrowUp className="w-4 h-4" />
                    ) : (
                      <span className="text-sm">Send</span>
                    )}
                  </button>

                  {/* Mic button — rightmost, aligns with send/check in recording state */}
                  <button
                    type="button"
                    onClick={ptt.startRecording}
                    className="rounded-full p-2.5 transition-colors hover:opacity-80 flex-shrink-0"
                    style={{
                      backgroundColor: "rgba(255, 138, 61, 0.08)",
                      color: "rgba(91, 71, 55, 0.95)",
                    }}
                    aria-label="Voice input"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Status display */}
          {showStatus && (
            <div
              className="absolute left-0 right-0 -bottom-5 text-center text-xs transition-opacity duration-1000"
              style={{ color: "#999999", opacity: statusOpacity }}
            >
              {cachedStatusMessage}
            </div>
          )}

          {/* Error display */}
          {(speech.error || chatError || ptt.error) && (
            <div className="absolute left-0 right-0 -bottom-9 text-center">
              <div
                className="inline-block px-4 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "#fee", color: "#c00" }}
              >
                {speech.error || chatError?.message || ptt.error}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <TTSSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          ttsEngine={ttsEngine}
          setTTSEngine={setTTSEngine}
          elevenLabsApiKey={elevenLabsApiKey}
          setElevenLabsApiKey={setElevenLabsApiKey}
          elevenLabsVoiceId={elevenLabsVoiceId}
          setElevenLabsVoiceId={setElevenLabsVoiceId}
          elevenLabsCustomVoiceId={elevenLabsCustomVoiceId}
          setElevenLabsCustomVoiceId={setElevenLabsCustomVoiceId}
          elevenLabsSpeed={elevenLabsSpeed}
          setElevenLabsSpeed={setElevenLabsSpeed}
          cartesiaApiKey={cartesiaApiKey}
          setCartesiaApiKey={setCartesiaApiKey}
          cartesiaVoiceId={cartesiaVoiceId}
          setCartesiaVoiceId={setCartesiaVoiceId}
          cartesiaCustomVoiceId={cartesiaCustomVoiceId}
          setCartesiaCustomVoiceId={setCartesiaCustomVoiceId}
          cartesiaSpeed={cartesiaSpeed}
          setCartesiaSpeed={setCartesiaSpeed}
        />
      )}
    </>
  );
}
