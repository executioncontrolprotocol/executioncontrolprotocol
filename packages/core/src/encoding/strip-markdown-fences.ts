/**
 * Strip common markdown code fences from text before format decode.
 * @category Encoding
 */
export function stripMarkdownCodeFences(text: string): string {
  const trimmed = text.trim()
  const whole = /^```(?:json|toon|yaml)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(trimmed)
  if (whole) return whole[1].trim()

  const block = /```(?:json|toon|yaml)?\s*\r?\n([\s\S]*?)\r?\n```/i.exec(trimmed)
  if (block) return block[1].trim()

  const lines = trimmed.split(/\r?\n/)
  if (/^```(?:json|toon|yaml)?\s*$/i.test(lines[0] ?? "")) {
    lines.shift()
    while (lines.length > 0 && /^```\s*$/.test(lines[lines.length - 1] ?? "")) {
      lines.pop()
    }
    return lines.join("\n").trim()
  }

  return trimmed
}
