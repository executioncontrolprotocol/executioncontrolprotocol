import {
  LATEST_ECP_VERSION,
  type CommitMode,
  type EcpPatchDocument,
  type EcpPatchEntry,
  type StepNode,
} from "@executioncontrolprotocol/types"
import type { EqlPatchDoc, EqlStepAdd } from "./ast.js"

function stepNodeFromAdd(add: EqlStepAdd): StepNode {
  const node: StepNode = {
    type: "step",
    id: add.stepId,
    uses: add.uses,
  }
  if (add.label) node.label = add.label
  if (Object.keys(add.with).length > 0) node.input = add.with
  if (add.as) node.as = add.as
  if (add.mode) node.mode = add.mode as CommitMode
  if (add.when) node.when = add.when
  return node
}

export function patchFromEql(doc: EqlPatchDoc): EcpPatchDocument {
  const patches: EcpPatchEntry[] = []

  if (doc.workflowUpdate?.label !== undefined) {
    patches.push({
      path: "workflow.label",
      mode: "replace",
      value: doc.workflowUpdate.label,
    })
  }

  for (const update of doc.updates) {
    if (update.label !== undefined) {
      patches.push({
        path: `steps[${update.stepId}].label`,
        mode: "replace",
        value: update.label,
      })
    }
    if (update.uses !== undefined) {
      patches.push({
        path: `steps[${update.stepId}].uses`,
        mode: "replace",
        value: update.uses,
      })
    }
    for (const [key, value] of Object.entries(update.with)) {
      patches.push({
        path: `steps[${update.stepId}].input.${key}`,
        mode: "merge",
        value,
      })
    }
    if (update.as !== undefined) {
      patches.push({
        path: `steps[${update.stepId}].as`,
        mode: "replace",
        value: update.as,
      })
    }
    if (update.mode !== undefined) {
      patches.push({
        path: `steps[${update.stepId}].mode`,
        mode: "replace",
        value: update.mode,
      })
    }
    if (update.when !== undefined) {
      patches.push({
        path: `steps[${update.stepId}].when`,
        mode: "replace",
        value: update.when,
      })
    }
  }

  for (const stepId of doc.deletes) {
    patches.push({
      path: `steps[${stepId}]`,
      mode: "replace",
      value: null,
      reason: "eql:delete",
    })
  }

  for (const add of doc.adds) {
    patches.push({
      path: "steps",
      mode: "replace",
      value: {
        step: stepNodeFromAdd(add),
        _eqlInsertAfter: add.after,
        _eqlInsertBefore: add.before,
      },
      reason: "eql:add-step",
    })
  }

  for (const move of doc.moves) {
    patches.push({
      path: `steps[${move.stepId}]`,
      mode: "merge",
      value: {
        _eqlMoveAfter: move.after,
        _eqlMoveBefore: move.before,
      },
      reason: "eql:move",
    })
  }

  const withoutWorkflowId = patches.filter((p) => p.path !== "workflow.id")

  return {
    schema: "@executioncontrolprotocol.patch",
    version: LATEST_ECP_VERSION,
    targetSchema: "@executioncontrolprotocol.workflow",
    patches: [
      {
        path: "workflow.id",
        mode: "replace",
        value: doc.workflowId,
      },
      ...withoutWorkflowId,
    ],
  }
}
