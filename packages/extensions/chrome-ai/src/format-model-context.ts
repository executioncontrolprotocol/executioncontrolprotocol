/**
 * Format resolved model `context` input for Chrome LanguageModel prompt() text.
 * @category Extensions
 */
export function formatModelContextForPrompt(context: unknown): string {
  if (context === undefined || context === null) {
    return ""
  }
  if (typeof context === "string") {
    return context
  }
  if (
    typeof context === "object" &&
    "text" in context &&
    typeof (context as { text: unknown }).text === "string"
  ) {
    return (context as { text: string }).text
  }
  return JSON.stringify(context)
}

/**
 * Append optional context after the user prompt for Chrome single-string prompt() calls.
 * @category Extensions
 */
export function buildChromePromptWithContext(prompt: string, context?: unknown): string {
  const ctxText = formatModelContextForPrompt(context)
  if (!ctxText.trim()) {
    return prompt
  }
  return `${prompt.trimEnd()}\n\n${ctxText}`
}
