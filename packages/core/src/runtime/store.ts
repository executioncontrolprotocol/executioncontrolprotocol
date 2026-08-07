import type { PendingMutation, StoreStateHandle } from "@executioncontrolprotocol/types"
import { getAtPath, setAtPath } from "../util/path.js"

function randomUUID(): string {
  return globalThis.crypto.randomUUID()
}

/** Options for store reads. @category Runtime */
export interface StoreReadOptions {
  /** When true, include pending (uncommitted) mutations in the read. */
  includePending?: boolean
}

/** Options for store writes. @category Runtime */
export interface StoreWriteOptions {
  /** Human-readable reason for the mutation (policy/audit). */
  reason?: string
  /** Non-standard metadata attached to the pending mutation. */
  metadata?: Record<string, unknown>
}

/** Transactional store for capability handlers. @category Runtime */
export interface StoreContext {
  read<T = unknown>(
    handleOrPath: StoreStateHandle<T> | string,
    options?: StoreReadOptions
  ): Promise<T>

  set<T = unknown>(
    handle: StoreStateHandle<T>,
    value: T,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>

  replace<T = unknown>(
    handle: StoreStateHandle<T>,
    value: T,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>

  merge<T extends Record<string, unknown>>(
    handle: StoreStateHandle<T>,
    value: Partial<T>,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>

  append<T = unknown>(
    handle: StoreStateHandle<T[]>,
    value: T,
    options?: StoreWriteOptions
  ): Promise<PendingMutation>
}

export interface MutationBuffer {
  pending(): PendingMutation[]
  preview(state: Record<string, unknown>): Record<string, unknown>
  discard(): void
}

export function createMutationBuffer(
  _state: Record<string, unknown>,
  _allowedPaths: Set<string>
): MutationBuffer & { push(m: PendingMutation): void } {
  const mutations: PendingMutation[] = []

  return {
    pending: () => [...mutations],
    push(m: PendingMutation) {
      mutations.push(m)
    },
    preview(base: Record<string, unknown>) {
      const copy = structuredClone(base)
      for (const m of mutations) {
        if (m.op === "append") {
          const existing = getAtPath(copy, m.path)
          const arr = Array.isArray(existing) ? [...existing] : []
          arr.push(m.value)
          setAtPath(copy, m.path, arr)
        } else if (m.op === "merge" && typeof m.value === "object") {
          const existing = getAtPath(copy, m.path)
          setAtPath(copy, m.path, {
            ...(typeof existing === "object" && existing !== null ? existing : {}),
            ...(m.value as object),
          })
        } else {
          setAtPath(copy, m.path, m.value)
        }
      }
      return copy
    },
    discard() {
      mutations.length = 0
    },
  }
}

export function createTransactionalStore(options: {
  state: Record<string, unknown>
  buffer: MutationBuffer & { push(m: PendingMutation): void }
  allowedHandles: Set<string>
}): StoreContext {
  const { state, buffer, allowedHandles } = options

  function pathFromHandle(handle: StoreStateHandle | string): string {
    return typeof handle === "string" ? handle : handle.path
  }

  function assertAllowed(path: string): void {
    if (!allowedHandles.has(path)) {
      throw new Error(`Store write to '${path}' requires a state() handle in step input`)
    }
  }

  function record(
    op: PendingMutation["op"],
    path: string,
    value: unknown,
    opts?: StoreWriteOptions
  ): PendingMutation {
    assertAllowed(path)
    const m: PendingMutation = {
      id: randomUUID(),
      op,
      path,
      value,
      status: "pending",
      ...(opts?.reason ? { reason: opts.reason } : {}),
      ...(opts?.metadata ? { metadata: opts.metadata } : {}),
    }
    buffer.push(m)
    return m
  }

  return {
    async read(handleOrPath, readOpts) {
      const path = pathFromHandle(handleOrPath)
      const base = readOpts?.includePending ? buffer.preview(state) : state
      return getAtPath(base, path) as never
    },
    async set(handle, value, opts) {
      return record("set", pathFromHandle(handle), value, opts)
    },
    async replace(handle, value, opts) {
      return record("replace", pathFromHandle(handle), value, opts)
    },
    async merge(handle, value, opts) {
      return record("merge", pathFromHandle(handle), value, opts)
    },
    async append(handle, value, opts) {
      return record("append", pathFromHandle(handle), value, opts)
    },
  }
}

export function collectStateHandles(
  input: Record<string, unknown>
): Set<string> {
  const paths = new Set<string>()
  function walk(v: unknown): void {
    if (v && typeof v === "object" && "$state" in v) {
      paths.add(String((v as { $state: string }).$state))
    }
    if (v && typeof v === "object") {
      for (const child of Object.values(v)) walk(child)
    }
  }
  walk(input)
  return paths
}
