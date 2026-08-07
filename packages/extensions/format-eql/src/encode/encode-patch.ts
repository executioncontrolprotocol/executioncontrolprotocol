import type { EcpPatchDocument, InputValue, StepNode } from "@executioncontrolprotocol/types"
import type { EqlFormatOptions } from "../schemas.js"
import type { EcpFormatOptions } from "@executioncontrolprotocol/types"
import { EqlWriter, formatInputValue, formatLiteral } from "./writer.js"

interface StepUpdateFields {
  label?: unknown
  uses?: unknown
  input: Record<string, InputValue>
  as?: unknown
  mode?: unknown
}

function encodeAddStepBlock(
  step: StepNode,
  depth: number,
  writer: EqlWriter,
  anchor: string
): void {
  writer.writeln(`ADD STEP ${step.id} USES ${step.uses}${anchor}`)
  if (step.label) {
    writer.writeln(`LABEL ${formatLiteral(step.label, writer.quote)}`, depth)
  }
  if (step.input) {
    for (const [key, value] of Object.entries(step.input)) {
      formatInputValue(key, value, depth, writer)
    }
  }
  if (step.as) {
    const modePart = step.mode ? ` MODE ${step.mode}` : ""
    writer.writeln(`AS ${step.as}${modePart}`, depth)
  }
}

function encodeStepBlock(step: StepNode, depth: number, writer: EqlWriter, prefix: string): void {
  writer.writeln(`${prefix} ${step.id} USES ${step.uses}`)
  if (step.label) {
    writer.writeln(`LABEL ${formatLiteral(step.label, writer.quote)}`, depth)
  }
  if (step.input) {
    for (const [key, value] of Object.entries(step.input)) {
      formatInputValue(key, value, depth, writer)
    }
  }
  if (step.as) {
    const modePart = step.mode ? ` MODE ${step.mode}` : ""
    writer.writeln(`AS ${step.as}${modePart}`, depth)
  }
}

function collectStepUpdates(patch: EcpPatchDocument): Map<string, StepUpdateFields> {
  const updates = new Map<string, StepUpdateFields>()
  for (const entry of patch.patches) {
    const stepMatch = entry.path.match(/^steps\[([^\]]+)\]\.(.+)$/)
    if (!stepMatch) continue
    const stepId = stepMatch[1]!
    const field = stepMatch[2]!
    let fields = updates.get(stepId)
    if (!fields) {
      fields = { input: {} }
      updates.set(stepId, fields)
    }
    if (field === "label" && entry.mode === "replace") {
      fields.label = entry.value
    } else if (field === "uses" && entry.mode === "replace") {
      fields.uses = entry.value
    } else if (field.startsWith("input.")) {
      fields.input[field.slice("input.".length)] = entry.value as InputValue
    } else if (field === "as" && entry.mode === "replace") {
      fields.as = entry.value
    } else if (field === "mode" && entry.mode === "replace") {
      fields.mode = entry.value
    }
  }
  return updates
}

function writeStepUpdate(stepId: string, fields: StepUpdateFields, writer: EqlWriter): void {
  writer.writeln(`UPDATE STEP ${stepId}`)
  if (fields.label !== undefined) {
    writer.writeln(`LABEL ${formatLiteral(fields.label, writer.quote)}`, 1)
  }
  if (fields.uses !== undefined) {
    writer.writeln(`USES ${fields.uses}`, 1)
  }
  for (const [key, value] of Object.entries(fields.input)) {
    formatInputValue(key, value, 1, writer)
  }
  if (fields.as !== undefined) {
    const modePart = fields.mode ? ` MODE ${fields.mode}` : ""
    writer.writeln(`AS ${fields.as}${modePart}`, 1)
  } else if (fields.mode !== undefined) {
    writer.writeln(`MODE ${fields.mode}`, 1)
  }
}

export function encodePatchToEql(
  patch: EcpPatchDocument,
  workflowId: string,
  options?: EcpFormatOptions & EqlFormatOptions,
  includeHeader = true
): string {
  const writer = new EqlWriter(options)
  if (includeHeader) {
    writer.writeln(`ECP @executioncontrolprotocol.patch ${patch.version}`)
  }
  writer.writeln(`PATCH WORKFLOW ${workflowId}`)

  const workflowLabelEntry = patch.patches.find(
    (p) => p.path === "workflow.label" && p.mode === "replace"
  )
  if (workflowLabelEntry?.value !== undefined) {
    writer.writeln("UPDATE WORKFLOW")
    writer.writeln(`LABEL ${formatLiteral(workflowLabelEntry.value, writer.quote)}`, 1)
  }

  const stepsReplace = patch.patches.find(
    (p) => p.path === "steps" && p.mode === "replace" && Array.isArray(p.value)
  )

  if (stepsReplace && stepsReplace.reason === "eql:add-steps") {
    const steps = stepsReplace.value as StepNode[]
    for (const step of steps) {
      encodeStepBlock(step, 1, writer, "ADD STEP")
    }
  }

  for (const entry of patch.patches) {
    if (entry.reason !== "eql:add-step") continue
    const payload = entry.value as {
      step: StepNode
      _eqlInsertAfter?: string
      _eqlInsertBefore?: string
    }
    const anchor =
      payload._eqlInsertAfter !== undefined
        ? ` AFTER ${payload._eqlInsertAfter}`
        : payload._eqlInsertBefore !== undefined
          ? ` BEFORE ${payload._eqlInsertBefore}`
          : ""
    encodeAddStepBlock(payload.step, 1, writer, anchor)
  }

  for (const [stepId, fields] of collectStepUpdates(patch)) {
    writeStepUpdate(stepId, fields, writer)
  }

  for (const entry of patch.patches) {
    if (entry.path === "workflow.id") continue
    if (entry.path === "workflow.label") continue
    if (entry.path.match(/^steps\[[^\]]+\]\./)) continue

    if (entry.reason === "eql:delete") {
      const m = entry.path.match(/^steps\[([^\]]+)\]$/)
      if (m) writer.writeln(`DELETE STEP ${m[1]}`)
      continue
    }
    if (entry.reason === "eql:move") {
      const m = entry.path.match(/^steps\[([^\]]+)\]$/)
      if (m && entry.value && typeof entry.value === "object") {
        const move = entry.value as { _eqlMoveAfter?: string; _eqlMoveBefore?: string }
        const anchor =
          move._eqlMoveAfter !== undefined
            ? ` AFTER ${move._eqlMoveAfter}`
            : move._eqlMoveBefore !== undefined
              ? ` BEFORE ${move._eqlMoveBefore}`
              : ""
        writer.writeln(`MOVE STEP ${m[1]}${anchor}`)
      }
      continue
    }
    if (entry.path === "steps" && (entry.reason === "eql:add-steps" || entry.reason === "eql:add-step")) {
      continue
    }
  }

  return writer.toString()
}
