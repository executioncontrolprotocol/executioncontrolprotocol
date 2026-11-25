import { parse, parseExpressionAt } from "acorn"
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
 * Check one `expr` or `$expr` source. Returns a failure, or undefined when it is a single function.
 * @category Validation
 */
export function checkExpression(source: string): SyntaxFailure | undefined {
  try {
    const node = parseExpressionAt(source, 0, { ecmaVersion: 2022 }) as LocatedNode
    if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") {
      return { message: "Expression must be a single function.", line: 1, column: 1 }
    }
    if (node.end !== source.length) {
      return { message: "Expression must be a single function.", line: 1, column: node.end + 1 }
    }
    if ((node.params?.length ?? 0) > 1) {
      return { message: "Expression function must take at most one parameter.", line: 1, column: 1 }
    }
    if (node.async) return { message: "Expression function must not be async.", line: 1, column: 1 }
    if (node.generator) return { message: "Expression function must not be a generator.", line: 1, column: 1 }
    return undefined
  } catch (error) {
    return fromAcorn(error, "Expression syntax is invalid.")
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
