import type { ProbeContext } from "@executioncontrolprotocol/types"

/** Max options listed in prompt summaries before truncation. @category Harness */
export const PROBE_CONTEXT_OPTION_PROMPT_LIMIT = 24

/**
 * Format {@link ProbeContext} as prompt lines for clarify / complete shots.
 * @category Harness
 */
export function summarizeProbeContext(probe: ProbeContext): string[] {
  const lines = [
    `Probe domain: ${probe.domain}`,
    `Probe summary: ${probe.summary}`,
  ]
  if (probe.cursor) {
    lines.push(`Probe cursor: ${probe.cursor}`)
  }
  if (probe.stepAs) {
    lines.push(`Probe step .as: ${probe.stepAs}`)
  }

  if (probe.options.length === 0) {
    lines.push("Probe options: (none)")
    return lines
  }

  const limited = probe.options.slice(0, PROBE_CONTEXT_OPTION_PROMPT_LIMIT)
  lines.push("Probe options:")
  for (const option of limited) {
    const path = option.path ? ` path=${option.path}` : ""
    lines.push(`- ${option.label} (id=${option.id})${path}`)
  }
  if (probe.options.length > limited.length) {
    lines.push(`- ...and ${probe.options.length - limited.length} more`)
  }
  return lines
}

/**
 * True when the user message already names enough probe options to skip a redundant ask.
 * @category Harness
 */
export function messageSelectsProbeOptions(
  message: string,
  probe: ProbeContext,
  minMatches = 1
): boolean {
  const lower = message.toLowerCase()
  let matches = 0
  for (const option of probe.options) {
    if (
      lower.includes(option.label.toLowerCase()) ||
      lower.includes(option.id.toLowerCase())
    ) {
      matches += 1
    }
  }
  return matches >= minMatches
}
