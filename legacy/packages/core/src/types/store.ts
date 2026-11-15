/** Staged store mutation during capability execution. @category Runtime */
export interface PendingMutation {
  id: string
  op: "set" | "replace" | "merge" | "append"
  path: string
  value: unknown
  reason?: string
  metadata?: Record<string, unknown>
  status: "pending"
}

/** Committed or denied mutation record. @category Runtime */
export interface MutationRecord {
  id: string
  op: "set" | "replace" | "merge" | "append"
  path: string
  before: unknown
  after: unknown
  reason?: string
  metadata?: Record<string, unknown>
  status: "committed" | "denied" | "discarded" | "failed"
  stepId: string
  capability: string
  timestamp: string
}

/** Opaque mutable state handle from `state()`. @category Workflow */
export interface StoreStateHandle<T = unknown> {
  readonly path: string
  readonly __brand: T
}
