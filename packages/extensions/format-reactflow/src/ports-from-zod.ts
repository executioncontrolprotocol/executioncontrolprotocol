import type { Registry } from "@executioncontrolprotocol/core"
import { introspectCapabilitySchema } from "@executioncontrolprotocol/core"
import type { StepNode } from "@executioncontrolprotocol/types"
import type { ReactFlowPort } from "./types.js"

function typeLabelFor(
  eqlTypes: Record<string, string> | undefined,
  name: string,
  required: boolean
): string {
  const raw = eqlTypes?.[name]
  if (raw) return raw
  return required ? "unknown!" : "unknown"
}

/**
 * Build input/output ports from capability Zod schemas, with input-key fallback.
 * @category Encoding
 */
export function portsForStep(
  step: StepNode,
  registry: Registry | undefined
): { inputs: ReactFlowPort[]; outputs: ReactFlowPort[] } {
  const cap = registry?.getCapability(String(step.uses))
  const inputFields = introspectCapabilitySchema(cap?.inputSchema)
  const outputFields = introspectCapabilitySchema(cap?.outputSchema)

  const inputs: ReactFlowPort[] = []
  const seenInputs = new Set<string>()

  for (const name of inputFields.required) {
    seenInputs.add(name)
    inputs.push({
      id: name,
      name,
      typeLabel: typeLabelFor(inputFields.eqlTypes, name, true),
      required: true,
    })
  }
  for (const name of inputFields.optional) {
    seenInputs.add(name)
    inputs.push({
      id: name,
      name,
      typeLabel: typeLabelFor(inputFields.eqlTypes, name, false),
      required: false,
    })
  }

  if (step.input) {
    for (const name of Object.keys(step.input)) {
      if (seenInputs.has(name)) continue
      inputs.push({
        id: name,
        name,
        typeLabel: "unknown",
        required: false,
      })
    }
  }

  const outputs: ReactFlowPort[] = []
  for (const name of [...outputFields.required, ...outputFields.optional]) {
    outputs.push({
      id: name,
      name,
      typeLabel: typeLabelFor(
        outputFields.eqlTypes,
        name,
        outputFields.required.includes(name)
      ),
    })
  }

  if (outputs.length === 0 && step.as) {
    outputs.push({
      id: "output",
      name: "output",
      typeLabel: "unknown",
    })
  }

  return { inputs, outputs }
}
