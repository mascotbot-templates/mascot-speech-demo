/**
 * Proxy API route for visemes-audio, optimized with proper HTTP connection pooling.
 *
 * This handles:
 * 1. Authorization on the server-side (API key stays server-only).
 * 2. CORS preflight caching.
 * 3. Streaming SSE data from the Mascot Bot API to the client.
 * 4. Using undici Pool to maintain warm connection pools to the upstream API,
 *    eliminating cold start latency through proper connection reuse.
 *
 * Adapted from the MascotBot production API route.
 */
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { Readable } from "stream";
import {
  getCurrentPoolSize,
  getPoolState,
  hasWarmConnections,
  initializePool,
  makePooledRequest,
  recordColdConnectionUsage,
  recordWarmConnectionUsage,
  warmUpConnection,
} from "../../../lib/connection-pool";

// Cache preflight responses for 24 hours (86400 seconds)
const PREFLIGHT_CACHE_MAX_AGE = 86400;

// Force Next.js to treat this as a dynamic route (never cached)
export const dynamic = "force-dynamic";

// Helper to log headers, redacting sensitive ones.
function logHeaders(label: string, headers: Headers) {
  const headersObj: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === "authorization" ||
      lowerKey === "cookie" ||
      lowerKey.includes("key")
    ) {
      headersObj[key] = "[REDACTED]";
    } else {
      headersObj[key] = value;
    }
  });
  console.log(`${label}:`, JSON.stringify(headersObj, null, 2));
}

// Initialize the pool when the module is first loaded in a new instance.
initializePool();

// --- API Route Handlers ---

/**
 * Handles OPTIONS preflight requests for CORS.
 * Caches the response to speed up subsequent requests from the same client.
 */
