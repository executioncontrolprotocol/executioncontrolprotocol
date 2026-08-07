import type { ValidationIssue } from "@executioncontrolprotocol/types"
import type {
  EqlBinding,
  EqlDescribeCapability,
  EqlDescribeDoc,
  EqlDescribeExtension,
  EqlDescribePolicy,
  EqlEnvironmentDoc,
  EqlHeader,
  ParsedLine,
} from "./ast.js"
import { eqlSyntaxIssue } from "./diagnostics.js"
import { parseLiteral } from "./values.js"
import { parseLines } from "./lexer.js"

function upper(tokens: string[]): string[] {
  return tokens.map((t) => t.toUpperCase())
}

function parseConfigBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number,
  issues: ValidationIssue[]
): { config: Record<string, unknown>; label?: string; nextIndex: number } {
  const config: Record<string, unknown> = {}
  let label: string | undefined
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) label = String(lit.value)
    } else if (t[0] === "WITH" && row.tokens.length >= 4 && row.tokens[2] === "=") {
      const key = row.tokens[1]!
      const lit = parseLiteral(row.tokens.slice(3).join(" "), row.line)
      issues.push(...lit.issues)
      if (lit.value !== undefined) config[key] = lit.value
    }
    i++
  }
  return { config, label, nextIndex: i }
}

function parseFeatureBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number,
  issues: ValidationIssue[]
): { features: Record<string, boolean>; label?: string; nextIndex: number } {
  const features: Record<string, boolean> = {}
  let label: string | undefined
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) label = String(lit.value)
    } else if (t[0] === "FEATURE") {
      const name = row.tokens[1]
      if (!name) {
        issues.push(eqlSyntaxIssue(row.line, "FEATURE requires a name"))
      } else {
        const eqIdx = row.tokens.findIndex((x) => x === "=")
        if (eqIdx === -1) {
          features[name] = true
        } else {
          const lit = parseLiteral(row.tokens.slice(eqIdx + 1).join(" "), row.line)
          features[name] = lit.value === true || lit.value === "true"
        }
      }
    }
    i++
  }
  return { features, label, nextIndex: i }
}

function parseExtensionDescribeBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number,
  _issues: ValidationIssue[]
): { label?: string; capabilities: string[]; nextIndex: number } {
  let label: string | undefined
  const capabilities: string[] = []
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) label = String(lit.value)
    } else if (t[0] === "CAPABILITIES") {
      capabilities.push(...row.tokens.slice(1))
    }
    i++
  }
  return { label, capabilities, nextIndex: i }
}

function parseCapabilityDescribeBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number,
  issues: ValidationIssue[]
): {
  label?: string
  extension?: string
  inputs: Record<string, string>
  outputs: Record<string, string>
  nextIndex: number
} {
  let label: string | undefined
  let extension: string | undefined
  const inputs: Record<string, string> = {}
  const outputs: Record<string, string> = {}
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) label = String(lit.value)
    } else if (t[0] === "EXTENSION" && row.tokens[1]) {
      extension = row.tokens[1]
    } else if (t[0] === "WITH" && row.tokens[1]) {
      const spec = row.tokens.slice(1).join(" ")
      const colon = spec.indexOf(":")
      if (colon === -1) {
        issues.push(eqlSyntaxIssue(row.line, `Expected type annotation: ${spec}`))
      } else {
        inputs[spec.slice(0, colon)] = spec.slice(colon + 1)
      }
    } else if (t[0] === "OUT" && row.tokens[1]) {
      const spec = row.tokens.slice(1).join(" ")
      const colon = spec.indexOf(":")
      if (colon === -1) {
        issues.push(eqlSyntaxIssue(row.line, `Expected type annotation: ${spec}`))
      } else {
        outputs[spec.slice(0, colon)] = spec.slice(colon + 1)
      }
    }
    i++
  }
  return { label, extension, inputs, outputs, nextIndex: i }
}

