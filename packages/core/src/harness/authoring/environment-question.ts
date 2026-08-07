/**
 * True when the user message asks about extensions, capabilities, or environment inventory.
 * @category Harness
 */
export function isEnvironmentQuestion(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    /\b(extensions?|capabilities|plugins?|registered|available|what can you do|what are you good at)\b/.test(
      lower
    ) ||
    /\blist\b.*\b(capabilit|extension|plugin)/.test(lower) ||
    /\bwhat\b.*\b(in this environment|loaded)\b/.test(lower)
  )
}
