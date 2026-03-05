"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

// Simple classnames utility
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// Sample ElevenLabs voices
const ELEVENLABS_SAMPLE_VOICES = [
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Michael" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Rachel" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Domi" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Sam" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
];

// Sample Cartesia voices
const CARTESIA_SAMPLE_VOICES = [
  { id: "21b81c14-f85b-436d-aff5-43f2e788ecf8", name: "Alex" },
  { id: "6f84f4b8-58a2-430c-8c79-688dad597532", name: "Morgan" },
  { id: "c99d36f3-5ffd-4253-803a-535c1bc9c306", name: "Jordan" },
  { id: "00967b2f-88a6-4a31-8153-110a92134b9f", name: "Taylor" },
];

interface TTSSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
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

export function TTSSettingsModal({
  isOpen,
  onClose,
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
}: TTSSettingsModalProps) {
  const saveElevenLabsApiKey = useCallback(() => {
    if (typeof window !== "undefined" && elevenLabsApiKey) {
      try {
        localStorage.setItem("elevenlabs_api_key", elevenLabsApiKey);
        alert("API key saved");
      } catch (err) {
        console.error("Error saving API key:", err);
      }
    }
  }, [elevenLabsApiKey]);

  const saveCartesiaApiKey = useCallback(() => {
    if (typeof window !== "undefined" && cartesiaApiKey) {
      try {
        localStorage.setItem("cartesia_api_key", cartesiaApiKey);
        alert("API key saved");
      } catch (err) {
        console.error("Error saving API key:", err);
      }
    }
  }, [cartesiaApiKey]);

  if (!isOpen) return null;

  const modalContent = (
    <>
      {/* Modal Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-[100]" onClick={onClose} />

      {/* Modal Content */}
      <div
        className="fixed z-[100] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] max-w-[90vw] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "#1a1a1a",
          borderWidth: "1.5px",
          borderColor: "#333333",
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between p-6 border-b"
          style={{ borderColor: "#333333" }}
        >
          <h3 className="text-lg font-semibold" style={{ color: "#ffffff" }}>
            TTS Settings
          </h3>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: "#ff8a3d",
              color: "#ffffff",
            }}
          >
            Save and Close
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-88px)]">
          {/* TTS Engine Selection */}
          <div className="mb-6">
            <label
              className="text-sm font-medium mb-3 block"
              style={{ color: "#ffffff" }}
            >
              Select TTS Engine
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setTTSEngine("mascotbot")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
                  ttsEngine !== "mascotbot" && "hover:bg-white/5",
                )}
                style={{
                  backgroundColor:
                    ttsEngine === "mascotbot" ? "#ff8a3d" : "#2a2a2a",
                  color: "#ffffff",
                }}
              >
                MascotBot
              </button>
              <button
                onClick={() => setTTSEngine("elevenlabs")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
                  ttsEngine !== "elevenlabs" && "hover:bg-white/5",
                )}
                style={{
                  backgroundColor:
                    ttsEngine === "elevenlabs" ? "#ff8a3d" : "#2a2a2a",
                  color: "#ffffff",
                }}
              >
                ElevenLabs
              </button>
              <button
                onClick={() => setTTSEngine("cartesia")}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
                  ttsEngine !== "cartesia" && "hover:bg-white/5",
                )}
                style={{
                  backgroundColor:
                    ttsEngine === "cartesia" ? "#ff8a3d" : "#2a2a2a",
                  color: "#ffffff",
                }}
              >
                Cartesia
              </button>
            </div>
          </div>

          {/* ElevenLabs Settings */}
          {ttsEngine === "elevenlabs" && (
            <div className="space-y-4">
              <div>
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: "#ffffff" }}
                >
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={elevenLabsApiKey}
                    onChange={(e) => setElevenLabsApiKey(e.target.value)}
                    className="flex-1 p-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: "#2a2a2a",
                      color: "#ffffff",
                      borderColor: "#333333",
                      borderWidth: "1px",
                    }}
                    placeholder="Your ElevenLabs API key"
                  />
                  <button
                    onClick={saveElevenLabsApiKey}
                    className="px-3 py-2 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: "#3a3a3a",
                      color: "#ffffff",
                    }}
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: "#999999" }}>
                  Your API key is stored locally in your browser
                </p>
              </div>

              <div>
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: "#ffffff" }}
                >
                  Custom Voice ID
                </label>
                <input
                  type="text"
                  value={elevenLabsCustomVoiceId}
                  onChange={(e) =>
                    setElevenLabsCustomVoiceId(e.target.value)
                  }
                  placeholder="Enter custom voice ID (optional)"
                  className="w-full p-2 rounded-lg text-sm mb-3"
                  style={{
                    backgroundColor: "#2a2a2a",
                    color: "#ffffff",
                    borderColor: "#333333",
                    borderWidth: "1px",
                  }}
                />
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: "#ffffff" }}
                >
                  Voice ID{" "}
                  {elevenLabsCustomVoiceId.trim()
                    ? "(Dropdown - will be ignored if custom ID is set)"
                    : ""}
                </label>
                <select
                  value={elevenLabsVoiceId}
                  onChange={(e) => setElevenLabsVoiceId(e.target.value)}
                  className="w-full p-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "#2a2a2a",
                    color: "#ffffff",
                    borderColor: "#333333",
                    borderWidth: "1px",
                    opacity: elevenLabsCustomVoiceId.trim() ? 0.6 : 1,
                  }}
                  disabled={elevenLabsCustomVoiceId.trim() !== ""}
                >
                  {ELEVENLABS_SAMPLE_VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} ({voice.id})
                    </option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: "#999999" }}>
                  {elevenLabsCustomVoiceId.trim()
                    ? `Using custom voice ID: ${elevenLabsCustomVoiceId}`
                    : "You can use any ElevenLabs voice ID. Enter a custom ID above or select from samples."}
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label
                    className="text-sm font-medium"
                    style={{ color: "#ffffff" }}
                  >
                    Speed: {elevenLabsSpeed.toFixed(1)}x
                  </label>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={elevenLabsSpeed}
                  onChange={(e) =>
                    setElevenLabsSpeed(Number(e.target.value))
                  }
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ backgroundColor: "#2a2a2a" }}
                />
                <div
                  className="flex justify-between text-xs mt-1"
                  style={{ color: "#999999" }}
                >
                  <span>Slow (0.5x)</span>
                  <span>Normal (1.0x)</span>
                  <span>Fast (2.0x)</span>
                </div>
              </div>
            </div>
          )}

          {/* Cartesia Settings */}
          {ttsEngine === "cartesia" && (
            <div className="space-y-4">
              <div>
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: "#ffffff" }}
                >
                  API Key
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={cartesiaApiKey}
                    onChange={(e) => setCartesiaApiKey(e.target.value)}
                    className="flex-1 p-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: "#2a2a2a",
                      color: "#ffffff",
                      borderColor: "#333333",
                      borderWidth: "1px",
                    }}
                    placeholder="Your Cartesia API key"
                  />
                  <button
                    onClick={saveCartesiaApiKey}
                    className="px-3 py-2 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: "#3a3a3a",
                      color: "#ffffff",
                    }}
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs mt-1" style={{ color: "#999999" }}>
                  Your API key is stored locally in your browser
                </p>
              </div>

              <div>
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: "#ffffff" }}
                >
                  Custom Voice ID
                </label>
                <input
                  type="text"
                  value={cartesiaCustomVoiceId}
                  onChange={(e) =>
                    setCartesiaCustomVoiceId(e.target.value)
                  }
                  placeholder="Enter custom voice ID (optional)"
                  className="w-full p-2 rounded-lg text-sm mb-3"
                  style={{
                    backgroundColor: "#2a2a2a",
                    color: "#ffffff",
                    borderColor: "#333333",
                    borderWidth: "1px",
                  }}
                />
                <label
                  className="text-sm font-medium mb-2 block"
                  style={{ color: "#ffffff" }}
                >
                  Voice ID{" "}
                  {cartesiaCustomVoiceId.trim()
                    ? "(Dropdown - will be ignored if custom ID is set)"
                    : ""}
                </label>
                <select
                  value={cartesiaVoiceId}
                  onChange={(e) => setCartesiaVoiceId(e.target.value)}
                  className="w-full p-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: "#2a2a2a",
                    color: "#ffffff",
                    borderColor: "#333333",
                    borderWidth: "1px",
                    opacity: cartesiaCustomVoiceId.trim() ? 0.6 : 1,
                  }}
                  disabled={cartesiaCustomVoiceId.trim() !== ""}
                >
                  {CARTESIA_SAMPLE_VOICES.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} ({voice.id})
                    </option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: "#999999" }}>
                  {cartesiaCustomVoiceId.trim()
                    ? `Using custom voice ID: ${cartesiaCustomVoiceId}`
                    : "You can use any Cartesia voice ID. Enter a custom ID above or select from samples."}
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label
                    className="text-sm font-medium"
                    style={{ color: "#ffffff" }}
                  >
                    Speed: {cartesiaSpeed.toFixed(1)}
                  </label>
                </div>
                <input
                  type="range"
                  min="-2.0"
                  max="2.0"
                  step="0.1"
                  value={cartesiaSpeed}
                  onChange={(e) =>
                    setCartesiaSpeed(Number(e.target.value))
                  }
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                  style={{ backgroundColor: "#2a2a2a" }}
                />
                <div
                  className="flex justify-between text-xs mt-1"
                  style={{ color: "#999999" }}
                >
                  <span>Slow (-2.0)</span>
                  <span>Normal (0.0)</span>
                  <span>Fast (2.0)</span>
                </div>
              </div>
            </div>
          )}

          {/* MascotBot Settings Info */}
          {ttsEngine === "mascotbot" && (
            <div
              className="p-4 rounded-lg"
              style={{ backgroundColor: "#2a2a2a" }}
            >
              <p className="text-sm" style={{ color: "#ffffff" }}>
                MascotBot TTS uses the default voice. No additional
                configuration is required.
              </p>
              <p className="text-xs mt-2" style={{ color: "#999999" }}>
                MascotBot provides high-quality voices optimized for mascot
                animations with built-in viseme support.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );

  return typeof window !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
}
