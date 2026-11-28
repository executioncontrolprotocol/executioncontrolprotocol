import { parse } from "acorn"
import type { ValidationIssue } from "@executioncontrolprotocol/protocol"

/**
 * Syntax error location inside an expression or script.
 * @category Validation
 */
export interface SyntaxFailure {
  /** One sentence. */
  message: string
  /** 1-based line in the source text. */
  line: number
  /** 1-based column in the source text. */
  column: number
}

interface LocatedNode {
  type: string
  end: number
  params?: unknown[]
  async?: boolean
  generator?: boolean
}

/**
 * Check one `if` / `end` `expression` source. Returns a failure, or undefined when it is one expression.
 * @category Validation
 */
export function checkExpression(source: string): SyntaxFailure | undefined {
  if (source.trim() === "") return { message: "Expression is empty.", line: 1, column: 1 }
  try {
    // Wrapped in parentheses so a leading `(` (e.g. an object literal) parses as one expression.
    const program = parse(`(${source}\n)`, { ecmaVersion: 2022 }) as unknown as { body: LocatedNode[] }
    if (program.body.length !== 1 || program.body[0]?.type !== "ExpressionStatement") {
      return { message: "Expression must be a single expression.", line: 1, column: 1 }
    }
    return undefined
  } catch (error) {
    const failure = fromAcorn(error, "Expression syntax is invalid.")
    const lines = source.split("\n")
    // The error can land on the wrapper's closing line when the expression ends too early.
    if (failure.line > lines.length) return { ...failure, line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
    return failure.line === 1 ? { ...failure, column: Math.max(1, failure.column - 1) } : failure
  }
}

/**
 * Check `$script` text. It is parsed and never run.
 * @category Validation
 */
export function checkScript(source: string, ecmaVersion = 2020): SyntaxFailure | undefined {
  try {
    parse(source, { ecmaVersion: ecmaVersion as 2020, allowReturnOutsideFunction: true })
    return undefined
  } catch (error) {
    return fromAcorn(error, "Script syntax is invalid.")
  }
}

/**
 * Build an expression or script issue.
 * @category Validation
 */
export function syntaxIssue(
  code: "ECP_EXPR_INVALID" | "ECP_SCRIPT_INVALID",
  path: string,
  failure: SyntaxFailure,
  nodeId?: string,
): ValidationIssue {
  return {
    code,
    severity: "error",
    message: failure.message,
    path,
    nodeId,
    line: failure.line,
    column: failure.column,
  }
}

function fromAcorn(error: unknown, fallback: string): SyntaxFailure {
  const loc = (error as { loc?: { line?: number; column?: number } }).loc
  const message = error instanceof Error ? error.message : fallback
  return {
    message: message.split("\n")[0] ?? fallback,
    line: loc?.line ?? 1,
    column: (loc?.column ?? 0) + 1,
  }
}
