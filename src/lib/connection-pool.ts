/**
 * Connection pool for maintaining warm HTTP connections to the Mascot Bot API.
 *
 * Uses undici Pool to keep TCP/TLS connections alive and reuse them across requests,
 * eliminating cold start latency. Connections are established via lightweight OPTIONS
 * requests that don't consume API credits.
 *
 * Adapted from the MascotBot production connection pool.
 */
import { waitUntil } from "@vercel/functions";
import { Dispatcher, Pool } from "undici";

// --- Shared Constants ---
const API_KEY = process.env.MASCOT_BOT_API_KEY || "";
export const TARGET_API = "https://dev.api.mascot.bot/v1/visemes-audio";
export const TARGET_ORIGIN = "https://dev.api.mascot.bot";

// Global singleton to survive Next.js module reloading in development
declare global {
  var __mascotbot_undici_pool: Pool | undefined;
}

// Create or reuse the undici Pool - this survives module reloads in development
function createOrGetPool(): Pool {
  if (!global.__mascotbot_undici_pool) {
    console.log("[Pool] Creating new undici Pool instance");
    global.__mascotbot_undici_pool = new Pool(TARGET_ORIGIN, {
      connections: 100, // Maximum number of connections
      pipelining: 1, // Number of requests per connection (1 = keep-alive only)
      keepAliveTimeout: 60000, // How long to keep idle connections (60s)
      keepAliveMaxTimeout: 120000, // Maximum keep-alive timeout (2 minutes)
      headersTimeout: 10000, // Headers timeout
      bodyTimeout: 60000, // Body timeout
      socketPath: undefined, // Use TCP sockets
      maxConcurrentStreams: 100, // Max concurrent streams per connection
    });
  } else {
    console.log("[Pool] Reusing existing undici Pool instance");
  }
  return global.__mascotbot_undici_pool;
}

// Pool configuration for scaling behavior
const POOL_CONFIG = {
  MIN_SIZE: 5, // Minimum pool size
  MAX_SIZE: 150, // Maximum pool size
  INITIAL_SIZE: 5, // Starting pool size
  SCALE_UP_THRESHOLD: 0.8, // Scale up when 80% utilization
  SCALE_DOWN_THRESHOLD: 0.2, // Scale down when 20% utilization
  EVALUATION_WINDOW: 30 * 1000, // 30 seconds evaluation window
  MIN_REQUESTS_FOR_SCALING: 5, // Minimum requests before considering scaling
};

// Dynamic pool size (starts at initial size)
let currentPoolSize = POOL_CONFIG.INITIAL_SIZE;

// A simple counter to track warm-up requests.
// In Fluid Compute, this global variable persists across invocations on the same warm instance.
let warmupRequestCount = 0;

// Connection pool state tracking
const connectionPoolState = {
  recentSuccessfulWarmups: 0, // Count of successful warmups in the last 2 minutes
  lastSuccessfulWarmupTime: 0,
  lastWarmupAttemptTime: 0,
  isPoolReady: false,
};

// Usage tracking for dynamic scaling
const usageTracking = {
  totalRequests: 0,
  warmConnectionUsed: 0,
  coldConnectionUsed: 0,
  lastScalingEvaluation: 0,
  requestsSinceLastEvaluation: 0,
  requestTimestamps: [] as number[],
  warmUsageTimestamps: [] as number[],
};

/**
 * Get the shared undici Pool for all requests to the target API.
 * This ensures all requests (warm-up and real) use the same connection pool.
 */
export function getUndiciPool(): Pool {
  return createOrGetPool();
}

/**
 * Clean up old usage tracking data to keep analysis window accurate
 */
function cleanupUsageData() {
  const now = Date.now();
  const windowStart = now - POOL_CONFIG.EVALUATION_WINDOW;

  usageTracking.requestTimestamps = usageTracking.requestTimestamps.filter(
    (timestamp) => timestamp > windowStart,
  );
  usageTracking.warmUsageTimestamps = usageTracking.warmUsageTimestamps.filter(
    (timestamp) => timestamp > windowStart,
  );
}

/**
 * Check if we should trigger a scaling evaluation (every 10 requests)
 */
function checkAndTriggerScalingEvaluation() {
  usageTracking.requestsSinceLastEvaluation++;

  if (usageTracking.requestsSinceLastEvaluation >= 10) {
    usageTracking.requestsSinceLastEvaluation = 0;
    evaluatePoolScaling();
  }
}

/**
 * Record that a request used a warm connection
 */
export function recordWarmConnectionUsage() {
  const now = Date.now();
  usageTracking.totalRequests++;
  usageTracking.warmConnectionUsed++;
  usageTracking.requestTimestamps.push(now);
  usageTracking.warmUsageTimestamps.push(now);

  cleanupUsageData();
  checkAndTriggerScalingEvaluation();
}

/**
 * Record that a request used a cold connection
 */
export function recordColdConnectionUsage() {
  const now = Date.now();
  usageTracking.totalRequests++;
  usageTracking.coldConnectionUsed++;
  usageTracking.requestTimestamps.push(now);

  cleanupUsageData();
  checkAndTriggerScalingEvaluation();
}

