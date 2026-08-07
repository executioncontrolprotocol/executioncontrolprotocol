import type { EcpFormatOptions, ExprValue, InputValue } from "@executioncontrolprotocol/types"
import type { EqlFormatOptions } from "../schemas.js"
import { resolveEqlOptions } from "../schemas.js"

export class EqlWriter {
  private readonly indent: number
  readonly quote: "auto" | "always"
  private lines: string[] = []

  constructor(options?: EcpFormatOptions & EqlFormatOptions) {
    const resolved = resolveEqlOptions(options)
    this.indent = resolved.indent
    this.quote = resolved.quote
  }

  writeln(text: string, depth = 0): void {
    this.lines.push(" ".repeat(depth * this.indent) + text)
  }

  toString(): string {
    return this.lines.join("\n")
  }
}

export function formatLiteral(value: unknown, quote: "auto" | "always"): string {
  if (value === null) return "null"
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") {
    if (quote === "always" || /[\s"'=]/.test(value)) {
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
    }
    return value
  }
  if (typeof value === "object") {
    return JSON.stringify(value)
  }
  return String(value)
}

export function formatInputValue(
  key: string,
  value: InputValue,
  depth: number,
  writer: EqlWriter
): void {
  if (value !== null && typeof value === "object" && "$ref" in value) {
    const ref = String((value as { $ref: string }).$ref)
    const display = ref.startsWith("state.") ? ref.slice(6) : ref
    writer.writeln(`WITH ${key} = REF ${display}`, depth)
    return
  }
  if (value !== null && typeof value === "object" && "$state" in value) {
    writer.writeln(`WITH ${key} = STATE ${(value as { $state: string }).$state}`, depth)
    return
  }
  writer.writeln(`WITH ${key} = ${formatLiteral(value, writer.quote)}`, depth)
}

export function formatWhen(when: ExprValue, depth: number, writer: EqlWriter): void {
  if ("eq" in when && Array.isArray(when.eq)) {
    const [path, val] = when.eq
    const display = String(path).startsWith("state.") ? String(path).slice(6) : String(path)
    writer.writeln(`WHEN ${display} == ${formatLiteral(val, writer.quote)}`, depth)
  }
}
