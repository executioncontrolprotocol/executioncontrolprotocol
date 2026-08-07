import type { StepNode, WorkflowManifest } from "@executioncontrolprotocol/types"
import type { EqlFormatOptions } from "../schemas.js"
import type { EcpFormatOptions } from "@executioncontrolprotocol/types"
import { EqlWriter, formatInputValue, formatLiteral, formatWhen } from "./writer.js"

export function encodeWorkflowToEql(
  manifest: WorkflowManifest,
  options?: EcpFormatOptions & EqlFormatOptions,
  includeHeader = true
): string {
  const writer = new EqlWriter(options)
  if (includeHeader) {
    writer.writeln(`ECP @executioncontrolprotocol.workflow ${manifest.version}`)
  }
  const label = manifest.workflow.label
  const wfLine = label
    ? `WORKFLOW ${manifest.workflow.id} ${formatLiteral(label, writer.quote)}`
    : `WORKFLOW ${manifest.workflow.id}`
  writer.writeln(wfLine)

  for (const node of manifest.steps) {
    if (node.type && node.type !== "step") {
      continue
    }
    const step = node as StepNode
    writer.writeln(`STEP ${step.id} USES ${step.uses}`)
    if (step.label) {
      writer.writeln(`LABEL ${formatLiteral(step.label, writer.quote)}`, 1)
    }
    if (step.input) {
      for (const [key, value] of Object.entries(step.input)) {
        formatInputValue(key, value, 1, writer)
      }
    }
    if (step.as) {
      const modePart = step.mode ? ` MODE ${step.mode}` : ""
      writer.writeln(`AS ${step.as}${modePart}`, 1)
    } else if (step.mode) {
      writer.writeln(`MODE ${step.mode}`, 1)
    }
    if (step.when) {
      formatWhen(step.when, 1, writer)
    }
  }

  return writer.toString()
}