function parsePolicyDescribeBody(
  lines: ParsedLine[],
  startIndex: number,
  baseIndent: number
): { label?: string; summary?: string; nextIndex: number } {
  let label: string | undefined
  let summary: string | undefined
  let i = startIndex
  while (i < lines.length) {
    const row = lines[i]!
    if (row.indent <= baseIndent) break
    const t = upper(row.tokens)
    if (t[0] === "LABEL" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) label = String(lit.value)
    } else if (t[0] === "SUMMARY" && row.tokens[1]) {
      const lit = parseLiteral(row.tokens.slice(1).join(" "), row.line)
      if (lit.value !== undefined) summary = String(lit.value)
    }
    i++
  }
  return { label, summary, nextIndex: i }
}

function parseEnvironmentLine(
  row: ParsedLine,
  issues: ValidationIssue[]
): { environmentId?: string; environmentLabel?: string } {
  const environmentId = row.tokens[1]
  if (!environmentId) {
    issues.push(eqlSyntaxIssue(row.line, "ENVIRONMENT requires an id"))
    return {}
  }
  let environmentLabel: string | undefined
  if (row.tokens[2]) {
    const lit = parseLiteral(row.tokens.slice(2).join(" "), row.line)
    if (lit.value !== undefined) environmentLabel = String(lit.value)
  }
  return { environmentId, environmentLabel }
}

export function parseEnvironmentDocument(
  lines: ParsedLine[],
  startIndex: number,
  header: EqlHeader | undefined,
  issues: ValidationIssue[]
): EqlEnvironmentDoc | undefined {
  const first = lines[startIndex]
  if (!first || upper(first.tokens)[0] !== "ENVIRONMENT") {
    issues.push(eqlSyntaxIssue(first?.line ?? 1, "Expected ENVIRONMENT statement"))
    return undefined
  }

  const { environmentId, environmentLabel } = parseEnvironmentLine(first, issues)
  if (!environmentId) return undefined

  const doc: EqlEnvironmentDoc = {
    kind: "environment",
    header,
    environmentId,
    environmentLabel,
    extensions: [],
    policies: [],
  }

  let i = startIndex + 1
  while (i < lines.length) {
    const row = lines[i]!
    const t = upper(row.tokens)
    if (t[0] === "RUNTIME" && row.tokens[1]) {
      const body = parseConfigBody(lines, i + 1, row.indent, issues)
      doc.runtime = {
        id: row.tokens[1]!,
        label: body.label,
        config: body.config,
      }
      i = body.nextIndex
      continue
    }
    if (t[0] === "EXTENSION" && row.tokens[1]) {
      const orderIdx = row.tokens.findIndex((x) => x.toUpperCase() === "ORDER")
      const order = orderIdx !== -1 ? Number(row.tokens[orderIdx + 1]) : 0
      const binding: EqlBinding = {
        id: row.tokens[1]!,
        order: Number.isFinite(order) ? order : 0,
        config: {},
      }
      const body = parseConfigBody(lines, i + 1, row.indent, issues)
      binding.label = body.label
      binding.config = body.config
      doc.extensions.push(binding)
      i = body.nextIndex
      continue
    }
    if (t[0] === "POLICY" && row.tokens[1]) {
      const orderIdx = row.tokens.findIndex((x) => x.toUpperCase() === "ORDER")
      const order = orderIdx !== -1 ? Number(row.tokens[orderIdx + 1]) : 0
      const binding: EqlBinding = {
        id: row.tokens[1]!,
        order: Number.isFinite(order) ? order : 0,
        config: {},
      }
      const body = parseConfigBody(lines, i + 1, row.indent, issues)
      binding.label = body.label
      binding.config = body.config
      doc.policies.push(binding)
      i = body.nextIndex
      continue
    }
    i++
  }

  return doc
}

