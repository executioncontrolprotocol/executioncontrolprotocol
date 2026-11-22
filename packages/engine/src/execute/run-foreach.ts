import type {
  ForEachPartialFile,
  JsonValue,
  RunClock,
  RunEventType,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { MAX_FOREACH_CONCURRENCY, MAX_FOREACH_ITEMS } from "@executioncontrolprotocol/protocol"
import { resolveRefMarker } from "./resolve.js"

/** Minimal node shape the executor reads at run time. */
export interface ForEachNodeLike {
  id: string
  items?: unknown
  as?: string
  steps?: unknown[]
  collect?: unknown
  into?: string
  concurrency?: number
  throttle?: { starts: number; perSeconds: number }
  onError?: "fail" | "continue"
}

/** Runtime slice passed into the `forEach` executor. */
export interface ForEachRuntime {
  runId: string
  forEachDepth: number
  items?: number[]
  completed?: Set<string>
  controller: AbortController
  interrupted: boolean
  cursor: {
    forEach: Record<string, { completed: number[] }>
  }
  deps: {
    clock?: RunClock
    store?: {
      readForEachPartial?(runId: string, nodeId: string): Promise<ForEachPartialFile | undefined>
      writeForEachPartial?(runId: string, nodeId: string, file: ForEachPartialFile): Promise<void>
    }
    cursor?: { forEach?: Record<string, { completed: number[] }> }
  }
}

export interface ExecuteForEachDeps {
  /** Run body steps for one item state. */
  runBody: (
    steps: unknown[],
    itemState: Record<string, unknown>,
    itemRuntime: ForEachRuntime,
    emit: (type: RunEventType, data: Record<string, unknown>) => void,
    prefix: string,
  ) => Promise<void>
  /** Map errors to validation issues. */
  toIssue: (error: unknown) => ValidationIssue
}

/**
 * Default wall-clock implementation.
 * @category Environment
 */
export function defaultRunClock(): RunClock {
  return {
    now: () => Date.now(),
    sleep(ms, signal) {
      if (signal.aborted) {
        return Promise.reject(Object.assign(new Error("The run was cancelled."), { code: "ECP_RUN_CANCELLED" }))
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms)
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer)
            reject(Object.assign(new Error("The run was cancelled."), { code: "ECP_RUN_CANCELLED" }))
          },
          { once: true },
        )
      })
    },
  }
}

class ThrottleGate {
  private timestamps: number[] = []
  private chain: Promise<void> = Promise.resolve()

