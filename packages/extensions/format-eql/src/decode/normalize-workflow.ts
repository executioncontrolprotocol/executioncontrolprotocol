import { LATEST_ECP_VERSION, type StepNode, type WorkflowManifest } from "@executioncontrolprotocol/types"
import type { EqlWorkflowDoc } from "./ast.js"
import { eqlTypeMapToJsonSchema } from "../workflow-io-eql.js"

export function workflowFromEql(doc: EqlWorkflowDoc): WorkflowManifest {
  const steps: StepNode[] = doc.steps.map((s) => {
    const node: StepNode = {
      type: "step",
      id: s.id,
      uses: s.uses,
    }
    if (s.label) node.label = s.label
    if (Object.keys(s.with).length > 0) node.input = s.with
    if (s.as) node.as = s.as
    if (s.mode) node.mode = s.mode as StepNode["mode"]
    if (s.when) node.when = s.when
    return node
  })

  const accepts = eqlTypeMapToJsonSchema(doc.accepts)
  const returns = eqlTypeMapToJsonSchema(doc.returns)

  return {
    schema: "@executioncontrolprotocol.workflow",
    version: LATEST_ECP_VERSION,
    workflow: {
      id: doc.workflowId,
      ...(doc.workflowLabel ? { label: doc.workflowLabel } : {}),
      ...(accepts ? { accepts } : {}),
      ...(returns ? { returns } : {}),
    },
    steps,
  }
}
