import { NextResponse } from "next/server";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

const DEFAULT_SYSTEM_PROMPT = `You are a friendly, playful mascot assistant. Keep your responses concise — typically 2 to 4 sentences. Be energetic and fun. Do not use markdown formatting, emojis, bullet points, numbered lists, or special characters in your responses. Write in plain, natural sentences because your text will be spoken aloud through text-to-speech.`;

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
    const { messages, systemPrompt } = await req.json();

    const openai = createOpenAI({ apiKey });

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt || DEFAULT_SYSTEM_PROMPT,
      messages,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 },
    );
  }
}
