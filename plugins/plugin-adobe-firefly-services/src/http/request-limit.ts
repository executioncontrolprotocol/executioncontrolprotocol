import { sleep as abortableSleep } from "../runtime/abort.js"

/**
 * Spaces request starts so a credential set stays under a per-minute request limit.
 * @category Http
 */
export interface RequestLimiter {
  /** Wait for this request's turn. Rejects with the abort reason if `signal` aborts while waiting. */
  acquire(signal?: AbortSignal): Promise<void>
}

/**
 * Clock seam for {@link createRequestLimiter}.
 * @category Http
 */
export interface RequestLimiterClock {
  /** Current time in milliseconds. */
  now(): number
  /** Wait `ms`, rejecting when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>
}

const systemClock: RequestLimiterClock = { now: () => Date.now(), sleep: abortableSleep }

/**
 * Create a limiter that starts at most `maxRequestsPerMinute` requests in any minute by keeping
 * `60000 / maxRequestsPerMinute` ms between starts (no bursts). Each call reserves the next free
 * slot up front, so concurrent callers queue in call order; a caller that aborts while waiting
 * gives up its slot without it being reused, which only ever errs on the slow side.
 * @category Http
 */
export function createRequestLimiter(maxRequestsPerMinute: number, clock: RequestLimiterClock = systemClock): RequestLimiter {
  const spacingMs = 60_000 / maxRequestsPerMinute
  let nextStart = Number.NEGATIVE_INFINITY
  return {
    async acquire(signal) {
      signal?.throwIfAborted()
      const now = clock.now()
      const start = Math.max(now, nextStart)
      nextStart = start + spacingMs
      if (start > now) await clock.sleep(start - now, signal)
    },
  }
}

const shared = new Map<string, RequestLimiter>()

/**
 * The limiter shared by every step in this process that uses the same client id, endpoint and limit,
 * so concurrent steps and items draw on one budget.
 * @category Http
 */
export function sharedRequestLimiter(options: { clientId: string; baseUrl?: string; maxRequestsPerMinute: number }): RequestLimiter {
  const key = JSON.stringify([options.clientId, options.baseUrl ?? "", options.maxRequestsPerMinute])
  let limiter = shared.get(key)
  if (!limiter) {
    limiter = createRequestLimiter(options.maxRequestsPerMinute)
    shared.set(key, limiter)
  }
  return limiter
}

/**
 * Forget the shared limiters (tests).
 * @category Http
 */
export function resetSharedRequestLimiters(): void {
  shared.clear()
}
