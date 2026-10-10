import type {
  CapabilityId,
  CapabilityMetadata,
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
 * Max JSON characters of capability output placed on a follow-up chat turn.
 * @category Harness
 */
export const DISCOVERY_OUTPUT_EXCERPT_CHAR_LIMIT = 2400

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
    text = JSON.stringify(value, null, 2)
  } catch {
    text = String(value)
  }
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 20))}\n...[truncated]`
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
