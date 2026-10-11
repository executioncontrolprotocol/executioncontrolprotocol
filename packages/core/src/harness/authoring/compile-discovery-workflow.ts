import type {
  CapabilityId,
  CapabilityMetadata,
  ProbeContext,
  WorkflowManifest,
} from "@executioncontrolprotocol/types"
import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import { isZodType, jsonSchemaFromZod } from "../../schema/json-schema.js"
import {
  allCapabilityInputNames,
  introspectCapabilitySchema,
} from "./summarize-capability-schema.js"
import { ref } from "../../helpers/ref.js"
import type { CapabilityDefinition } from "../../definitions/types.js"

/** Step `.as` key for the single capability call in a discovery workflow. @category Harness */
export const DISCOVERY_RAW_STEP_AS = "raw"

/**
 * Max characters of capability output placed on a follow-up chat turn.
 * Full output stays in the run result modal.
 * @category Harness
 */
export const DISCOVERY_OUTPUT_EXCERPT_CHAR_LIMIT = 800

/** Prefer these top-level keys when summarizing inspect-like objects. @category Harness */
const PREFERRED_SCALAR_KEYS = [
  "width",
  "height",
  "format",
  "id",
  "name",
  "size",
  "sizeBytes",
  "status",
  "ok",
] as const

const MAX_DEPTH = 2
const MAX_ARRAY_ITEMS = 8
const MAX_STRING_LENGTH = 120

/**
 * Resolve a capability definition for discovery compile.
 * @category Harness
 */
export interface DiscoveryCapabilityLookup {
  getCapability(id: string): CapabilityDefinition | undefined
}

function projectAcceptsSchema(inputSchema: unknown): Record<string, unknown> {
  if (inputSchema === undefined) {
    return { type: "object", properties: {} }
  }
  if (isZodType(inputSchema)) {
    return jsonSchemaFromZod(inputSchema)
  }
  if (inputSchema !== null && typeof inputSchema === "object" && !Array.isArray(inputSchema)) {
    return { ...(inputSchema as Record<string, unknown>) }
  }
  return { type: "object", properties: {} }
}

/**
 * Compile a disposable one-step inspect workflow from a bound capability's
 * existing input schema. Unknown capability ids throw.
 * @category Harness
 */
export function compileDiscoveryWorkflow(
  capabilityId: string,
  lookup: DiscoveryCapabilityLookup
): WorkflowManifest {
  const capability = lookup.getCapability(capabilityId)
  if (!capability) {
    throw new Error(`Unknown capability for discovery: ${capabilityId}`)
  }

  const accepts = projectAcceptsSchema(capability.inputSchema)
  const fields = introspectCapabilitySchema(capability.inputSchema)
  const inputNames = allCapabilityInputNames(fields)
  const input: Record<string, ReturnType<typeof ref>> = {}
  for (const name of inputNames) {
    input[name] = ref(name)
  }

  const label = capability.metadata?.summary
    ? `Inspect: ${capability.metadata.summary}`
    : `Inspect ${capabilityId}`

  return {
    schema: "@executioncontrolprotocol.workflow",
    version: LATEST_ECP_VERSION,
    workflow: {
      id: `discovery-${capability.name}`,
      label,
      accepts,
      returns: {
        type: "object",
        properties: {
          [DISCOVERY_RAW_STEP_AS]: { type: "object" },
        },
      },
    },
    steps: [
      {
        type: "step",
        id: "discover",
        label: capability.metadata?.label ?? capability.name,
        uses: capability.id as CapabilityId,
        input,
        as: DISCOVERY_RAW_STEP_AS,
      },
    ],
    discovery: { capabilityId: capability.id },
  }
}

/**
 * Format capability projections as prompt lines (after an inspect run).
 * @category Harness
 */
export function formatProjectionsForPrompt(
  projections: CapabilityMetadata["projections"] | undefined
): string[] {
  if (!projections?.length) return []
  const lines = ["Projections:"]
  for (const projection of projections) {
    lines.push(`- ${projection.summary}`)
    lines.push(`  ${projection.description}`)
  }
  return lines
}

function truncateString(value: string, max = MAX_STRING_LENGTH): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

/**
 * Shallow-compact a value for discovery chat excerpts (depth/array/string bounds).
 * @category Harness
 */