  async wait(starts: number, perSeconds: number, clock: RunClock, signal: AbortSignal): Promise<void> {
    await (this.chain = this.chain.then(async () => {
      const windowMs = perSeconds * 1000
      for (;;) {
        const now = clock.now()
        this.timestamps = this.timestamps.filter((stamp) => now - stamp < windowMs)
        if (this.timestamps.length < starts) {
          this.timestamps.push(now)
          return
        }
        // Every stamp left is inside the window, so the oldest one leaving it is always in the future.
        await clock.sleep(this.timestamps[0]! + windowMs - now, signal)
        if (signal.aborted) return
      }
    }))
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function mergeCompleted(
  partial: ForEachPartialFile,
  fromCursor: number[] | undefined,
): Set<number> {
  const completed = new Set<number>()
  for (const key of Object.keys(partial.results)) {
    const index = Number(key)
    if (!Number.isNaN(index)) completed.add(index)
  }
  for (const index of fromCursor ?? []) completed.add(index)
  return completed
}

/**
 * Execute a `forEach` node.
 * @category Environment
 */
export async function executeForEach(
  node: ForEachNodeLike,
  parentState: Record<string, unknown>,
  runtime: ForEachRuntime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  nodePointer: string,
  deps: ExecuteForEachDeps,
): Promise<{ into: string; wroteErrorsKey: boolean }> {
  const asKey = node.as
  const into = node.into
  if (!asKey || !into || !asRecord(node.items) || !asRecord(node.collect)) {
    throw Object.assign(new Error("forEach node is incomplete."), { code: "ECP_STEP_FAILED", path: nodePointer })
  }
  const asIndexKey = `${asKey}Index`
  const onError = node.onError ?? "fail"
  const concurrency = Math.min(Math.max(node.concurrency ?? 1, 1), MAX_FOREACH_CONCURRENCY)
  const clock = runtime.deps.clock ?? defaultRunClock()
  const writePartial = runtime.forEachDepth === 0

  const resolved = await resolveRefMarker(node.items as Record<string, unknown>, parentState)
  if (!Array.isArray(resolved)) {
    throw Object.assign(new Error("forEach items must resolve to an array."), { code: "ECP_TYPE_MISMATCH", path: `${nodePointer}/items` })
  }
  if (resolved.length > MAX_FOREACH_ITEMS) {
    throw Object.assign(
      new Error(`forEach items exceeds the limit of ${MAX_FOREACH_ITEMS}.`),
      { code: "ECP_LIMIT_EXCEEDED", path: `${nodePointer}/items` },
    )
  }
  const itemsArray = structuredClone(resolved)
  const base = structuredClone(parentState)

  let partial: ForEachPartialFile = { results: {}, errors: [] }
  if (writePartial && runtime.deps.store?.readForEachPartial) {
    partial = (await runtime.deps.store.readForEachPartial(runtime.runId, node.id)) ?? partial
  }

  const cursorCompleted = runtime.deps.cursor?.forEach?.[node.id]?.completed
  const completed = mergeCompleted(partial, cursorCompleted)

  emit("forEach.start", { nodeId: node.id, count: itemsArray.length })

  if (Object.prototype.hasOwnProperty.call(parentState, into)) {
    throw Object.assign(new Error(`forEach creates ${into}, which already exists.`), {
      code: "ECP_COMMIT_CONFLICT",
      path: `${nodePointer}/into`,
    })
  }
  if (onError === "continue" && Object.prototype.hasOwnProperty.call(parentState, `${into}Errors`)) {
    throw Object.assign(new Error(`forEach creates ${into}Errors, which already exists.`), {
      code: "ECP_COMMIT_CONFLICT",
      path: `${nodePointer}/into`,
    })
  }

  if (itemsArray.length === 0) {
    parentState[into] = []
    if (onError === "continue") parentState[`${into}Errors`] = []
    emit("forEach.end", { nodeId: node.id, count: 0, failed: 0 })
    return { into, wroteErrorsKey: onError === "continue" }
  }

  const results: Array<unknown | undefined> = new Array(itemsArray.length)
  for (const [key, value] of Object.entries(partial.results)) {
    const index = Number(key)
    if (!Number.isNaN(index) && index >= 0 && index < itemsArray.length) results[index] = value
  }

  const errors = [...partial.errors]
  let stopStarting = false
  let lowestFailure: { index: number; issue: ValidationIssue } | undefined
  let failedCount = 0
  const gate = node.throttle ? new ThrottleGate() : undefined
  let partialChain: Promise<void> = Promise.resolve()

  const signal = runtime.controller.signal
  // In-memory only: the run record's cursor is written when the run finishes or is interrupted. The partial
  // file is what resume reads, so a crash loses nothing, and no run-record write here races the publish ledger's.
  const updateCursor = (index: number): void => {
    const bucket = runtime.cursor.forEach[node.id] ?? { completed: [] }
    if (!bucket.completed.includes(index)) bucket.completed.push(index)
    bucket.completed.sort((a, b) => a - b)
    runtime.cursor.forEach[node.id] = bucket
  }

  const recordPartial = async (index: number, value: JsonValue | null, error?: ValidationIssue): Promise<void> => {
    if (!writePartial || !runtime.deps.store?.writeForEachPartial) return
    await (partialChain = partialChain.then(async () => {
      const next: ForEachPartialFile = {
        results: { ...partial.results, [String(index)]: value },
        errors: error ? [...partial.errors, { index, error }] : partial.errors,
      }
      partial = next
      await runtime.deps.store?.writeForEachPartial?.(runtime.runId, node.id, next)
      updateCursor(index)
    }))
  }

  const runItem = async (index: number): Promise<void> => {
    if (completed.has(index)) return
    if (gate && node.throttle) {
      await gate.wait(node.throttle.starts, node.throttle.perSeconds, clock, signal)
    }
    if (signal.aborted || runtime.interrupted || stopStarting) return

    const started = clock.now()
    emit("forEach.item.start", { nodeId: node.id, index })

    const itemState = structuredClone(base)
    itemState[asKey] = structuredClone(itemsArray[index])
    itemState[asIndexKey] = index

    // The prototype keeps live root fields (interrupted, controller) visible. The item gets its own completed set
    // and cursor so body steps and nested loops never touch the run's cursor, and no resume cursor: an unfinished
    // item restarts from its first step.
    const itemRuntime = Object.assign(Object.create(runtime) as ForEachRuntime, {
      items: [...(runtime.items ?? []), index],
      forEachDepth: runtime.forEachDepth + 1,
      completed: new Set<string>(),
      cursor: { completed: [], loops: {}, branches: {}, forEach: runtime.cursor.forEach },
      deps: { ...runtime.deps, cursor: undefined },
    })

    try {
      await deps.runBody(node.steps ?? [], itemState, itemRuntime, emit, `${nodePointer}/steps`)
      const collected = await resolveRefMarker(node.collect as Record<string, unknown>, itemState)
      results[index] = collected
      completed.add(index)
      await recordPartial(index, collected as JsonValue)
      emit("forEach.item.end", { nodeId: node.id, index, durationMs: clock.now() - started })
    } catch (error) {
      const issue = deps.toIssue(error)
      failedCount += 1
      emit("forEach.item.error", { nodeId: node.id, index, error: issue })
      if (onError === "continue") {
        results[index] = null
        errors.push({ index, error: issue })
        completed.add(index)
        await recordPartial(index, null, issue)
        emit("forEach.item.end", { nodeId: node.id, index, durationMs: clock.now() - started })
        return
      }
      if (!lowestFailure || index < lowestFailure.index) {
        lowestFailure = {
          index,
          issue: { ...issue, path: nodePointer, ...(issue.details ? { details: { ...issue.details, index } } : { details: { index } }) },
        }
      }
      stopStarting = true
    }
  }

  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, itemsArray.length) }, async () => {
    while (nextIndex < itemsArray.length) {
      if (signal.aborted || runtime.interrupted) return
      if (stopStarting && onError === "fail") return
      const index = nextIndex
      nextIndex += 1
      if (completed.has(index)) continue
      await runItem(index)
    }
  })
  // Each worker awaits its item, so this also waits for items still in flight after a failure.
  await Promise.all(workers)

  await partialChain

  if (signal.aborted || runtime.interrupted) {
    emit("forEach.end", { nodeId: node.id, count: itemsArray.length, failed: failedCount })
    return { into, wroteErrorsKey: false }
  }

  if (lowestFailure) {
    emit("forEach.end", { nodeId: node.id, count: itemsArray.length, failed: failedCount })
    throw Object.assign(new Error(lowestFailure.issue.message), {
      code: lowestFailure.issue.code,
      path: lowestFailure.issue.path,
      details: { index: lowestFailure.index, ...(lowestFailure.issue.details ?? {}) },
    })
  }

  const ordered = results.map((value, index) => (completed.has(index) ? value ?? null : null))
  parentState[into] = ordered
  const wroteErrorsKey = onError === "continue"
  if (wroteErrorsKey) {
    parentState[`${into}Errors`] = [...errors].sort((a, b) => a.index - b.index)
  }
  emit("forEach.end", { nodeId: node.id, count: itemsArray.length, failed: failedCount })
  return { into, wroteErrorsKey }
}