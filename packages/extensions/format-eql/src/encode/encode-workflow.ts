import type { StepNode, WorkflowManifest } from "@executioncontrolprotocol/types"
import type { EqlFormatOptions } from "../schemas.js"
import type { EcpFormatOptions } from "@executioncontrolprotocol/types"
import { jsonSchemaToEqlTypeMap } from "../workflow-io-eql.js"
import { EqlWriter, formatInputValue, formatLiteral, formatWhen } from "./writer.js"

function writeIoTypeMap(
  block: "ACCEPTS" | "RETURNS",
  typeMap: Record<string, string> | undefined,
  writer: EqlWriter
): void {
  if (!typeMap || Object.keys(typeMap).length === 0) return
  writer.writeln(block)
  const prefix = block === "ACCEPTS" ? "WITH" : "OUT"
  for (const [name, type] of Object.entries(typeMap)) {
    writer.writeln(`${prefix} ${name}:${type}`, 1)
  }
}

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

  const accepts = jsonSchemaToEqlTypeMap(
    manifest.workflow.accepts as Record<string, unknown> | undefined
  )
  const returns = jsonSchemaToEqlTypeMap(
    manifest.workflow.returns as Record<string, unknown> | undefined
  )
  writeIoTypeMap("ACCEPTS", accepts, writer)
  writeIoTypeMap("RETURNS", returns, writer)

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
