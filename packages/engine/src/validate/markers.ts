import type { ValidationIssue } from "@executioncontrolprotocol/protocol"
import type { JsonSchema } from "../schema/json-schema.js"

/**
 * Marker keys recognised in execution values.
 * @category Validation
 */
export const MARKER_KEYS = ["$ref", "$expr", "$state", "$script", "$secret", "$env"] as const

/**
 * One marker key.
 * @category Validation
 */
export type MarkerKey = (typeof MARKER_KEYS)[number]

/**
 * Ajv-like error shape used by the marker filter.
 * @category Validation
 */
export interface MarkerAjvError {
  /** JSON Pointer into the validated value. */
  instancePath: string
  /** JSON Pointer into the schema. */
  schemaPath: string
  /** Failed keyword. */
  keyword: string
  /** Human-readable message. */
  message?: string
  /** Keyword parameters. */
  params: Record<string, unknown>
}

/**
 * True when `value` is a marker object (has a marker key).
 * @category Validation
 */
export function isMarkerValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && MARKER_KEYS.some((key) => key in value)
}

/**
 * Marker key present on a marker object, or undefined.
 * @category Validation
 */
export function markerKind(value: unknown): MarkerKey | undefined {
  if (!isRecord(value)) return undefined
  return MARKER_KEYS.find((key) => key in value)
}

/**
 * Collect JSON Pointers of every marker in `value`, relative to `prefix`.
 * @category Validation
 */
export function collectMarkerPaths(
  value: unknown,
  prefix = "",
  out: Map<string, MarkerKey> = new Map(),
): Map<string, MarkerKey> {
  const kind = markerKind(value)
  if (kind) {
    out.set(prefix, kind)
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectMarkerPaths(item, `${prefix}/${index}`, out)
    })
    return out
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const segment = key.replace(/~/g, "~0").replace(/\//g, "~1")
      collectMarkerPaths(child, `${prefix}/${segment}`, out)
    }
  }
  return out
}

/**
 * Drop Ajv errors explained by a marker position (under a marker, additionalProperties
 * naming a marker key, or anyOf/oneOf whose some branch is fully explained). Also drops
 * `if` noise and sub-errors of explained combinators.
 * @category Validation
 */
export function filterMarkerExplainedErrors(
  errors: readonly MarkerAjvError[],
  marks: ReadonlyMap<string, MarkerKey> | ReadonlySet<string>,
): MarkerAjvError[] {
  const markPaths = marks instanceof Map ? marks : new Map([...marks].map((path) => [path, "$ref" as MarkerKey]))
  const under = (path: string): boolean =>
    [...markPaths.keys()].some((marker) => path === marker || path.startsWith(`${marker}/`))
  const explained = (error: MarkerAjvError): boolean => {
    if (under(error.instancePath)) return true
    if (error.keyword === "additionalProperties") {
      const extra = error.params.additionalProperty
      if (typeof extra === "string" && markPaths.has(`${error.instancePath}/${extra}`)) return true
    }
    return false
  }
  const comb = (error: MarkerAjvError): boolean => {
    if (error.keyword !== "anyOf" && error.keyword !== "oneOf") return false
    const branches = new Map<string, MarkerAjvError[]>()
    for (const sibling of errors) {
      if (!sibling.schemaPath.startsWith(`${error.schemaPath}/`)) continue
      const index = sibling.schemaPath.slice(error.schemaPath.length + 1).split("/")[0] ?? ""
      const list = branches.get(index) ?? []
      list.push(sibling)
      branches.set(index, list)
    }
    return [...branches.values()].some((list) => list.every((item) => explained(item) || comb(item)))
  }
  const explainedCombs = errors.filter((error) => comb(error))
  return errors.filter(
    (error) =>
      !explained(error) &&
      !comb(error) &&
      error.keyword !== "if" &&
      !explainedCombs.some((combo) => error.schemaPath.startsWith(`${combo.schemaPath}/`)),
  )
}

/**
 * Subschemas reachable at a JSON Pointer under `schema`.
 * Open objects (`additionalProperties` not `false`) yield `true` for undeclared properties.
 * @category Validation
 */
