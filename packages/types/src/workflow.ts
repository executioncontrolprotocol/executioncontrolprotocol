import type { CapabilityId, CommitMode, ExprValue, InputValue } from "./schema.js"
import type { EcpVersion } from "./version.js"

/** Portable workflow manifest. @category Workflow */
export interface WorkflowManifest {
  schema: "@executioncontrolprotocol.workflow"
  version: EcpVersion
  workflow: {
    id: string
    label?: string
  }
  steps: WorkflowNode[]
}

/** Workflow graph node union. @category Workflow */
export type WorkflowNode = StepNode | ParallelNode | BranchNode | LoopNode

/** Single capability step. @category Workflow */
export interface StepNode {
  type?: "step"
  id: string
  label?: string
  uses: CapabilityId | string
  input?: Record<string, InputValue>
  /** State key for committed output (fluent `.as()`). */
  as?: string
  /** Commit mode when `as` is set (fluent `.as(key, { mode })`). */
  mode?: CommitMode
  when?: ExprValue
}

/** Parallel branches. @category Workflow */
export interface ParallelNode {
  type: "parallel"
  id: string
  label?: string
  branches: WorkflowNode[][]
}

/** Conditional branches. @category Workflow */
export interface BranchNode {
  type: "branch"
  id: string
  label?: string
  branches: Array<{
    label?: string
    when: ExprValue
    steps: WorkflowNode[]
  }>
}

/** Loop until condition. @category Workflow */
export interface LoopNode {
  type: "loop"
  id: string
  label?: string
  until?: ExprValue
  maxRounds?: number
  steps: WorkflowNode[]
}