export function parseDescribeDocument(
  lines: ParsedLine[],
  startIndex: number,
  header: EqlHeader | undefined,
  issues: ValidationIssue[]
): EqlDescribeDoc | undefined {
  let i = startIndex
  let environmentId = "environment"
  let environmentLabel: string | undefined

  if (lines[i] && upper(lines[i]!.tokens)[0] === "ENVIRONMENT") {
    const env = parseEnvironmentLine(lines[i]!, issues)
    if (env.environmentId) environmentId = env.environmentId
    environmentLabel = env.environmentLabel
    i++
  }

  const doc: EqlDescribeDoc = {
    kind: "describe",
    header,
    environmentId,
    environmentLabel,
    extensions: [],
    capabilities: [],
    policies: [],
  }

  while (i < lines.length) {
    const row = lines[i]!
    const t = upper(row.tokens)
    if (t[0] === "RUNTIME" && row.tokens[1]) {
      const body = parseFeatureBody(lines, i + 1, row.indent, issues)
      doc.runtime = {
        id: row.tokens[1]!,
        label: body.label,
        features: body.features,
      }
      i = body.nextIndex
      continue
    }
    if (t[0] === "EXTENSION" && row.tokens[1]) {
      const orderIdx = row.tokens.findIndex((x) => x.toUpperCase() === "ORDER")
      const order = orderIdx !== -1 ? Number(row.tokens[orderIdx + 1]) : 0
      const ext: EqlDescribeExtension = {
        id: row.tokens[1]!,
        order: Number.isFinite(order) ? order : 0,
        capabilities: [],
      }
      const body = parseExtensionDescribeBody(lines, i + 1, row.indent, issues)
      ext.label = body.label
      ext.capabilities = body.capabilities
      doc.extensions.push(ext)
      i = body.nextIndex
      continue
    }
    if (t[0] === "CAPABILITY" && row.tokens[1]) {
      const cap: EqlDescribeCapability = {
        id: row.tokens[1]!,
        inputs: {},
        outputs: {},
      }
      const body = parseCapabilityDescribeBody(lines, i + 1, row.indent, issues)
      cap.label = body.label
      cap.extension = body.extension
      cap.inputs = body.inputs
      cap.outputs = body.outputs
      doc.capabilities.push(cap)
      i = body.nextIndex
      continue
    }
    if (t[0] === "POLICY" && row.tokens[1]) {
      const pol: EqlDescribePolicy = { id: row.tokens[1]! }
      const body = parsePolicyDescribeBody(lines, i + 1, row.indent)
      pol.label = body.label
      pol.summary = body.summary
      doc.policies.push(pol)
      i = body.nextIndex
      continue
    }
    if (t[0] === "ENVIRONMENT") {
      const env = parseEnvironmentLine(row, issues)
      if (env.environmentId) environmentId = env.environmentId
      environmentLabel = env.environmentLabel
      doc.environmentId = environmentId
      doc.environmentLabel = environmentLabel
    }
    i++
  }

  return doc
}

export function parseEnvironmentEql(text: string): {
  document?: EqlEnvironmentDoc | EqlDescribeDoc
  issues: ValidationIssue[]
} {
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
    issues.push(eqlSyntaxIssue(1, "Expected ENVIRONMENT or CAPABILITY statement"))
    return { issues }
  }

  if (header?.schema === "@executioncontrolprotocol.environment.describe") {
    const doc = parseDescribeDocument(lines, index, header, issues)
    return { document: doc, issues }
  }

  if (header?.schema === "@executioncontrolprotocol.environment") {
    const doc = parseEnvironmentDocument(lines, index, header, issues)
    return { document: doc, issues }
  }

  const first = upper(lines[index]!.tokens)
  if (first[0] === "ENVIRONMENT") {
    const doc = parseEnvironmentDocument(lines, index, header, issues)
    return { document: doc, issues }
  }
  if (first[0] === "CAPABILITY" || first[0] === "RUNTIME" || first[0] === "POLICY") {
    const doc = parseDescribeDocument(lines, index, header, issues)
    return { document: doc, issues }
  }

  issues.push(eqlSyntaxIssue(lines[index]!.line, "Expected ENVIRONMENT or CAPABILITY statement"))
  return { issues }
}
