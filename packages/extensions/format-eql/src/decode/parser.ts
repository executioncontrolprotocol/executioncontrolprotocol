import type { InputValue, ValidationIssue } from "@executioncontrolprotocol/types"
import type {
  EqlDocument,
  EqlHeader,
  EqlPatchDoc,
  EqlStep,
  EqlStepAdd,
  EqlStepMove,
  EqlStepUpdate,
  EqlWorkflowDoc,
  ParsedLine,
} from "./ast.js"
import { eqlSyntaxIssue } from "./diagnostics.js"
import { parseLines, tokenizeLine } from "./lexer.js"
import { parseDescribeDocument, parseEnvironmentDocument } from "./parser-environment.js"
import { parseIntentDocument, parseReplyDocument } from "./parser-harness.js"
import { parseLiteral, parseRefPath, parseStatePath, parseWhenExpr } from "./values.js"

export interface ParseResult {
  document?: EqlDocument
  header?: EqlHeader
  issues: ValidationIssue[]
}

function upper(tokens: string[]): string[] {
  return tokens.map((t) => t.toUpperCase())
}

function parseWithClause(
  tokens: string[],
  line: number,
  issues: ValidationIssue[]
): Record<string, InputValue> | undefined {
  if (tokens[0] !== "WITH" || tokens.length < 4 || tokens[2] !== "=") {
    issues.push(eqlSyntaxIssue(line, `Invalid WITH clause: ${tokens.join(" ")}`))
    return undefined
  }
  const key = tokens[1]!
  if (tokens[3] === "REF") {
    const ref = parseRefPath(tokens.slice(4).join(" "), line)
    issues.push(...ref.issues)
    return ref.value ? { [key]: ref.value } : undefined
  }
  if (tokens[3] === "STATE") {
    const st = parseStatePath(tokens[4] ?? "", line)
    issues.push(...st.issues)
    return st.value ? { [key]: st.value } : undefined
  }
  const valueText = tokens.slice(3).join(" ")
  const lit = parseLiteral(valueText, line)
  issues.push(...lit.issues)
  return lit.value !== undefined ? { [key]: lit.value as InputValue } : undefined
}

function mergeInput(
  target: Record<string, InputValue>,
  part: Record<string, InputValue> | undefined
): void {
  if (!part) return
  for (const [k, v] of Object.entries(part)) {
    target[k] = v
  }
}

function parseStepBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number,
  issues: ValidationIssue[]
): { step: Partial<EqlStep>; nextIndex: number } {
  const step: Partial<EqlStep> = { with: {} }
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) step.label = String(lit.value)
    } else if (t[0] === "WITH") {
      mergeInput(step.with!, parseWithClause(row.tokens, row.line, issues) ?? {})
    } else if (t[0] === "AS") {
      step.as = row.tokens[1]
      if (t[2] === "MODE" && row.tokens[3]) {
        step.mode = row.tokens[3]!.toLowerCase()
      }
    } else if (t[0] === "MODE" && row.tokens[1]) {
      step.mode = row.tokens[1]!.toLowerCase()
    } else if (t[0] === "WHEN") {
      const expr = row.tokens.slice(1).join(" ")
      const when = parseWhenExpr(expr, row.line)
      issues.push(...when.issues)
      if (when.value) step.when = when.value
    }
    i++
  }
  return { step, nextIndex: i }
}

function parseWorkflowUpdateBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number
): { update: { label?: string }; nextIndex: number } {
  const update: { label?: string } = {}
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) update.label = String(lit.value)
    }
    i++
  }
  return { update, nextIndex: i }
}

function parseUpdateBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number,
  issues: ValidationIssue[]
): { update: Partial<EqlStepUpdate>; nextIndex: number } {
  const update: Partial<EqlStepUpdate> = { with: {} }
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) update.label = String(lit.value)
    } else if (t[0] === "USES" && row.tokens[1]) {
      update.uses = row.tokens[1]
    } else if (t[0] === "WITH") {
      mergeInput(update.with!, parseWithClause(row.tokens, row.line, issues) ?? {})
    } else if (t[0] === "AS") {
      update.as = row.tokens[1]
      if (t[2] === "MODE" && row.tokens[3]) {
        update.mode = row.tokens[3]!.toLowerCase()
      }
    } else if (t[0] === "MODE" && row.tokens[1]) {
      update.mode = row.tokens[1]!.toLowerCase()
    } else if (t[0] === "WHEN") {
      const when = parseWhenExpr(row.tokens.slice(1).join(" "), row.line)
      issues.push(...when.issues)
      if (when.value) update.when = when.value
    }
    i++
  }
  return { update, nextIndex: i }
}

