import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetForTesting, checkRateLimit } from "./rate-limit.server";

function makeRequest(ip?: string): Request {
  const headers = new Headers();
  if (ip) {
    headers.set("cf-connecting-ip", ip);
  }
  return new Request("https://example.com/api/extract", {
    method: "POST",
    headers,
  });
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetForTesting();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const req = makeRequest("1.2.3.4");
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(req).allowed).toBe(true);
    }
  });

  it("blocks requests at the limit", () => {
    const req = makeRequest("1.2.3.4");
    for (let i = 0; i < 10; i++) {
      checkRateLimit(req);
    }
    const result = checkRateLimit(req);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns correct retryAfterMs", () => {
    const req = makeRequest("1.2.3.4");
    for (let i = 0; i < 10; i++) {
      checkRateLimit(req);
      vi.advanceTimersByTime(1000); // 1 second between each
    }
    // 10 seconds have passed, first request was at t=0, window is 60s
    // So oldest request expires at t=60000, current time is t=10000
    // retryAfterMs should be ~50000
    const result = checkRateLimit(req);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows requests again after window expires", () => {
    const req = makeRequest("1.2.3.4");
    for (let i = 0; i < 10; i++) {
      checkRateLimit(req);
    }
    expect(checkRateLimit(req).allowed).toBe(false);

    // Advance past the 1-minute window
    vi.advanceTimersByTime(61_000);

    expect(checkRateLimit(req).allowed).toBe(true);
  });

  it("tracks IPs independently", () => {
    const req1 = makeRequest("1.1.1.1");
    const req2 = makeRequest("2.2.2.2");

    for (let i = 0; i < 10; i++) {
      checkRateLimit(req1);
    }
    expect(checkRateLimit(req1).allowed).toBe(false);
    expect(checkRateLimit(req2).allowed).toBe(true);
  });

  it("handles missing IP headers gracefully", () => {
    const req = makeRequest(); // no IP header
    const result = checkRateLimit(req);
    expect(result.allowed).toBe(true);
  });

  it("uses x-forwarded-for when cf-connecting-ip is absent", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "3.3.3.3, 4.4.4.4");
    const req = new Request("https://example.com/api/extract", {
      method: "POST",
      headers,
    });

    for (let i = 0; i < 10; i++) {
      checkRateLimit(req);
    }
    expect(checkRateLimit(req).allowed).toBe(false);

    // A different IP should still be allowed
    const headers2 = new Headers();
    headers2.set("x-forwarded-for", "5.5.5.5");
    const req2 = new Request("https://example.com/api/extract", {
      method: "POST",
      headers: headers2,
    });
    expect(checkRateLimit(req2).allowed).toBe(true);
  });
});
