import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OpenAI API key not configured. Add OPENAI_API_KEY to your .env.local file.",
      },
      { status: 401 },
    );
  }

  try {
    const incomingForm = await req.formData();
    const audioFile = incomingForm.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided." },
        { status: 400 },
      );
    }

    // Call OpenAI transcription API directly to preserve filename/MIME type
    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "gpt-4o-mini-transcribe");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Transcribe API] OpenAI error:", errorData);
      return NextResponse.json(
        {
          error:
            errorData?.error?.message ||
            `Transcription failed (${response.status})`,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json({ text: data.text });
  } catch (error) {
    console.error("[Transcribe API] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Transcription failed",
      },
      { status: 500 },
    );
  }
}
