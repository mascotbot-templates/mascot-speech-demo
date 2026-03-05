import { useEffect, useRef, useCallback } from "react";

interface UseSentenceStreamerOptions {
  /** The streaming text content to watch (grows over time as tokens arrive) */
  streamingContent: string;
  /** Whether the stream is currently active/loading */
  isStreaming: boolean;
  /** Callback fired for each newly detected complete sentence */
  onSentence: (sentence: string) => void;
  /** Whether sentence detection is enabled */
  enabled: boolean;
}

/**
 * Watches growing streaming text and detects sentence boundaries in real-time.
 * Fires `onSentence` for each complete sentence detected.
 *
 * Algorithm:
 * 1. Track how much of streamingContent we've already processed
 * 2. Append new characters to an internal buffer
 * 3. Scan for sentence-ending punctuation (. ! ?) followed by whitespace
 *    — the whitespace confirms the sentence is complete
 * 4. Extract and emit complete sentences
 * 5. On stream end, flush any remaining buffer as a final sentence
 */
export function useSentenceStreamer({
  streamingContent,
  isStreaming,
  onSentence,
  enabled,
}: UseSentenceStreamerOptions) {
  const processedLengthRef = useRef(0);
  const bufferRef = useRef("");
  const onSentenceRef = useRef(onSentence);

  // Keep callback ref fresh to avoid stale closures
  useEffect(() => {
    onSentenceRef.current = onSentence;
  }, [onSentence]);

  const reset = useCallback(() => {
    processedLengthRef.current = 0;
    bufferRef.current = "";
  }, []);

  // Process new streaming content and detect sentence boundaries
  useEffect(() => {
    if (!enabled) return;

    const newText = streamingContent.slice(processedLengthRef.current);
    if (!newText) return;

    processedLengthRef.current = streamingContent.length;
    bufferRef.current += newText;

    // Find the last sentence-ending punctuation followed by whitespace.
    // We look for ". " or "! " or "? " — the space confirms the next sentence started,
    // which avoids splitting on abbreviations ("Dr.") or decimals ("3.14").
    let lastSplitPos = -1;
    for (let i = 0; i < bufferRef.current.length - 1; i++) {
      const char = bufferRef.current[i];
      const nextChar = bufferRef.current[i + 1];
      if (
        (char === "." || char === "!" || char === "?") &&
        (nextChar === " " || nextChar === "\n")
      ) {
        lastSplitPos = i + 1; // Include the punctuation
      }
    }

    if (lastSplitPos > 0) {
      const completedText = bufferRef.current.slice(0, lastSplitPos).trim();
      bufferRef.current = bufferRef.current.slice(lastSplitPos).trimStart();

      if (completedText) {
        // Split into individual sentences and emit each
        const sentences = completedText.match(/[^.!?]*[.!?]+/g);
        if (sentences) {
          for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed) {
              onSentenceRef.current(trimmed);
            }
          }
        } else if (completedText.trim()) {
          onSentenceRef.current(completedText.trim());
        }
      }
    }
  }, [streamingContent, enabled]);

  // Flush remaining buffer when streaming ends
  useEffect(() => {
    if (!isStreaming && enabled && bufferRef.current.trim()) {
      const remaining = bufferRef.current.trim();
      bufferRef.current = "";
      onSentenceRef.current(remaining);
    }
  }, [isStreaming, enabled]);

  return { reset };
}
