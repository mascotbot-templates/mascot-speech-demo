"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, Square, ArrowUp } from "lucide-react";
import { Alignment, Fit } from "@rive-app/react-webgl2";
import {
  MascotClient,
  MascotProvider,
  MascotRive,
  TTSParams,
  useMascot,
  useMascotSpeech,
} from "@mascotbot-sdk/react";
import { TTSSettingsModal } from "./components/TTSSettingsModal";
import { ChatInterface } from "./components/ChatInterface";

type Mode = "direct" | "chat";

// Simple classnames utility
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// Avatar enum
enum Avatar {
  NotionGuy = "NotionGuy",
  Panda = "Panda",
  RealisticFemale = "RealisticFemale",
}

// Test sentences for cycling through
const TEST_SENTENCES = [
  "Hey, I'm your mascot!",
  "Wanna see a trick?",
  "Let's get talking!",
  "Hey, Mascot's here.",
  "Ready to chat?",
  "Mascot magic time.",
  "Keep the magic going.",
  "Catch you in the next frame!",
  "Hey, let's have some fun!",
  "Mascot mode: activated.",
];

// Avatar configuration — .riv files live in public/
const avatars = [
  {
    key: Avatar.NotionGuy,
    value: "/notionguy.riv",
    thumbnailImage: "/mascots-previews/notionguy.png",
  },
  {
    key: Avatar.Panda,
    value: "/panda.riv",
    thumbnailImage: "/mascots-previews/panda.png",
  },
  {
    key: Avatar.RealisticFemale,
    value: "/girl.riv",
    thumbnailImage: "/mascots-previews/girl.png",
  },
];

// ---------------------------------------------------------------------------
// ApplyCustomizations — applies NotionGuy Rive inputs inside MascotClient
// ---------------------------------------------------------------------------
function ApplyCustomizations({
  avatar,
  notionGuySettings,
}: {
  avatar: Avatar;
  notionGuySettings: any;
}) {
  const { customInputs } = useMascot();

  useEffect(() => {
    if (!customInputs) return;

    if (avatar === Avatar.NotionGuy && notionGuySettings) {
      const settings = notionGuySettings;

      // Rive inputs can be briefly stale during component transitions.
      // Wrap in try-catch to avoid crashing on null internal references.
      try {
        if (customInputs.gender && settings.gender) {
          customInputs.gender.value = settings.gender === "male" ? 1 : 2;
        }
        if (customInputs.outline) {
          customInputs.outline.value = settings.outline;
        }
        if (customInputs.colourful !== undefined) {
          customInputs.colourful.value = settings.colourful;
        }
        if (customInputs.flip !== undefined) {
          customInputs.flip.value = settings.flip;
        }
        if (customInputs.crop !== undefined) {
          customInputs.crop.value = settings.crop;
        }
        if (customInputs.accessories_hue) {
          customInputs.accessories_hue.value = settings.accessories_hue;
        }
        if (customInputs.accessories_saturation) {
          customInputs.accessories_saturation.value =
            settings.accessories_saturation;
        }
        if (customInputs.accessories_brightness) {
          customInputs.accessories_brightness.value =
            settings.accessories_brightness;
        }
        if (customInputs.shirt_color) {
          customInputs.shirt_color.value = settings.shirt_color;
        }
        if (customInputs.bg_color) {
          customInputs.bg_color.value = settings.bg_color;
        }
        if (customInputs.eyes_type) {
          customInputs.eyes_type.value = settings.eyes_type;
        }
        if (customInputs.hair_style) {
          customInputs.hair_style.value = settings.hair_style;
        }

        console.log("[MascotSpeechDemo] Applied NotionGuy customizations");
      } catch (e) {
        // Inputs not ready yet — will retry on next customInputs update
      }
    }
  }, [customInputs, avatar, notionGuySettings]);

  return null;
}

// ---------------------------------------------------------------------------
// VoiceOverControls — speech queue controls rendered inside MascotClient
// ---------------------------------------------------------------------------
interface VoiceOverControlsProps {
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
  notionGuySettings: any;
}

