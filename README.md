# Mascot Speech Demo
> Async speech queue demo with animated avatars, connection pooling, and multi-TTS engine support

## What This Demonstrates
- **`useMascotSpeech` hook** — queue-based text-to-speech with synchronized lip-sync animations
- **Multiple avatars** — switch between NotionGuy, Panda, and Realistic Female mascots
- **Avatar customization** — NotionGuy Rive inputs (gender, outfit, accessories, etc.)
- **Multi-TTS engine support** — MascotBot (default), ElevenLabs, and Cartesia
- **Connection pooling** — undici Pool with warm TCP connections for low-latency API calls
- **TTFB tracking** — real-time time-to-first-byte display in the queue status
- **Responsive design** — desktop and mobile layouts

## Prerequisites
- Node.js 18+
- pnpm
- A [Mascot Bot](https://mascot.bot) account with API key

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
# Edit .env.local and add your MASCOT_BOT_API_KEY

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
| `NEXT_PUBLIC_APP_URL` | Your app's URL, used for CORS Origin in warm-up requests (defaults to `http://localhost:3000`) | No |

### Optional: ElevenLabs / Cartesia TTS

To use third-party TTS engines, click the gear icon in the demo and enter your API keys. They're stored in your browser's localStorage — never sent to our servers.

## Architecture

```
Browser (Client)                         Server (Next.js API Route)
─────────────────                        ─────────────────────────
                                         ┌─────────────────────┐
useMascotSpeech({                        │ /api/visemes-audio   │
  apiEndpoint: "/api/visemes-audio"      │                     │
})                                       │ ┌─────────────────┐ │
  │                                      │ │ Connection Pool  │ │
  │  POST /api/visemes-audio             │ │ (undici Pool)    │ │
  ├─────────────────────────────────────►│ │                 │ │
  │  { text, voice, tts_engine?, ... }   │ │ Warm TCP conns  │ │
  │                                      │ │ to api.mascot.bot│ │
  │  SSE stream (audio + visemes)        │ └────────┬────────┘ │
  │◄─────────────────────────────────────│          │          │
  │                                      │          ▼          │
  ▼                                      │  api.mascot.bot     │
MascotRive (Rive canvas)                │  /v1/visemes-audio   │
  - Lip-sync from viseme events          └─────────────────────┘
  - Idle/gesture animations
```

### Connection Pool

The API route maintains a pool of warm TCP connections to `api.mascot.bot` using [undici](https://github.com/nodejs/undici). This eliminates TCP handshake + TLS negotiation latency on each request.

- **Warm-up:** On cold start, 5 parallel OPTIONS requests establish connections (no API credits consumed)
- **Dynamic scaling:** Pool size adjusts between 5–150 based on utilization
- **Background maintenance:** Each user request triggers a background warm-up via `waitUntil`
- **Vercel cron (optional):** Commented-out code in `route.ts` enables periodic cron-based warming — see the comments there for setup instructions

### Speech Queue

The `useMascotSpeech` hook manages a FIFO queue of text items. Each item goes through: `pending → fetching → ready → playing → completed`. The hook handles audio decoding, viseme scheduling, and Rive animation synchronization automatically.
