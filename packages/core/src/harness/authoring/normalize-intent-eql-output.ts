/** Fix common small-model INTENT typos before decode. @category Harness */
import {
  inferIntentFromMessageHeuristic,
  isClassifiedIntentValue,
} from "./classified-intent.js"

export function normalizeIntentEqlRawOutput(raw: string): string {
  let trimmed = raw.trim()
  if (!trimmed) return raw

  trimmed = trimmed.replace(/^INTIntent\s+([\w-]+)(.*)$/i, "INTENT $1$2")
  trimmed = trimmed.replace(/^INTENT\s+([\w-]+)\)\s*$/i, "INTENT $1")
  if (/^faq\)?$/i.test(trimmed)) {
    return "INTENT faq"
  }
  if (/^general\)?$/i.test(trimmed)) {
    return "INTENT general"
  }

  const lines = trimmed.split(/\r?\n/)
  const normalizedLines = lines.map((line) => {
    const intentMatch = line.match(
      /^INTENT\s+([\w-]+)(?:\s+TOPIC\s+(\S+))?(?:\s+SUMMARY\s+(.+))?$/i
    )
    if (!intentMatch) {
      return line
    }
    const [, intentValue, topic, summaryRest] = intentMatch
    let result = `INTENT ${intentValue}`
    if (topic) {
      result += ` TOPIC ${topic}`
    }
    if (summaryRest) {
      const summary = summaryRest.trim()
      if (!summary.startsWith('"') && !summary.startsWith("'")) {
        result += ` SUMMARY "${summary.replace(/"/g, '\\"')}"`
      } else {
        result += ` SUMMARY ${summary}`
      }
    }
    return result
  })

  return normalizedLines.join("\n")
}

/**
 * Map invalid INTENT tokens to a canonical value using message heuristics.
 * @category Harness
 */
export function coerceIntentEqlRawOutput(raw: string, message: string): string {
  const normalized = normalizeIntentEqlRawOutput(raw)
  const match = normalized.match(/^INTENT\s+(\S+)/im)
  if (!match) {
    return normalized
  }
  const token = match[1]!.toLowerCase().replace(/\)$/, "")
  if (isClassifiedIntentValue(token)) {
    return normalized
  }
  const heuristic = inferIntentFromMessageHeuristic(message)
  if (heuristic) {
    return normalized.replace(/^INTENT\s+\S+/im, `INTENT ${heuristic}`)
  }
  return normalized
}