function VoiceOverControls({
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
}: VoiceOverControlsProps) {
  const [text, setText] = useState<string>(TEST_SENTENCES[0]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);

  // TTFB tracking
  const [ttfbShown, setTtfbShown] = useState<boolean>(false);
  const [currentTtfb, setCurrentTtfb] = useState<number | null>(null);

  // Delayed status display with fade-out
  const [showStatus, setShowStatus] = useState<boolean>(false);
  const [statusOpacity, setStatusOpacity] = useState<number>(1);
  const [cachedStatusMessage, setCachedStatusMessage] = useState<string>("");
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Speech hook — points to our local API route
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

  // Responsive breakpoint
  useEffect(() => {
    const checkWidth = () => setIsCompact(window.innerWidth < 768);
    checkWidth();
    window.addEventListener("resize", checkWidth);
    return () => window.removeEventListener("resize", checkWidth);
  }, []);

  // Immediate playback (buffer size 0)
  useEffect(() => {
    speech.setBufferSize(0);
  }, [speech]);

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
          ? `Playing (${speech.queueLength} in queue) • TTS: ${ttsEngine}${currentTtfb ? ` • TTFB: ${currentTtfb.toFixed(0)}ms` : ""}`
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

  const handleAddToPlayback = async () => {
    try {
      if (ttsEngine === "elevenlabs") {
        const voiceToUse =
          elevenLabsCustomVoiceId.trim() || elevenLabsVoiceId;
        const ttsParams: TTSParams = {
          tts_engine: "elevenlabs",
          tts_api_key: elevenLabsApiKey,
          voice: voiceToUse,
          speed: elevenLabsSpeed,
        };
        speech.addToQueue(text, { ttsParams });
      } else if (ttsEngine === "cartesia") {
        const voiceToUse =
          cartesiaCustomVoiceId.trim() || cartesiaVoiceId;
        const ttsParams: TTSParams = {
          tts_engine: "cartesia",
          tts_api_key: cartesiaApiKey,
          voice: voiceToUse,
          speed: cartesiaSpeed,
        };
        speech.addToQueue(text, { ttsParams });
      } else {
        speech.addToQueue(text, { voice: "am_puck" });
      }

      const nextIndex = (currentSentenceIndex + 1) % TEST_SENTENCES.length;
      setCurrentSentenceIndex(nextIndex);
      setText(TEST_SENTENCES[nextIndex]);
    } catch (err) {
      console.error("Error adding to speech queue:", err);
    }
  };

  const handleStop = () => {
    speech.stopAndClear();
  };

  const isPlaybackDisabled =
    !text.trim() ||
    (ttsEngine === "elevenlabs" && !elevenLabsApiKey) ||
    (ttsEngine === "cartesia" && !cartesiaApiKey);

  // Avatar selector (shared between mobile and desktop)
  const renderAvatarSelector = (size: number) => (
    <div className="flex gap-[2px] justify-center">
      {avatars.map((avatar) => {
        const isSelected = selectedAvatar === avatar.key;
        const outerSize = size;
        const innerSize = size - 6;
        return (
          <div
            key={avatar.key}
            className="relative cursor-pointer transition-all duration-200"
            onClick={() => setSelectedAvatar(avatar.key)}
            style={{ width: `${outerSize}px`, height: `${outerSize}px` }}
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

        {/* Controls positioned at the bottom */}
        <div className="absolute left-0 right-0 bottom-4 md:bottom-12 flex items-center justify-center z-20 px-2 md:px-6">
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
            {/* Mobile: Avatar Selector at top */}
            {isCompact && renderAvatarSelector(40)}

            {/* Desktop: Avatar Selector on the left */}
            {!isCompact && renderAvatarSelector(36)}

            {/* Input and buttons row */}
            <div className="flex items-center gap-2 w-full">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={TEST_SENTENCES[currentSentenceIndex]}
                className="flex-1 rounded-full px-4 py-2.5 text-sm focus:outline-none transition-all"
                style={{
                  backgroundColor: "#FFF8F0",
                  color: "rgba(91, 71, 55, 0.95)",
                  border: "1px solid rgba(139, 108, 80, 0.15)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isPlaybackDisabled) {
                    handleAddToPlayback();
                  }
                }}
              />

              {/* Control buttons */}
              <div className="flex items-center gap-1.5">
                {/* Settings button */}
                <button
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

                {/* Stop button */}
                {(speech.isSpeaking ||
                  speech.isProcessingQueue ||
                  speech.queueLength > 0) && (
                  <button
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

                {/* Add to Queue button */}
                <button
                  onClick={handleAddToPlayback}
                  disabled={isPlaybackDisabled}
                  className={cn(
                    "rounded-full font-medium transition-all hover:opacity-90 flex-shrink-0",
                    isCompact ? "p-2.5" : "px-5 py-2.5",
                    isPlaybackDisabled && "cursor-not-allowed opacity-50",
                  )}
                  style={{
                    backgroundColor: isPlaybackDisabled
                      ? "rgba(255, 138, 61, 0.3)"
                      : "#ff8a3d",
                    color: "#ffffff",
                  }}
                  aria-label={isCompact ? "Send" : "Add to Queue"}
                >
                  {isCompact ? (
                    <ArrowUp className="w-4 h-4" />
                  ) : (
                    <span className="text-sm">Add to Queue</span>
                  )}
                </button>
              </div>
            </div>
          </div>

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
          {speech.error && (
            <div className="absolute left-0 right-0 -bottom-9 text-center">
              <div
                className="inline-block px-4 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "#fee", color: "#c00" }}
              >
                {speech.error}
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

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------
export default function MascotSpeechDemoPage() {
  // Mode toggle — Direct (manual text) vs Chat (LLM streaming)
  const [mode, setMode] = useState<Mode>("chat");

  // Mobile detection for responsive Rive layout
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Avatar selection
  const [selectedAvatar, setSelectedAvatar] = useState<Avatar>(
    Avatar.NotionGuy,
  );
  const currentAvatar = avatars.find((a) => a.key === selectedAvatar);

  // TTS engine state — persists across avatar changes
  const [ttsEngine, setTTSEngine] = useState<
    "mascotbot" | "elevenlabs" | "cartesia"
  >("mascotbot");

  // ElevenLabs settings
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState<string>(
    process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "",
  );
  const [elevenLabsVoiceId, setElevenLabsVoiceId] =
    useState<string>("21m00Tcm4TlvDq8ikWAM");
  const [elevenLabsCustomVoiceId, setElevenLabsCustomVoiceId] =
    useState<string>("");
  const [elevenLabsSpeed, setElevenLabsSpeed] = useState<number>(1.0);

  // Cartesia settings
  const [cartesiaApiKey, setCartesiaApiKey] = useState<string>("");
  const [cartesiaVoiceId, setCartesiaVoiceId] = useState<string>(
    "21b81c14-f85b-436d-aff5-43f2e788ecf8",
  );
  const [cartesiaCustomVoiceId, setCartesiaCustomVoiceId] =
    useState<string>("");
  const [cartesiaSpeed, setCartesiaSpeed] = useState<number>(-0.5);

  // NotionGuy customization settings (female, colorful, outline 10)
  const [notionGuySettings] = useState({
    gender: "female" as "male" | "female",
    outline: 10,
    colourful: true,
    flip: false,
    crop: false,
    accessories_hue: 0,
    accessories_saturation: 0,
    accessories_brightness: 0,
    shirt_color: 2,
    bg_color: 0,
    eyes_type: 2,
    hair_style: 1,
  });

  // Load saved API keys from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedElevenLabsApiKey =
        localStorage.getItem("elevenlabs_api_key");
      if (savedElevenLabsApiKey) {
        setElevenLabsApiKey(savedElevenLabsApiKey);
      }

      const savedCartesiaApiKey = localStorage.getItem("cartesia_api_key");
      if (savedCartesiaApiKey) {
        setCartesiaApiKey(savedCartesiaApiKey);
      }
    }
  }, []);

  // Shared TTS settings props
  const ttsSettingsProps = {
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
  };

  return (
    <MascotProvider key={selectedAvatar}>
      <main className="w-full h-screen h-[100dvh]">
        <MascotClient
          src={currentAvatar?.value ?? ""}
          artboard="Character"
          inputs={[
            "gender",
            "outline",
            "colourful",
            "flip",
            "crop",
            "accessories_hue",
            "accessories_saturation",
            "accessories_brightness",
            "shirt_color",
            "bg_color",
            "eyes_type",
            "hair_style",
          ]}
          layout={{
            fit: isMobile ? Fit.Cover : Fit.Contain,
            alignment: Alignment.BottomCenter,
          }}
        >
          <div
            className="fixed inset-0 overflow-hidden"
            style={{ backgroundColor: "#FFF8F0" }}
          >
            {/* Mode Toggle — top right */}
            <div
              className="absolute top-4 right-4 z-30 flex gap-1 rounded-full p-1"
              style={{
                backgroundColor: "#F5EBDF",
                border: "1px solid rgba(139, 108, 80, 0.2)",
              }}
            >
              <button
                onClick={() => setMode("direct")}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    mode === "direct" ? "#ff8a3d" : "transparent",
                  color:
                    mode === "direct" ? "#fff" : "rgba(91, 71, 55, 0.7)",
                }}
              >
                Direct
              </button>
              <button
                onClick={() => setMode("chat")}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    mode === "chat" ? "#ff8a3d" : "transparent",
                  color:
                    mode === "chat" ? "#fff" : "rgba(91, 71, 55, 0.7)",
                }}
              >
                Chat
              </button>
            </div>

            {/* Full-screen mascot area */}
            <div className="h-screen h-[100dvh] w-full flex items-center justify-center">
              <div className="relative w-full h-full">
                {/* Background pattern */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ opacity: 0.4 }}
                >
                  <img
                    src="/bg_pattern.svg"
                    alt=""
                    className="object-cover object-center w-full h-full"
                  />
                </div>

                <ApplyCustomizations
                  avatar={selectedAvatar}
                  notionGuySettings={notionGuySettings}
                />

                {mode === "direct" ? (
                  <VoiceOverControls
                    selectedAvatar={selectedAvatar}
                    setSelectedAvatar={setSelectedAvatar}
                    {...ttsSettingsProps}
                    notionGuySettings={notionGuySettings}
                  />
                ) : (
                  <ChatInterface
                    selectedAvatar={selectedAvatar}
                    setSelectedAvatar={setSelectedAvatar}
                    {...ttsSettingsProps}
                  />
                )}

                {/* Bottom gradient overlay */}
                <div
                  className="absolute bottom-0 left-0 right-0 pointer-events-none"
                  style={{
                    height: "25%",
                    background:
                      "linear-gradient(180deg, #FFF8F000 0%, #FFF8F0 90%)",
                  }}
                />
              </div>
            </div>
          </div>
        </MascotClient>
      </main>
    </MascotProvider>
  );
}
