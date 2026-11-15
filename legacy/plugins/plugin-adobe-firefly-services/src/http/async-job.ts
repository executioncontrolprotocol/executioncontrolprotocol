import type { AdobeHttpClient } from "./client.js"

/**
 * Options for polling an async Adobe job status URL.
 * @category Http
 */
export interface PollAdobeJobOptions {
  /** Absolute status URL returned by a 202-style submit call. */
  statusUrl: string
  /** HTTP client. */
  client: AdobeHttpClient
  /** Poll interval ms. */
  intervalMs?: number
  /** Max wait ms. */
  timeoutMs?: number
  /** Status field name on JSON body (default \`status\`). */
  statusField?: string
  /** Status values treated as success. */
  successStatuses?: string[]
  /** Status values treated as failure. */
  failureStatuses?: string[]
}

/**
 * Extract a status / result polling URL from an Adobe async accept payload.
 * @category Http
 */
export function extractAdobeStatusUrl(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined
  const record = body as Record<string, unknown>

  const directCandidates = [record.statusUrl, record.statusURL, record.status]
  for (const c of directCandidates) {
    if (typeof c === "string" && /^https?:\/\//i.test(c)) return c
  }

  // Substance 3D job objects use `url` for the status resource.
  if (typeof record.url === "string" && /^https?:\/\//i.test(record.url)) {
    return record.url
  }

  const links = record._links
  if (links && typeof links === "object") {
    const self = (links as { self?: { href?: string } }).self
    if (typeof self?.href === "string" && /^https?:\/\//i.test(self.href)) return self.href
  }

  const namedLinks = record.links
  if (namedLinks && typeof namedLinks === "object") {
    const bag = namedLinks as Record<string, unknown>
    for (const key of ["status", "result", "self"]) {
      const entry = bag[key]
      if (entry && typeof entry === "object") {
        const href = (entry as { href?: string }).href
        if (typeof href === "string" && /^https?:\/\//i.test(href)) return href
      }
    }
    // Firefly AsyncTaskResponse: record of { href, type? }
    for (const entry of Object.values(bag)) {
      if (!entry || typeof entry !== "object") continue
      const row = entry as { href?: string; type?: string }
      if (row.type === "result" && typeof row.href === "string" && /^https?:\/\//i.test(row.href)) {
        return row.href
      }
    }
    for (const entry of Object.values(bag)) {
      if (!entry || typeof entry !== "object") continue
      const href = (entry as { href?: string }).href
      if (typeof href === "string" && /^https?:\/\//i.test(href)) return href
    }
  }

  return undefined
}

/**
 * Poll an Adobe async job until success, failure, or timeout.
 * @category Http
 */
export async function pollAdobeJob(options: PollAdobeJobOptions): Promise<unknown> {
  const intervalMs = options.intervalMs ?? 2000
  const timeoutMs = options.timeoutMs ?? 120_000
  const statusField = options.statusField ?? "status"
  const success = new Set(
    (options.successStatuses ?? [
      "succeeded",
      "success",
      "completed",
      "done",
      "partially_succeeded",
      "partialsuccess",
    ]).map((s) => s.toLowerCase()),
  )
  const failure = new Set(
    (options.failureStatuses ?? ["failed", "error", "cancelled", "canceled"]).map((s) =>
      s.toLowerCase(),
    ),
  )

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const body = (await options.client.request({
      method: "GET",
      url: options.statusUrl,
    })) as Record<string, unknown>

    const raw = body[statusField]
    const status = typeof raw === "string" ? raw.toLowerCase() : ""
    if (success.has(status)) return body
    if (failure.has(status)) {
      throw new Error(`Adobe async job failed with status=${String(raw)}`)
    }
    // Some payloads omit status until complete; treat missing status as still running.
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Adobe async job timed out after ${timeoutMs}ms: ${options.statusUrl}`)
}