/**
 * Evaluate if the pool size should be adjusted based on usage patterns
 */
function evaluatePoolScaling() {
  const now = Date.now();

  // Only evaluate every 30 seconds
  if (now - usageTracking.lastScalingEvaluation < 30000) {
    return;
  }

  usageTracking.lastScalingEvaluation = now;
  cleanupUsageData();

  const recentRequests = usageTracking.requestTimestamps.length;
  const recentWarmUsage = usageTracking.warmUsageTimestamps.length;

  if (recentRequests < POOL_CONFIG.MIN_REQUESTS_FOR_SCALING) {
    console.log(
      `[Pool Scaling] Insufficient recent activity (${recentRequests} requests) for scaling evaluation`,
    );
    return;
  }

  const utilizationRate =
    recentWarmUsage /
    Math.max(connectionPoolState.recentSuccessfulWarmups, 1);
  const warmConnectionRate = recentWarmUsage / recentRequests;

  console.log(
    `[Pool Scaling] Evaluation: ${recentRequests} requests, ${recentWarmUsage} warm, utilization: ${(utilizationRate * 100).toFixed(1)}%, warm rate: ${(warmConnectionRate * 100).toFixed(1)}%, current size: ${currentPoolSize}`,
  );

  let newPoolSize = currentPoolSize;

  // Scale up if high utilization and good warm connection success rate
  if (
    utilizationRate > POOL_CONFIG.SCALE_UP_THRESHOLD &&
    warmConnectionRate > 0.5 &&
    currentPoolSize < POOL_CONFIG.MAX_SIZE
  ) {
    newPoolSize = Math.min(currentPoolSize + 2, POOL_CONFIG.MAX_SIZE);
    console.log(
      `[Pool Scaling] SCALING UP: High utilization (${(utilizationRate * 100).toFixed(1)}%) - increasing pool size from ${currentPoolSize} to ${newPoolSize}`,
    );
  }
  // Scale down if low utilization
  else if (
    utilizationRate < POOL_CONFIG.SCALE_DOWN_THRESHOLD &&
    currentPoolSize > POOL_CONFIG.MIN_SIZE
  ) {
    newPoolSize = Math.max(currentPoolSize - 1, POOL_CONFIG.MIN_SIZE);
    console.log(
      `[Pool Scaling] SCALING DOWN: Low utilization (${(utilizationRate * 100).toFixed(1)}%) - decreasing pool size from ${currentPoolSize} to ${newPoolSize}`,
    );
  }

  if (newPoolSize !== currentPoolSize) {
    const sizeDiff = newPoolSize - currentPoolSize;
    currentPoolSize = newPoolSize;

    // If scaling up, immediately warm new connections
    if (sizeDiff > 0) {
      console.log(
        `[Pool Scaling] Adding ${sizeDiff} warm-up connections immediately`,
      );
      for (let i = 0; i < sizeDiff; i++) {
        waitUntil(warmUpConnection());
      }
    }
  }
}

/**
 * Get the current dynamic pool size
 */
export function getCurrentPoolSize(): number {
  return currentPoolSize;
}

/**
 * Checks if the connection pool has established connections that can provide
 * performance benefits over cold connections, regardless of current availability.
 */
export function hasWarmConnections(): boolean {
  const pool = createOrGetPool();
  const poolStats = pool.stats;

  const connected = poolStats.connected || 0;
  const running = poolStats.running || 0;
  const pending = poolStats.pending || 0;

  const now = new Date().toISOString();
  console.log(
    `[Pool Status ${now}] Connected: ${connected}, Running: ${running}, Pending: ${pending}, Free: ${poolStats.free || 0}, Size: ${poolStats.size || 0}`,
  );

  // Warn if pool was unexpectedly reset
  if (connected === 0 && connectionPoolState.recentSuccessfulWarmups > 0) {
    const timeSinceLastWarmup =
      Date.now() - connectionPoolState.lastSuccessfulWarmupTime;
    console.log(
      `[Pool Warning ${now}] Connection pool was reset! Previous warmups: ${connectionPoolState.recentSuccessfulWarmups}, Time since last warmup: ${timeSinceLastWarmup}ms`,
    );
  }

  return connected > 0;
}

/**
 * Checks if there are immediately available warm connections (not currently in use)
 */
export function hasAvailableWarmConnections(): boolean {
  const pool = createOrGetPool();
  const poolStats = pool.stats;

  const connected = poolStats.connected || 0;
  const running = poolStats.running || 0;

  return connected > 0 && connected > running;
}

/**
 * Gets information about the current pool state for logging
 */
