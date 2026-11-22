import type {
  ExpressionEngine,
  JsonValue,
  LoopPartialFile,
  RunClock,
  RunEventType,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { MAX_LOOP_CONCURRENCY, MAX_LOOP_ITEMS } from "@executioncontrolprotocol/protocol"
import { resolveStatePath } from "./resolve.js"

/** Minimal loop node shape for `forEach` mode at run time. */
export interface LoopItemsNodeLike {
  id: string
  ref?: string
  expr?: string
  as?: string
  steps?: unknown[]
  collect?: string
  into?: string
  concurrency?: number
  onError?: "fail" | "continue"
}

/** Runtime slice passed into the `forEach` loop executor. */
export interface LoopItemsRuntime {
  runId: string
  loopItemsDepth: number
  items?: number[]
  completed?: Set<string>
  controller: AbortController
  interrupted: boolean
  cursor: {
    loopItems: Record<string, { completed: number[] }>
  }
  deps: {
    clock?: RunClock
    expression: ExpressionEngine
    store?: {
      readLoopPartial?(runId: string, nodeId: string): Promise<LoopPartialFile | undefined>
      writeLoopPartial?(runId: string, nodeId: string, file: LoopPartialFile): Promise<void>
    }
    cursor?: { loopItems?: Record<string, { completed: number[] }> }
  }
}

export interface ExecuteLoopItemsDeps {
  /** Run body steps for one item state. */
  runBody: (
    steps: unknown[],
    itemState: Record<string, unknown>,
    itemRuntime: LoopItemsRuntime,
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

function mergeCompleted(partial: LoopPartialFile, fromCursor: number[] | undefined): Set<number> {
  const completed = new Set<number>()
  for (const key of Object.keys(partial.results)) {
    const index = Number(key)
    if (!Number.isNaN(index)) completed.add(index)
  }
  for (const index of fromCursor ?? []) completed.add(index)
  return completed
}

async function resolveLoopItemsSource(
  node: LoopItemsNodeLike,
  parentState: Record<string, unknown>,
  expression: ExpressionEngine,
  nodePointer: string,
): Promise<unknown[]> {
  let resolved: unknown
  if (typeof node.ref === "string") {
    resolved = resolveStatePath(node.ref, parentState)
  } else if (typeof node.expr === "string") {
    resolved = await expression.evaluate(node.expr, parentState, "value")
  } else {
    throw Object.assign(new Error("Loop node is incomplete."), { code: "ECP_STEP_FAILED", path: nodePointer })
  }
  if (!Array.isArray(resolved)) {
    throw Object.assign(new Error("Loop items must resolve to an array."), {
      code: "ECP_TYPE_MISMATCH",
      path: nodePointer,
    })
  }
  return structuredClone(resolved)
}

/**
 * Execute a loop node in `forEach` mode.
 * @category Environment
 */
export async function executeLoopItems(
  node: LoopItemsNodeLike,
  parentState: Record<string, unknown>,
  runtime: LoopItemsRuntime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  nodePointer: string,
  deps: ExecuteLoopItemsDeps,
): Promise<{ into: string; wroteErrorsKey: boolean }> {
  const asKey = node.as
  const into = node.into
  const collectPath = node.collect
  if (!asKey || !into || !collectPath) {
    throw Object.assign(new Error("forEach loop node is incomplete."), { code: "ECP_STEP_FAILED", path: nodePointer })
  }
  const asIndexKey = `${asKey}Index`
  const onError = node.onError ?? "fail"
  const concurrency = Math.min(Math.max(node.concurrency ?? 1, 1), MAX_LOOP_CONCURRENCY)
  const clock = runtime.deps.clock ?? defaultRunClock()
  const writePartial = runtime.loopItemsDepth === 0

  const itemsArray = await resolveLoopItemsSource(node, parentState, runtime.deps.expression, nodePointer)
  if (itemsArray.length > MAX_LOOP_ITEMS) {
    throw Object.assign(new Error(`Loop items exceed the limit of ${MAX_LOOP_ITEMS}.`), {
      code: "ECP_LIMIT_EXCEEDED",
      path: nodePointer,
    })
  }
  const base = structuredClone(parentState)

  let partial: LoopPartialFile = { results: {}, errors: [] }
  if (writePartial && runtime.deps.store?.readLoopPartial) {
    partial = (await runtime.deps.store.readLoopPartial(runtime.runId, node.id)) ?? partial
  }

  const cursorCompleted = runtime.deps.cursor?.loopItems?.[node.id]?.completed
  const completed = mergeCompleted(partial, cursorCompleted)

  emit("loop.start", { nodeId: node.id, count: itemsArray.length })

  if (Object.prototype.hasOwnProperty.call(parentState, into)) {
    throw Object.assign(new Error(`Loop creates ${into}, which already exists.`), {
      code: "ECP_COMMIT_CONFLICT",
      path: `${nodePointer}/into`,
    })
  }
  if (onError === "continue" && Object.prototype.hasOwnProperty.call(parentState, `${into}Errors`)) {
    throw Object.assign(new Error(`Loop creates ${into}Errors, which already exists.`), {
      code: "ECP_COMMIT_CONFLICT",
      path: `${nodePointer}/into`,
    })
  }

  if (itemsArray.length === 0) {
    parentState[into] = []
    if (onError === "continue") parentState[`${into}Errors`] = []
    emit("loop.end", { nodeId: node.id, count: 0, failed: 0 })
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
  let partialChain: Promise<void> = Promise.resolve()

  const signal = runtime.controller.signal
  const updateCursor = (index: number): void => {
    const bucket = runtime.cursor.loopItems[node.id] ?? { completed: [] }
    if (!bucket.completed.includes(index)) bucket.completed.push(index)
    bucket.completed.sort((a, b) => a - b)
    runtime.cursor.loopItems[node.id] = bucket
  }

  const recordPartial = async (index: number, value: JsonValue | null, error?: ValidationIssue): Promise<void> => {
    if (!writePartial || !runtime.deps.store?.writeLoopPartial) return
    await (partialChain = partialChain.then(async () => {
      const next: LoopPartialFile = {
        results: { ...partial.results, [String(index)]: value },
        errors: error ? [...partial.errors, { index, error }] : partial.errors,
      }
      partial = next
      await runtime.deps.store?.writeLoopPartial?.(runtime.runId, node.id, next)
      updateCursor(index)
    }))
  }

  const runItem = async (index: number): Promise<void> => {
    if (completed.has(index)) return
    if (signal.aborted || runtime.interrupted || stopStarting) return

    const started = clock.now()
    emit("loop.item.start", { nodeId: node.id, index })

    const itemState = structuredClone(base)
    itemState[asKey] = structuredClone(itemsArray[index])
    itemState[asIndexKey] = index

    const itemRuntime = Object.assign(Object.create(runtime) as LoopItemsRuntime, {
      items: [...(runtime.items ?? []), index],
      loopItemsDepth: runtime.loopItemsDepth + 1,
      completed: new Set<string>(),
      cursor: {
        completed: [],
        loops: {},
        branches: {},
        loopItems: runtime.cursor.loopItems,
      },
      deps: { ...runtime.deps, cursor: undefined },
    })

    try {
      await deps.runBody(node.steps ?? [], itemState, itemRuntime, emit, `${nodePointer}/steps`)
      const collected = resolveStatePath(collectPath, itemState)
      results[index] = collected
      completed.add(index)
      await recordPartial(index, collected as JsonValue)
      emit("loop.item.end", { nodeId: node.id, index, durationMs: clock.now() - started })
    } catch (error) {
      const issue = deps.toIssue(error)
      failedCount += 1
      emit("loop.item.error", { nodeId: node.id, index, error: issue })
      if (onError === "continue") {
        results[index] = null
        errors.push({ index, error: issue })
        completed.add(index)
        await recordPartial(index, null, issue)
        emit("loop.item.end", { nodeId: node.id, index, durationMs: clock.now() - started })
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
  await Promise.all(workers)

  await partialChain

  if (signal.aborted || runtime.interrupted) {
    emit("loop.end", { nodeId: node.id, count: itemsArray.length, failed: failedCount })
    return { into, wroteErrorsKey: false }
  }

  if (lowestFailure) {
    emit("loop.end", { nodeId: node.id, count: itemsArray.length, failed: failedCount })
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
  emit("loop.end", { nodeId: node.id, count: itemsArray.length, failed: failedCount })
  return { into, wroteErrorsKey }
}