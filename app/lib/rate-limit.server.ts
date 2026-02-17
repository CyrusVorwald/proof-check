const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 10;
const CLEANUP_INTERVAL_MS = 60_000; // clean stale entries every minute

const ipTimestamps = new Map<string, number[]>();

let lastCleanup = Date.now();

function cleanupStaleEntries(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [ip, timestamps] of ipTimestamps) {
    const valid = timestamps.filter((t) => now - t < WINDOW_MS);
    if (valid.length === 0) {
      ipTimestamps.delete(ip);
    } else {
      ipTimestamps.set(ip, valid);
    }
  }
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function checkRateLimit(request: Request): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  cleanupStaleEntries(now);

  const ip = getClientIp(request);
  const timestamps = ipTimestamps.get(ip) ?? [];

  // Filter to only timestamps within the current window
  const windowStart = now - WINDOW_MS;
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= MAX_REQUESTS) {
    const oldestInWindow = recent[0];
    const retryAfterMs = oldestInWindow + WINDOW_MS - now;
    return { allowed: false, retryAfterMs };
  }

  recent.push(now);
  ipTimestamps.set(ip, recent);
  return { allowed: true };
}

/** Reset all state — for testing only */
export function _resetForTesting() {
  ipTimestamps.clear();
  lastCleanup = Date.now();
}
