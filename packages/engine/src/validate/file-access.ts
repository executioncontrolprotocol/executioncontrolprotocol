import {
  FILE_ACCESS_PUBLISH_SUGGESTION,
  mediaTypeMatchesAllowList,
  parseXEcpFile,
  type FileRefAccess,
  type XEcpFileAnnotation,
} from "@executioncontrolprotocol/protocol"
import type { ValidationIssue } from "@executioncontrolprotocol/protocol"

type JsonSchema = Record<string, unknown>

const FILE_KINDS = ["file", "url", "artifact"] as const

/**
 * Validate a resolved {@link FileRef} value against `x-ecp-file` on a target schema.
 * @category Validation
 */
export function fileAccessValueIssues(
  value: unknown,
  targetSchema: JsonSchema | undefined,
  pointer: string,
  nodeId?: string,
): ValidationIssue[] {
  const annotation = parseXEcpFile(targetSchema)
  if (!annotation) return []
  if (!isRecord(value)) return []
  const kind = value.kind
  if (typeof kind !== "string" || !FILE_KINDS.includes(kind as (typeof FILE_KINDS)[number])) return []

  const issues: ValidationIssue[] = []
  const accessIssue = fileAccessKindIssue(kind, annotation.access, pointer, nodeId)
  if (accessIssue) issues.push(accessIssue)

  const mediaType = value.mediaType
  if (typeof mediaType === "string" && annotation.mediaTypes?.length) {
    if (!mediaTypeMatchesAllowList(mediaType, annotation.mediaTypes)) {
      issues.push({
        code: "ECP_TYPE_MISMATCH",
        severity: "error",
        message: `mediaType ${mediaType} is not allowed for this field.`,
        path: `${pointer}/mediaType`,
        nodeId,
        suggestions: [`use a mediaType matching ${annotation.mediaTypes.join(", ")}`],
      })
    }
  }
  return issues
}

/**
 * L3 file-access fit for a `$ref` or literal binding.
 * @category Validation
 */
export function fileAccessBindingIssue(
  sourceSchema: JsonSchema | undefined,
  literalValue: Record<string, unknown> | undefined,
  targetSchema: JsonSchema | undefined,
  pointer: string,
  nodeId?: string,
): ValidationIssue | undefined {
  const annotation = parseXEcpFile(targetSchema)
  if (!annotation?.access) return undefined

  if (literalValue) {
    return fileAccessKindIssue(
      typeof literalValue.kind === "string" ? literalValue.kind : "",
      annotation.access,
      `${pointer}/kind`,
      nodeId,
    )
  }

  // Only fail when the source declares kinds and one of them isn't `url`. A source with no kind information
  // (`returns: {}`, a plain object) is left to the run-time check rather than rejected here.
  const kinds = possibleFileRefKinds(sourceSchema)
  if (annotation.access === "url" && kinds !== undefined && [...kinds].some((kind) => kind !== "url")) {
    const others = [...kinds].filter((kind) => kind !== "url").join(", ")
    return {
      code: "ECP_TYPE_MISMATCH",
      severity: "error",
      message: `This field requires a url FileRef; the bound value can also be a ${others} ref.`,
      path: pointer,
      nodeId,
      suggestions: [FILE_ACCESS_PUBLISH_SUGGESTION],
      expected: trimSchema(targetSchema),
      actual: trimSchema(sourceSchema),
    }
  }

  return undefined
}

function fileAccessKindIssue(
  kind: string,
  access: FileRefAccess | undefined,
  pointer: string,
  nodeId?: string,
): ValidationIssue | undefined {
  if (!access) return undefined
  if (access === "url" && kind !== "url") {
    return {
      code: "ECP_TYPE_MISMATCH",
      severity: "error",
      message: `This field requires a url FileRef; got kind "${kind}".`,
      path: pointer,
      nodeId,
      suggestions: [FILE_ACCESS_PUBLISH_SUGGESTION],
    }
  }
  // bytes, stream and path accept every kind: the host activates any ref locally.
  return undefined
}

function possibleFileRefKinds(schema: JsonSchema | undefined, depth = 0): Set<string> | undefined {
  if (!schema || depth > 10) return undefined
  const branches = [...schemaBranches(schema.oneOf), ...schemaBranches(schema.anyOf)]
  if (branches.length > 0) {
    const kinds = new Set<string>()
    for (const branch of branches) {
      const branchKinds = possibleFileRefKinds(branch, depth + 1)
      if (!branchKinds) return undefined
      for (const kind of branchKinds) kinds.add(kind)
    }
    return kinds
  }
  return kindsFromObjectSchema(schema)
}

function schemaBranches(value: unknown): JsonSchema[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is JsonSchema => isRecord(item))
}

function kindsFromObjectSchema(schema: JsonSchema): Set<string> | undefined {
  const properties = schema.properties
  if (!isRecord(properties)) {
    if (schema["x-ecp-file"] === true || parseXEcpFile(schema)) {
      return new Set(FILE_KINDS)
    }
    return undefined
  }
  const kindSchema = properties.kind
  if (!isRecord(kindSchema)) {
    if (schema["x-ecp-file"] === true || parseXEcpFile(schema)) {
      return new Set(FILE_KINDS)
    }
    return undefined
  }
  if (typeof kindSchema.const === "string") return new Set([kindSchema.const])
  if (Array.isArray(kindSchema.enum)) {
    const kinds = kindSchema.enum.filter((item): item is string => typeof item === "string")
    return kinds.length > 0 ? new Set(kinds) : undefined
  }
  if (schema["x-ecp-file"] === true || parseXEcpFile(schema)) {
    return new Set(FILE_KINDS)
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function trimSchema(schema: JsonSchema | undefined): unknown {
  if (!schema) return schema
  const text = JSON.stringify(schema)
  if (text.length <= 1024) return schema
  return text.slice(0, 1024)
}

/**
 * Register the `x-ecp-file` Ajv keyword for run-time kind and mediaType checks.
 * @category Validation
 */
export function registerXEcpFileKeyword(ajv: { addKeyword: (def: object) => unknown }): void {
  ajv.addKeyword({
    keyword: "x-ecp-file",
    type: "object",
    schemaType: ["object", "boolean"],
    validate(schemaKeyword: boolean | XEcpFileAnnotation, data: unknown): boolean {
      if (!isRecord(data)) return true
      const kind = data.kind
      if (typeof kind !== "string") return true
      const annotation: XEcpFileAnnotation =
        schemaKeyword === true ? {} : typeof schemaKeyword === "object" && schemaKeyword !== null ? schemaKeyword : {}
      if (annotation.access === "url" && kind !== "url") return false
      const mediaType = data.mediaType
      if (typeof mediaType === "string" && annotation.mediaTypes?.length) {
        if (!mediaTypeMatchesAllowList(mediaType, annotation.mediaTypes)) return false
      }
      return true
    },
    error: {
      message(ctx: { parentData: unknown; schema: boolean | XEcpFileAnnotation }) {
        const data = ctx.parentData
        const annotation: XEcpFileAnnotation =
          ctx.schema === true ? {} : typeof ctx.schema === "object" && ctx.schema !== null ? ctx.schema : {}
        if (isRecord(data) && annotation.access === "url" && data.kind !== "url") {
          return `requires a url FileRef. ${FILE_ACCESS_PUBLISH_SUGGESTION}`
        }
        return "FileRef does not match declared access or mediaTypes."
      },
    },
  })
}