export function compactDiscoveryValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value
  }
  if (typeof value === "string") {
    return truncateString(value)
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (typeof value !== "object") {
    return String(value)
  }
  if (depth >= MAX_DEPTH) {
    if (Array.isArray(value)) return `[${value.length} items]`
    const keys = Object.keys(value as object)
    return `{${keys.slice(0, 6).join(",")}${keys.length > 6 ? ",…" : ""}}`
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => compactDiscoveryValue(item, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS) {
      items.push(`…+${value.length - MAX_ARRAY_ITEMS} more`)
    }
    return items
  }

  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const preferred = PREFERRED_SCALAR_KEYS.filter((key) => key in record)
  const otherKeys = Object.keys(record)
    .filter((key) => !PREFERRED_SCALAR_KEYS.includes(key as (typeof PREFERRED_SCALAR_KEYS)[number]))
    .sort()
  const ordered = [...preferred, ...otherKeys]
  for (const key of ordered) {
    const nested = record[key]
    // Prefer scalar facts; collapse bulky nested bags early.
    if (
      depth === 0 &&
      nested !== null &&
      typeof nested === "object" &&
      !Array.isArray(nested) &&
      (key === "metadata" || key === "stats" || key === "exif" || key === "icc")
    ) {
      const nestedKeys = Object.keys(nested as object)
      out[key] = `{${nestedKeys.slice(0, 8).join(",")}${nestedKeys.length > 8 ? ",…" : ""}}`
      continue
    }
    out[key] = compactDiscoveryValue(nested, depth + 1)
  }
  return out
}

/** Suffix appended when a discovery excerpt exceeds its char budget. @category Harness */
export const DISCOVERY_EXCERPT_TRUNCATION_MARKER = "…[truncated]"

/** Max characters for {@link ProbeContext.summary} after projections + excerpt. @category Harness */
export const PROBE_CONTEXT_SUMMARY_CHAR_LIMIT = 1200

/**
 * Cap a discovery capability output for the next chat turn.
 * Full output stays in the run result modal.
 * @category Harness
 */
export function capDiscoveryExcerpt(
  value: unknown,
  limit = DISCOVERY_OUTPUT_EXCERPT_CHAR_LIMIT
): string {
  let text: string
  try {
    text = JSON.stringify(compactDiscoveryValue(value))
  } catch {
    text = String(value)
  }
  if (text.length <= limit) return text
  const marker = DISCOVERY_EXCERPT_TRUNCATION_MARKER
  return `${text.slice(0, Math.max(0, limit - marker.length))}${marker}`
}

/**
 * True when an excerpt string was hard-truncated for context budget.
 * @category Harness
 */
export function isDiscoveryExcerptTruncated(excerpt: string): boolean {
  return excerpt.includes(DISCOVERY_EXCERPT_TRUNCATION_MARKER)
}

/**
 * Build prompt lines after a discovery run: projections plus a capped excerpt.
 * @category Harness
 */
export function formatDiscoveryFollowUpLines(options: {
  capabilityId: string
  projections?: CapabilityMetadata["projections"]
  output: unknown
}): string[] {
  const lines = [
    `Discovery capability: ${options.capabilityId}`,
    ...formatProjectionsForPrompt(options.projections),
    "Discovery output excerpt:",
    capDiscoveryExcerpt(options.output),
  ]
  return lines
}

/** Result of building probe context from projections + compact excerpt. @category Harness */
export interface BuildProbeContextFromDiscoveryResult {
  /** Model-facing probe context (no vendor-shaped option harvest). */
  probeContext: ProbeContext
  /** True when the compact excerpt hit the char budget. */
  excerptTruncated: boolean
}

/**
 * Build {@link ProbeContext} from capability projections and a domain-agnostic compact excerpt.
 * Does not harvest vendor bag names (layers/parts/…). Options stay empty in this pass.
 * @category Harness
 */
export function buildProbeContextFromDiscovery(options: {
  capabilityId: string
  output: unknown
  projections?: CapabilityMetadata["projections"]
}): BuildProbeContextFromDiscoveryResult {
  const excerpt = capDiscoveryExcerpt(options.output)
  const excerptTruncated = isDiscoveryExcerptTruncated(excerpt)
  const projectionSummaries =
    options.projections?.map((p) => p.summary).filter((s) => s.trim().length > 0) ?? []
  const projectionBlock =
    projectionSummaries.length > 0
      ? `Projections: ${projectionSummaries.join("; ")}.`
      : `Inspected ${options.capabilityId}.`
  let summary = `${projectionBlock} Excerpt: ${excerpt}`
  if (summary.length > PROBE_CONTEXT_SUMMARY_CHAR_LIMIT) {
    const marker = DISCOVERY_EXCERPT_TRUNCATION_MARKER
    summary = `${summary.slice(0, Math.max(0, PROBE_CONTEXT_SUMMARY_CHAR_LIMIT - marker.length))}${marker}`
  }
  return {
    probeContext: {
      probeId: `probe-${Date.now()}`,
      domain: options.capabilityId,
      stepAs: DISCOVERY_RAW_STEP_AS,
      summary,
      options: [],
    },
    excerptTruncated,
  }
}