export function parseEql(text: string): ParseResult {
  const issues: ValidationIssue[] = []
  const lines = parseLines(text)
  let header: EqlHeader | undefined
  let index = 0

  if (lines[0]?.tokens[0]?.toUpperCase() === "ECP") {
    const row = lines[0]!
    if (row.tokens.length < 3) {
      issues.push(eqlSyntaxIssue(row.line, "Invalid ECP header"))
    } else {
      header = { schema: row.tokens[1]!, version: row.tokens[2]! }
    }
    index = 1
  }

  if (index >= lines.length) {
    issues.push(eqlSyntaxIssue(1, "Expected WORKFLOW, PATCH, ENVIRONMENT, or CAPABILITY statement"))
    return { issues, header }
  }

  if (header?.schema === "@executioncontrolprotocol.environment") {
    const doc = parseEnvironmentDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  if (header?.schema === "@executioncontrolprotocol.environment.describe") {
    const doc = parseDescribeDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  if (header?.schema === "@executioncontrolprotocol.intent") {
    const doc = parseIntentDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  if (header?.schema === "@executioncontrolprotocol.harness.reply") {
    const doc = parseReplyDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  const first = lines[index]!
  const ft = upper(first.tokens)

  if (ft[0] === "INTENT") {
    const doc = parseIntentDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  if (ft[0] === "REPLY") {
    const doc = parseReplyDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  if (ft[0] === "ENVIRONMENT") {
    const doc = parseEnvironmentDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  if (ft[0] === "CAPABILITY") {
    const doc = parseDescribeDocument(lines, index, header, issues)
    return doc ? { document: doc, header, issues } : { issues, header }
  }

  if (ft[0] === "WORKFLOW") {
    const workflowId = first.tokens[1]
    if (!workflowId) {
      issues.push(eqlSyntaxIssue(first.line, "WORKFLOW requires an id"))
      return { issues, header }
    }
    let workflowLabel: string | undefined
    if (first.tokens[2]) {
      const lit = parseLiteral(first.tokens.slice(2).join(" "), first.line)
      if (lit.value !== undefined) workflowLabel = String(lit.value)
    }
    const steps: EqlStep[] = []
    let i = index + 1
    while (i < lines.length) {
      const row = lines[i]!
      const t = upper(row.tokens)
      if (t[0] === "STEP") {
        const stepId = row.tokens[1]
        const usesIdx = row.tokens.findIndex((x) => x.toUpperCase() === "USES")
        if (!stepId || usesIdx === -1 || !row.tokens[usesIdx + 1]) {
          issues.push(eqlSyntaxIssue(row.line, "STEP requires id and USES capability"))
          i++
          continue
        }
        const step: EqlStep = {
          id: stepId,
          uses: row.tokens[usesIdx + 1]!,
          with: {},
        }
        const body = parseStepBody(lines, i + 1, row.indent, issues)
        if (body.step.label) step.label = body.step.label
        if (body.step.with) mergeInput(step.with, body.step.with)
        if (body.step.as) step.as = body.step.as
        if (body.step.mode) step.mode = body.step.mode
        if (body.step.when) step.when = body.step.when
        steps.push(step)
        i = body.nextIndex
        continue
      }
      if (["PARALLEL", "BRANCH", "LOOP", "END"].includes(t[0] ?? "")) {
        issues.push({
          severity: "error",
          code: "EQL_UNSUPPORTED_NODE",
          message: `Flow control '${t[0]}' is not supported in EQL v1`,
          path: `line:${row.line}`,
        })
      }
      i++
    }
    const doc: EqlWorkflowDoc = {
      kind: "workflow",
      header,
      workflowId,
      workflowLabel,
      steps,
    }
    return { document: doc, header, issues }
  }

  if (ft[0] === "PATCH" && ft[1] === "WORKFLOW") {
    const workflowId = first.tokens[2]
    if (!workflowId) {
      issues.push(eqlSyntaxIssue(first.line, "PATCH WORKFLOW requires an id"))
      return { issues, header }
    }
    const doc: EqlPatchDoc = {
      kind: "patch",
      header,
      workflowId,
      updates: [],
      adds: [],
      deletes: [],
      moves: [],
    }
    let i = index + 1
    while (i < lines.length) {
      const row = lines[i]!
      const t = upper(row.tokens)
      if (t[0] === "UPDATE" && t[1] === "WORKFLOW") {
        if (t[2] === "LABEL" && row.tokens[3]) {
          const lit = parseLiteral(row.tokens.slice(3).join(" "), row.line)
          if (lit.value !== undefined) {
            doc.workflowUpdate = { label: String(lit.value) }
          }
          i++
          continue
        }
        const body = parseWorkflowUpdateBody(lines, i + 1, row.indent)
        if (body.update.label !== undefined) {
          doc.workflowUpdate = { label: body.update.label }
        }
        i = body.nextIndex
        continue
      }
      if (t[0] === "UPDATE" && t[1] === "STEP" && row.tokens[2]) {
        const update: EqlStepUpdate = { stepId: row.tokens[2]!, with: {} }
        if (t[3] === "LABEL" && row.tokens[4]) {
          const lit = parseLiteral(row.tokens.slice(4).join(" "), row.line)
          if (lit.value !== undefined) update.label = String(lit.value)
          doc.updates.push(update)
          i++
          continue
        }
        const body = parseUpdateBody(lines, i + 1, row.indent, issues)
        if (body.update.label) update.label = body.update.label
        if (body.update.uses) update.uses = body.update.uses
        if (body.update.with) mergeInput(update.with, body.update.with)
        if (body.update.as) update.as = body.update.as
        if (body.update.mode) update.mode = body.update.mode
        if (body.update.when) update.when = body.update.when
        doc.updates.push(update)
        i = body.nextIndex
        continue
      }
      if (t[0] === "DELETE" && t[1] === "STEP" && row.tokens[2]) {
        doc.deletes.push(row.tokens[2]!)
        i++
        continue
      }
      if (t[0] === "MOVE" && t[1] === "STEP" && row.tokens[2]) {
        const move: EqlStepMove = { stepId: row.tokens[2]! }
        const afterIdx = row.tokens.findIndex((x) => x.toUpperCase() === "AFTER")
        const beforeIdx = row.tokens.findIndex((x) => x.toUpperCase() === "BEFORE")
        if (afterIdx !== -1) move.after = row.tokens[afterIdx + 1]
        if (beforeIdx !== -1) move.before = row.tokens[beforeIdx + 1]
        doc.moves.push(move)
        i++
        continue
      }
      if (t[0] === "ADD" && t[1] === "STEP" && row.tokens[2]) {
        const add: EqlStepAdd = {
          stepId: row.tokens[2]!,
          uses: "",
          with: {},
        }
        const usesIdx = row.tokens.findIndex((x) => x.toUpperCase() === "USES")
        if (usesIdx !== -1) add.uses = row.tokens[usesIdx + 1] ?? ""
        const afterIdx = row.tokens.findIndex((x) => x.toUpperCase() === "AFTER")
        const beforeIdx = row.tokens.findIndex((x) => x.toUpperCase() === "BEFORE")
        if (afterIdx !== -1) add.after = row.tokens[afterIdx + 1]
        if (beforeIdx !== -1) add.before = row.tokens[beforeIdx + 1]
        const body = parseStepBody(lines, i + 1, row.indent, issues)
        if (body.step.label) add.label = body.step.label
        if (body.step.with) mergeInput(add.with, body.step.with)
        if (body.step.as) add.as = body.step.as
        if (body.step.mode) add.mode = body.step.mode
        if (body.step.when) add.when = body.step.when
        doc.adds.push(add)
        i = body.nextIndex
        continue
      }
      i++
    }
    return { document: doc, header, issues }
  }

  issues.push(
    eqlSyntaxIssue(first.line, "Expected WORKFLOW, PATCH, INTENT, REPLY, ENVIRONMENT, or CAPABILITY")
  )
  return { issues, header }
}

/** Detect header from text without full parse. */
export function detectHeader(text: string): EqlHeader | undefined {
  const firstLine = text.replace(/\r\n/g, "\n").split("\n").find((l) => l.trim().length > 0)
  if (!firstLine) return undefined
  const tokens = tokenizeLine(firstLine.trim())
  if (tokens[0]?.toUpperCase() === "ECP" && tokens.length >= 3) {
    return { schema: tokens[1]!, version: tokens[2]! }
  }
  return undefined
}
