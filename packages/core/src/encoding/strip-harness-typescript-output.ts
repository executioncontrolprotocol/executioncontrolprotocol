import { stripMarkdownCodeFences } from "./strip-markdown-fences.js"

const FORMAT_LANGUAGE_LINE = /^(?:typescript|ts|javascript|js)$/i
const TYPESCRIPT_FENCE = /^```(?:typescript|ts)\s*$/i

/**
 * Normalize model text before compiling harness TypeScript (workflow, intent, reply).
 * Strips markdown fences, a lone leading "typescript" line, and common trailing typos.
 * @category Encoding
 */
export function stripHarnessTypeScriptOutput(text: string): string {
  let trimmed = stripMarkdownCodeFences(text).trim()

  const wholeTs = /^```(?:typescript|ts)\s*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(trimmed)
  if (wholeTs) {
    trimmed = wholeTs[1].trim()
  } else {
    const blockTs = /```(?:typescript|ts)\s*\r?\n([\s\S]*?)\r?\n```/i.exec(trimmed)
    if (blockTs) {
      trimmed = blockTs[1].trim()
    } else {
      const lines = trimmed.split(/\r?\n/)
      if (TYPESCRIPT_FENCE.test(lines[0] ?? "")) {
        lines.shift()
        while (lines.length > 0 && /^```\s*$/.test(lines[lines.length - 1] ?? "")) {
          lines.pop()
        }
        trimmed = lines.join("\n").trim()
      }
    }
  }

  const lines = trimmed.split(/\r?\n/)
  while (lines.length > 0 && FORMAT_LANGUAGE_LINE.test(lines[0]!.trim())) {
    lines.shift()
  }
  trimmed = lines.join("\n").trim()

  trimmed = trimmed.replace(/\]\s*\)\s*;\s*\)\s*:\s*\)\s*;?\s*$/s, "]);")
  trimmed = trimmed.replace(/\]\s*\)\s*;\s*\)\s*:/g, "]);")

  return trimmed
}
