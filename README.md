# Mascot Speech Demo
> AI chat with animated avatars, push-to-talk, and real-time lip-sync

![Mascot Speech Demo](docs/preview.png)

## What This Demonstrates
- **`useMascotSpeech` hook** — queue-based text-to-speech with synchronized lip-sync animations
- **AI Chat mode** — conversational chat powered by OpenAI, with sentence-by-sentence streaming to the speech queue
- **Push-to-talk STT** — ElevenLabs real-time speech-to-text via WebSocket with instant recording start (token prefetching)
- **Natural lip sync** — enhanced viseme processing for more realistic mouth movements
- **Multiple avatars** — switch between NotionGuy, Panda, and Realistic Female mascots
- **Avatar customization** — NotionGuy Rive inputs (gender, outfit, accessories, etc.)
- **Multi-TTS engine support** — MascotBot (default), ElevenLabs, and Cartesia
- **Connection pooling** — undici Pool with warm TCP connections for low-latency API calls
- **TTFB tracking** — real-time time-to-first-byte display in the queue status
- **Responsive design** — mobile-adaptive layout with `Fit.Cover` on mobile, `100dvh` viewport

## Prerequisites
- Node.js 18+
- pnpm
- A [Mascot Bot](https://mascot.bot) account with API key
- An [OpenAI](https://platform.openai.com) API key (for chat mode)
- An [ElevenLabs](https://elevenlabs.io) API key (for push-to-talk STT)

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/mascotbot-templates/mascot-speech-demo.git
cd mascot-speech-demo

# 2. Add the SDK package (download from your Mascot Bot dashboard)
cp /path/to/mascotbot-sdk-react-0.1.9.tgz ./

# 3. Add your Rive mascot files (download from your Mascot Bot dashboard)
cp /path/to/notionguy.riv ./public/
cp /path/to/panda.riv ./public/
cp /path/to/girl.riv ./public/

# 4. Set up environment
cp .env.example .env.local
# Edit .env.local and add your API keys

# 5. Install and run
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the demo.

## Private Files You Need

### MascotBot SDK
- **File:** `mascotbot-sdk-react-0.1.9.tgz`
- **Location:** Place in the project root (next to `package.json`)
- **How to get:** Download from your [Mascot Bot dashboard](https://mascot.bot)

### Rive Animation Files
- **Files:** `notionguy.riv`, `panda.riv`, `girl.riv`
- **Location:** Place in `public/`
- **How to get:** Download from your [Mascot Bot dashboard](https://mascot.bot)

You can use any subset of these mascots. If you only have one `.riv` file, update the `avatars` array in `src/app/page.tsx`.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MASCOT_BOT_API_KEY` | Your Mascot Bot API key (used server-side for the proxy route) | Yes |
| `OPENAI_API_KEY` | OpenAI API key for AI chat and speech-to-text fallback | Yes |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for real-time push-to-talk STT | Yes |

### Optional: ElevenLabs / Cartesia TTS

To use third-party TTS engines, click the gear icon in the demo and enter your API keys. They're stored in your browser's localStorage — never sent to our servers.

## Architecture

```
Browser (Client)                         Server (Next.js API Routes)
─────────────────                        ──────────────────────────

  Chat Mode:
  ┌───────────────┐     POST /api/chat     ┌──────────────────┐
  │ useChat (AI)  ├──────────────────────►│ OpenAI streaming  │
  │               │◄──────────────────────│ (sentence chunks) │
  │ Sentence      │                        └──────────────────┘
  │ Streamer      │
  └───────┬───────┘
          │ speak(sentence)
          ▼
  ┌───────────────┐  POST /api/visemes     ┌──────────────────┐
  │useMascotSpeech├──────────────────────►│ Connection Pool   │
  │  (queue)      │◄──────────────────────│ → api.mascot.bot  │
  │               │  SSE (audio+visemes)   └──────────────────┘
  └───────┬───────┘
          ▼
  MascotRive (lip-sync)

  Push-to-Talk:
  ┌───────────────┐  POST /api/stt-token   ┌──────────────────┐
  │usePushToTalk  ├──────────────────────►│ ElevenLabs token  │
  │               │◄──────────────────────│ (single-use)      │
  │ AudioContext  │                        └──────────────────┘
  │ 16kHz PCM     │
  │       │       │  WebSocket (PCM→text)
  │       └───────┼──────────────────────► ElevenLabs
  │               │◄──────────────────────  Scribe v2 Realtime
  └───────┬───────┘
          │ append(transcribed text)
          ▼
        useChat → normal chat flow
```

### Push-to-Talk Flow
1. Token prefetched on page load from `/api/stt-token`
2. User clicks mic → recording starts instantly (no network wait)
3. PCM audio (16kHz) streamed via WebSocket to ElevenLabs Scribe v2
4. Real-time transcript shown as user speaks
5. User clicks send → transcribed text sent as chat message
6. AI responds → sentence streaming → speech queue → lip-sync

### Connection Pool

The API route maintains a pool of warm TCP connections to `api.mascot.bot` using [undici](https://github.com/nodejs/undici). This eliminates TCP handshake + TLS negotiation latency on each request.

- **Warm-up:** On cold start, 5 parallel OPTIONS requests establish connections (no API credits consumed)
- **Dynamic scaling:** Pool size adjusts between 5–150 based on utilization
- **Background maintenance:** Each user request triggers a background warm-up via `waitUntil`

### Speech Queue

The `useMascotSpeech` hook manages a FIFO queue of text items. Each item goes through: `pending → fetching → ready → playing → completed`. The hook handles audio decoding, viseme scheduling, and Rive animation synchronization automatically.

### Natural Lip Sync

Enabled by default with tuned parameters for realistic mouth movements. The algorithm merges rapid viseme transitions, preserves critical mouth shapes (bilabials, labiodentals), and applies key viseme preference weighting.
