import type { RunStatus } from "./schema.js"
import type { EcpVersion } from "./version.js"
import type { MutationRecord } from "./store.js"
import type { WorkflowManifest } from "./workflow.js"

/** Run request document. @category Runtime */
export interface RunRequest {
  schema: "@executioncontrolprotocol.run.request"
  version: EcpVersion
  workflow: WorkflowManifest
  input?: Record<string, unknown>
  actor?: Record<string, unknown>
  dryRun?: boolean
}

/** Per-step run history record. @category Runtime */
export interface StepRunRecord {
  status: RunStatus
  output?: unknown
  committedAs?: string | null
  attempts?: number
  usage?: Record<string, unknown>
  mutations?: MutationRecord[]
}

/** Run result document. @category Runtime */
export interface RunResult {
  schema: "@executioncontrolprotocol.run.result"
  version: EcpVersion
  run: {
    id: string
    status: RunStatus
  }
  state?: Record<string, unknown>
  history?: Record<string, StepRunRecord>
  usage?: Record<string, unknown>
}
