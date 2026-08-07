import type { ParsedLine } from "./ast.js"

/** Split a line into tokens respecting quoted strings. */
export function tokenizeLine(text: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i++
    if (i >= text.length) break

    const ch = text[i]!
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let value = quote
      while (j < text.length) {
        if (text[j] === "\\" && j + 1 < text.length) {
          value += text[j]! + text[j + 1]!
          j += 2
          continue
        }
        value += text[j]!
        if (text[j] === quote) {
          j++
          break
        }
        j++
      }
      tokens.push(value)
      i = j
      continue
    }

    if (ch === "{" || ch === "[") {
      let depth = 0
      let j = i
      for (; j < text.length; j++) {
        const c = text[j]!
        if (c === "{" || c === "[") depth++
        if (c === "}" || c === "]") depth--
        if (depth === 0) {
          j++
          break
        }
      }
      tokens.push(text.slice(i, j))
      i = j
      continue
    }

    let j = i
    while (j < text.length && !/\s/.test(text[j]!)) j++
    tokens.push(text.slice(i, j))
    i = j
  }
  return tokens
}

export function parseLines(text: string): ParsedLine[] {
  const lines: ParsedLine[] = []
  const rawLines = text.replace(/\r\n/g, "\n").split("\n")
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i]!
    const trimmed = raw.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue
    const indent = raw.match(/^\s*/)?.[0].length ?? 0
    lines.push({
      line: i + 1,
      indent,
      text: trimmed,
      tokens: tokenizeLine(trimmed),
    })
  }
  return lines
}