export function getPoolState() {
  const now = Date.now();
  cleanupUsageData();

  const pool = createOrGetPool();
  const poolStats = pool.stats;

  return {
    connected: poolStats.connected || 0,
    free: poolStats.free || 0,
    pending: poolStats.pending || 0,
    queued: poolStats.queued || 0,
    running: poolStats.running || 0,
    size: poolStats.size || 0,
    recentSuccessfulWarmups: connectionPoolState.recentSuccessfulWarmups,
    isReady: connectionPoolState.isPoolReady,
    timeSinceLastSuccess: now - connectionPoolState.lastSuccessfulWarmupTime,
    lastWarmupTime: connectionPoolState.lastWarmupAttemptTime,
    currentPoolSize: currentPoolSize,
    recentRequests: usageTracking.requestTimestamps.length,
    recentWarmUsage: usageTracking.warmUsageTimestamps.length,
    utilizationRate:
      usageTracking.warmUsageTimestamps.length /
      Math.max(connectionPoolState.recentSuccessfulWarmups, 1),
  };
}

/**
 * Clean up old warm-up records to keep the count accurate
 */
function cleanupOldWarmups() {
  const now = Date.now();
  const twoMinutesAgo = now - 2 * 60 * 1000;

  if (connectionPoolState.lastSuccessfulWarmupTime < twoMinutesAgo) {
    connectionPoolState.recentSuccessfulWarmups = 0;
  }
}

/**
 * Sends an authenticated OPTIONS request using the shared undici Pool to establish
 * a warm TCP connection in the SAME connection pool that POST requests will use.
 * Since OPTIONS requests don't process request bodies, no API credits are consumed,
 * but the authenticated connection is established for reuse.
 */
export async function warmUpConnection() {
  const warmupId = warmupRequestCount++;
  const startTime = Date.now();

  const pool = createOrGetPool();
  const beforeStats = pool.stats;

  console.log(
    `[Warm-up ${warmupId}] Starting - Pool before: ${beforeStats.connected || 0} connected, ${beforeStats.running || 0} running (pool size: ${currentPoolSize})`,
  );
  connectionPoolState.lastWarmupAttemptTime = startTime;

  cleanupOldWarmups();

  try {
    const response = await pool.request({
      path: "/v1/visemes-audio",
      method: "OPTIONS",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Origin:
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
      },
    });

    const duration = Date.now() - startTime;

    console.log(
      `[Warm-up ${warmupId}] Connection established using undici pool. Status: ${response.statusCode}, Duration: ${duration}ms`,
    );

    const afterStats = pool.stats;
    console.log(
      `[Warm-up ${warmupId}] Pool status after warm-up: ${afterStats.connected || 0} connected, ${afterStats.running || 0} running, ${afterStats.free || 0} free`,
    );

    connectionPoolState.recentSuccessfulWarmups = Math.min(
      connectionPoolState.recentSuccessfulWarmups + 1,
      currentPoolSize * 2,
    );
    connectionPoolState.lastSuccessfulWarmupTime = Date.now();
    connectionPoolState.isPoolReady = true;

    evaluatePoolScaling();
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[Warm-up ${warmupId}] Failed to establish connection after ${duration}ms:`,
      error,
    );
  }
}

/**
 * Initializes the connection pool by sending multiple concurrent authenticated OPTIONS requests
 * using the shared undici Pool to establish warm TCP connections. Called automatically when the
 * API route module is first loaded in a new serverless instance.
 */
export function initializePool() {
  const pool = createOrGetPool();

  const poolStats = pool.stats;
  const connected = poolStats.connected || 0;

  if (connected > 0) {
    console.log(
      `[Init] Pool already has ${connected} connections, skipping initialization`,
    );
    return;
  }

  console.log(
    `[Init] NEW SERVERLESS INSTANCE - Initializing connection pool with undici Pool (${currentPoolSize} warm-up requests, min: ${POOL_CONFIG.MIN_SIZE}, max: ${POOL_CONFIG.MAX_SIZE})`,
  );

  // Reset pool state for new instance
  connectionPoolState.recentSuccessfulWarmups = 0;
  connectionPoolState.isPoolReady = false;
  connectionPoolState.lastWarmupAttemptTime = Date.now();
  connectionPoolState.lastSuccessfulWarmupTime = 0;

  // Reset usage tracking
  usageTracking.totalRequests = 0;
  usageTracking.warmConnectionUsed = 0;
  usageTracking.coldConnectionUsed = 0;
  usageTracking.lastScalingEvaluation = 0;
  usageTracking.requestsSinceLastEvaluation = 0;
  usageTracking.requestTimestamps = [];
  usageTracking.warmUsageTimestamps = [];

  // Fire off warm-up requests in parallel without blocking.
  // The first user request can proceed immediately while the pool warms up.
  for (let i = 0; i < currentPoolSize; i++) {
    waitUntil(warmUpConnection());
  }
}

/**
 * Make a POST request using the undici pool for proper connection reuse.
 */
export async function makePooledRequest(
  body: any,
): Promise<{ response: Dispatcher.ResponseData; duration: number }> {
  const startTime = Date.now();

  const pool = createOrGetPool();

  const response = await pool.request({
    path: "/v1/visemes-audio",
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream, */*",
    },
    body: JSON.stringify(body),
  });

  const duration = Date.now() - startTime;

  return { response, duration };
}
