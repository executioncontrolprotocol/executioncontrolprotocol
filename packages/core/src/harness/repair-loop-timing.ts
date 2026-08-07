import type { HarnessRepairAttempt } from "@executioncontrolprotocol/types"

function readHarnessEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined
  return process.env[name]
}

/** Whether repair-loop per-phase timing is recorded and logged (`ECP_EVAL_DEBUG_TIMING=1`). @category Harness */
export function isHarnessTimingDebugEnabled(): boolean {
  const raw = readHarnessEnv("ECP_EVAL_DEBUG_TIMING")?.trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "on" || raw === "all"
}

function appendTimingNdjson(entry: Record<string, unknown>): void {
  if (typeof window !== "undefined") return
  const file = readHarnessEnv("ECP_EVAL_DEBUG_FILE")?.trim()
  if (!file) return
  void import("node:fs")
    .then((fs) =>
      import("node:path").then((path) => {
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8")
        } catch {
          // best-effort
        }
      })
    )
    .catch(() => {})
}

function ms(n: number): string {
  return `${Math.round(n)}ms`
}

/** Summarize generate vs evaluate ms across repair attempts. @category Harness */
export function summarizeRepairAttemptTiming(attempts: HarnessRepairAttempt[]): {
  attemptCount: number
  generateMsTotal: number
  evaluateMsTotal: number
  generateMsAvg: number
  evaluateMsAvg: number
  generateShare: number
} {
  const timed = attempts.filter(
    (a) => typeof a.generateMs === "number" || typeof a.evaluateMs === "number"
  )
  const generateMsTotal = timed.reduce((sum, a) => sum + (a.generateMs ?? 0), 0)
  const evaluateMsTotal = timed.reduce((sum, a) => sum + (a.evaluateMs ?? 0), 0)
  const total = generateMsTotal + evaluateMsTotal
  const attemptCount = timed.length
  return {
    attemptCount,
    generateMsTotal,
    evaluateMsTotal,
    generateMsAvg: attemptCount > 0 ? generateMsTotal / attemptCount : 0,
    evaluateMsAvg: attemptCount > 0 ? evaluateMsTotal / attemptCount : 0,
    generateShare: total > 0 ? generateMsTotal / total : 0,
  }
}

/** Format repair-loop timing for console debug output. @category Harness */
export function formatRepairLoopTimingReport(
  label: string,
  attempts: HarnessRepairAttempt[],
  extras?: Record<string, number | string | undefined>
): string {
  const lines: string[] = [`ECP_EVAL_DEBUG_TIMING [${label}]`]
  for (const a of attempts) {
    const gen = a.generateMs !== undefined ? ms(a.generateMs) : "?"
    const ev = a.evaluateMs !== undefined ? ms(a.evaluateMs) : "?"
    const ok = a.feedback.every((f) => f.success)
    lines.push(`  attempt ${a.attempt}: generate=${gen} evaluate=${ev} success=${ok}`)
  }
  const summary = summarizeRepairAttemptTiming(attempts)
  if (summary.attemptCount > 0) {
    lines.push(
      `  totals: generate=${ms(summary.generateMsTotal)} evaluate=${ms(summary.evaluateMsTotal)} ` +
        `(API ~${Math.round(summary.generateShare * 100)}% of loop)`
    )
  }
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value === undefined) continue
      lines.push(`  ${key}: ${typeof value === "number" ? ms(value) : value}`)
    }
  }
  return lines.join("\n")
}

/** Log repair-loop timing to stderr when {@link isHarnessTimingDebugEnabled}. @category Harness */
export function logRepairLoopTiming(
  label: string,
  attempts: HarnessRepairAttempt[],
  extras?: Record<string, number | string | undefined>
): void {
  if (!isHarnessTimingDebugEnabled()) return
  const report = formatRepairLoopTimingReport(label, attempts, extras)
  console.warn(report)
  appendTimingNdjson({
    type: "repair-loop",
    label,
    attempts: attempts.map((a) => ({
      attempt: a.attempt,
      generateMs: a.generateMs,
      evaluateMs: a.evaluateMs,
    })),
    summary: summarizeRepairAttemptTiming(attempts),
    ...extras,
  })
}