export function subschemasAt(schema: unknown, pointer: string): unknown[] {
  let current: unknown[] = [schema]
  for (const raw of pointer.split("/").slice(1)) {
    const segment = raw.replace(/~1/g, "/").replace(/~0/g, "~")
    const next: unknown[] = []
    const visit = (node: unknown): void => {
      if (!isRecord(node)) return
      for (const key of ["anyOf", "oneOf", "allOf"] as const) {
        const options = node[key]
        if (Array.isArray(options)) options.forEach(visit)
      }
      if (isRecord(node.properties) && segment in node.properties) {
        next.push(node.properties[segment])
        return
      }
      if (/^\d+$/.test(segment) && node.items !== undefined) {
        next.push(Array.isArray(node.items) ? node.items[Number(segment)] : node.items)
        return
      }
      if (isRecord(node.additionalProperties)) {
        next.push(node.additionalProperties)
        return
      }
      if ((node.type === "object" || node.properties !== undefined) && node.additionalProperties !== false) {
        next.push(true)
      }
    }
    current.forEach(visit)
    current = next
  }
  return current
}

/**
 * True when the schema does not constrain the value shape (e.g. `{}` / zod unknown).
 * @category Validation
 */
export function isOpenSchema(schema: JsonSchema): boolean {
  if (schema.type !== undefined) return false
  if (schema.enum !== undefined || schema.const !== undefined) return false
  if (schema.oneOf !== undefined || schema.anyOf !== undefined || schema.allOf !== undefined) return false
  if (schema.not !== undefined || schema.if !== undefined) return false
  return true
}

/**
 * True when a subschema accepts a string (or is open / `true`). Used for `$script` positions.
 * @category Validation
 */
export function allowsString(schema: unknown): boolean {
  if (schema === true || schema === undefined) return true
  if (schema === false || typeof schema !== "object" || Array.isArray(schema)) return false
  const record = schema as JsonSchema
  if (isOpenSchema(record)) return true
  const type = record.type
  if (type === "string") return true
  if (Array.isArray(type) && type.includes("string")) return true
  for (const key of ["anyOf", "oneOf"] as const) {
    const options = record[key]
    if (Array.isArray(options) && options.some((option) => allowsString(option))) return true
  }
  return false
}

/**
 * Issues for `$script` markers whose raw accepts subschema does not accept a string.
 * @category Validation
 */
export function assertScriptPositions(
  input: unknown,
  accepts: unknown,
  inputPointer: string,
): ValidationIssue[] {
  const marks = collectMarkerPaths(input)
  const issues: ValidationIssue[] = []
  for (const [relative, kind] of marks) {
    if (kind !== "$script") continue
    if (subschemasAt(accepts, relative).some((schema) => allowsString(schema))) continue
    issues.push({
      code: "ECP_MANIFEST_INVALID",
      severity: "error",
      message: "$script is not allowed where the capability accepts schema does not accept a string.",
      path: `${inputPointer}${relative}`,
    })
  }
  return issues
}

/**
 * Dedicated F3-shaped issues for `$secret` / `$env` markers in an execution value tree.
 * @category Validation
 */
export function collectSecretEnvIssues(value: unknown, prefix = ""): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const kind = markerKind(value)
  if (kind === "$secret" || kind === "$env") {
    issues.push({
      code: "ECP_MANIFEST_INVALID",
      severity: "error",
      message: `${kind} is not allowed in an execution; put it in a config object`,
      path: prefix === "" ? "/" : prefix,
      suggestions: [
        "move this value into a config object (ecp commit --type config) and set the step config field",
      ],
    })
    return issues
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      issues.push(...collectSecretEnvIssues(item, `${prefix}/${index}`))
    })
    return issues
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const segment = key.replace(/~/g, "~0").replace(/\//g, "~1")
      issues.push(...collectSecretEnvIssues(child, `${prefix}/${segment}`))
    }
  }
  return issues
}

/**
 * Validate raw accepts with marker-error filtering.
 * @category Validation
 */
export function validateWithMarkers(
  validate: ((data: unknown) => boolean) & { errors?: MarkerAjvError[] | null },
  input: unknown,
): MarkerAjvError[] {
  const marks = collectMarkerPaths(input)
  if (validate(input)) return []
  return filterMarkerExplainedErrors(validate.errors ?? [], marks)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
