import { NextResponse } from "next/server";

/**
 * Generate a single-use ElevenLabs token for client-side WebSocket STT.
 * The token expires after 15 minutes and is consumed on first use.
 */
export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured in .env.local" },
      { status: 401 },
    );
  }

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
        },
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[STT Token] ElevenLabs error:", errorData);
      return NextResponse.json(
        { error: errorData?.detail || `Token generation failed (${response.status})` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json({ token: data.token });
  } catch (error) {
    console.error("[STT Token] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Token generation failed" },
      { status: 500 },
    );
  }
}