export async function OPTIONS(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[Proxy OPTIONS ${requestId}] Handling preflight request.`);

  const accessControlRequestMethod =
    request.headers.get("access-control-request-method") || "POST";
  const accessControlRequestHeaders =
    request.headers.get("access-control-request-headers") ||
    "content-type, authorization";

  const responseHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": accessControlRequestMethod,
    "Access-Control-Allow-Headers": accessControlRequestHeaders,
    "Access-Control-Max-Age": PREFLIGHT_CACHE_MAX_AGE.toString(),
  };

  return new Response(null, {
    status: 204,
    headers: responseHeaders,
  });
}

/**
 * Handles POST requests, proxying them to the Mascot Bot API.
 * Uses warm connection pool and keeps it warm for subsequent requests.
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();
  console.log(`[Proxy POST ${requestId}] Received request.`);
  logHeaders(`[Proxy POST ${requestId}] Request Headers`, request.headers);

  // ---------------------------------------------------------------------------
  // CRON WARM-UP: Uncomment the block below to enable Vercel cron-based pool
  // warming. This keeps connection pools hot between user requests on Vercel
  // serverless deployments. To use it:
  //
  // 1. Add to your vercel.json:
  //    { "crons": [{ "path": "/api/visemes-audio", "schedule": "*/5 * * * *" }] }
  //
  // 2. Uncomment the cron detection and warm-up block below.
  // ---------------------------------------------------------------------------
  //
  // const userAgent = request.headers.get("user-agent") || "";
  // const hasVercelOIDCToken = request.headers.has("x-vercel-oidc-token");
  // const referer = request.headers.get("referer") || "";
  // const isCronWarmup = hasVercelOIDCToken && !referer && !userAgent.includes("Mozilla");
  //
  // if (isCronWarmup) {
  //   console.log(`[Proxy POST ${requestId}] VERCEL CRON JOB detected - running comprehensive warm-up`);
  //   const currentPoolSize = getCurrentPoolSize();
  //   console.log(`[Proxy POST ${requestId}] Starting ${currentPoolSize * 2} parallel warm-up requests`);
  //
  //   const warmupPromises: Promise<void>[] = [];
  //   for (let i = 0; i < currentPoolSize * 2; i++) {
  //     const warmupPromise = (async () => {
  //       try {
  //         const { response: apiResponse, duration: fetchDuration } = await makePooledRequest({
  //           text: `Cron warmup test ${i + 1}`,
  //           voice: "en-US-Male-1",
  //         });
  //         await apiResponse.body.text();
  //         console.log(`[Proxy POST ${requestId}] Warmup ${i + 1}/${currentPoolSize * 2}: Status ${apiResponse.statusCode}, Latency: ${fetchDuration}ms`);
  //       } catch (error) {
  //         console.error(`[Proxy POST ${requestId}] Warmup ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
  //       }
  //     })();
  //     warmupPromises.push(warmupPromise);
  //   }
  //
  //   waitUntil(Promise.all(warmupPromises));
  //   waitUntil(warmUpConnection());
  //
  //   return NextResponse.json({
  //     success: true,
  //     type: "vercel-cron-warmup",
  //     message: `Triggered ${currentPoolSize * 2} warm-up requests from same instance`,
  //     poolSize: currentPoolSize,
  //     requestId: requestId,
  //   });
  // }

  // Check connection pool state before making the request
  const hasWarm = hasWarmConnections();
  const poolState = getPoolState();

  if (hasWarm) {
    console.log(
      `[Proxy POST ${requestId}] USING WARM CONNECTION - Pool: ${poolState.connected} connected, ${poolState.running} running, ${poolState.free} free`,
    );
  } else {
    console.log(
      `[Proxy POST ${requestId}] COLD CONNECTION - Pool: ${poolState.connected} connected, ${poolState.running} running, ${poolState.free} free`,
    );
  }

  // Schedule background warm-up to maintain the connection pool.
  // waitUntil does not block the response from being sent.
  waitUntil(warmUpConnection());

  try {
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error(
        `[Proxy POST ${requestId}] Failed to parse JSON body:`,
        error,
      );
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 },
      );
    }

    // Basic validation
    if (!body.text || !body.voice) {
      return NextResponse.json(
        { error: "Missing required fields: text and voice are required." },
        { status: 400 },
      );
    }

    // TTS engine validation
    const isTTSElevenLabs = body.tts_engine === "elevenlabs";
    const isTTSCartesia = body.tts_engine === "cartesia";

    if ((isTTSElevenLabs || isTTSCartesia) && !body.tts_api_key) {
      return NextResponse.json(
        {
          error: `Missing required field for ${body.tts_engine}: tts_api_key is required.`,
        },
        { status: 400 },
      );
    }

    // Make the actual API call using the undici Pool for proper connection reuse
    console.log(
      `[Proxy POST ${requestId}] Forwarding request to API using undici pool.`,
    );

    const { response: apiResponse, duration: fetchDuration } =
      await makePooledRequest(body);

    const connectionType = hasWarm ? "WARM" : "COLD";

    // Record connection usage for dynamic scaling
    if (hasWarm) {
      recordWarmConnectionUsage();
    } else {
      recordColdConnectionUsage();
    }

    console.log(
      `[Proxy POST ${requestId}] ${connectionType} connection used (undici pool). Status: ${apiResponse.statusCode}. Latency: ${fetchDuration}ms. Total Time: ${Date.now() - startTime}ms.`,
    );

    // Handle errors from the target API
    if (apiResponse.statusCode >= 400) {
      const errorBody = await apiResponse.body.text();
      console.error(
        `[Proxy POST ${requestId}] Upstream API error: ${errorBody}`,
      );
      return NextResponse.json(
        { error: `API error: ${apiResponse.statusCode}`, details: errorBody },
        { status: apiResponse.statusCode },
      );
    }

    // Convert undici response body to a ReadableStream for Next.js
    const readableStream = new ReadableStream({
      start(controller) {
        const nodeStream = Readable.from(apiResponse.body);

        nodeStream.on("data", (chunk) => {
          controller.enqueue(chunk);
        });

        nodeStream.on("end", () => {
          controller.close();
        });

        nodeStream.on("error", (error) => {
          controller.error(error);
        });
      },
    });

    const responseHeaders = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    };

    console.log(
      `[Proxy POST ${requestId}] Streaming response to client. Total Time: ${Date.now() - startTime}ms.`,
    );
    return new Response(readableStream, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(
      `[Proxy POST ${requestId}] Unhandled error: ${error.message}`,
      error.stack,
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// CRON WARM-UP (GET handler): Uncomment to enable Vercel cron warm-up via GET.
// Vercel cron jobs make GET requests by default. This handler triggers
// lightweight OPTIONS warm-ups to keep the pool hot without consuming API credits.
//
// export async function GET(request: NextRequest) {
//   const requestId = crypto.randomUUID().slice(0, 8);
//   const startTime = Date.now();
//   console.log(`[Proxy GET ${requestId}] Received request.`);
//
//   const userAgent = request.headers.get("user-agent") || "";
//   const hasVercelOIDCToken = request.headers.has("x-vercel-oidc-token");
//   const referer = request.headers.get("referer") || "";
//   const isCronWarmup = hasVercelOIDCToken && !referer && !userAgent.includes("Mozilla");
//
//   if (isCronWarmup) {
//     console.log(`[Proxy GET ${requestId}] VERCEL CRON JOB detected - warming connection pool`);
//     const currentPoolSize = getCurrentPoolSize();
//     const warmupPromises: Promise<void>[] = [];
//     for (let i = 0; i < currentPoolSize * 2; i++) {
//       warmupPromises.push(warmUpConnection());
//     }
//     waitUntil(Promise.all(warmupPromises));
//
//     return NextResponse.json({
//       success: true,
//       type: "vercel-cron-warmup",
//       message: `Triggered ${currentPoolSize * 2} OPTIONS warm-up calls.`,
//       poolSize: currentPoolSize,
//       requestId: requestId,
//       totalTime: Date.now() - startTime,
//     });
//   }
//
//   return NextResponse.json(
//     { error: "Method Not Allowed", message: "This endpoint only accepts POST requests. GET is reserved for Vercel cron warm-up." },
//     { status: 405 },
//   );
// }
// ---------------------------------------------------------------------------
