import type {
  ExpressionEngine,
  JsonValue,
  LoopPartialFile,
  RunClock,
  RunEventType,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { MAX_LOOP_CONCURRENCY, MAX_LOOP_ITEMS } from "@executioncontrolprotocol/protocol"
import { collectLoopBodyExportKeys, diffWrittenKeys } from "./collect-keys.js"
import { resolveValue } from "./resolve.js"

const MAX_FOR_COUNT = 1000

/** Minimal loop node shape for round / item collection at run time. */
export interface LoopItemsNodeLike {
  id: string
  mode?: "for" | "forEach"
  input?: unknown
  as?: string
  steps?: unknown[]
  concurrency?: number
  onError?: "fail" | "continue"
}

/** Runtime slice passed into the loop executor. */
export interface LoopItemsRuntime {
  runId: string
  loopItemsDepth: number
  items?: number[]
  completed?: Set<string>
  controller: AbortController
  interrupted: boolean
  cursor: {
    loopItems: Record<string, { completed: number[] }>
    loops?: Record<string, number>
    choices?: Record<string, "then" | "else">
  }
  deps: {
    clock?: RunClock
    expression: ExpressionEngine
    readText?: (path: string) => Promise<string>
    executionDir?: string
    store?: {
      readLoopPartial?(runId: string, nodeId: string): Promise<LoopPartialFile | undefined>
      writeLoopPartial?(runId: string, nodeId: string, file: LoopPartialFile): Promise<void>
    }
    cursor?: { loopItems?: Record<string, { completed: number[] }>; loops?: Record<string, number> }
  }
}

export interface ExecuteLoopItemsDeps {
  /** Run body steps for one iteration state. */
  runBody: (
    steps: unknown[],
    itemState: Record<string, unknown>,
    itemRuntime: LoopItemsRuntime,
    emit: (type: RunEventType, data: Record<string, unknown>) => void,
    prefix: string,
    round: number,
  ) => Promise<void>
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
  for (const key of Object.keys(partial.rounds)) {
    const index = Number(key)
    if (!Number.isNaN(index)) completed.add(index)
  }
  for (const index of fromCursor ?? []) completed.add(index)
  return completed
}

function publishEmptyArrays(parentState: Record<string, unknown>, keys: Iterable<string>): void {
  for (const key of keys) {
    parentState[key] = []
  }
}

function mergeRoundsToArrays(rounds: Array<Record<string, JsonValue | null> | null>, exportKeys: Set<string>): Record<string, JsonValue[]> {
  const out: Record<string, JsonValue[]> = {}
  for (const key of exportKeys) {
    out[key] = rounds.map((slot) => (slot && Object.prototype.hasOwnProperty.call(slot, key) ? (slot[key] ?? null) : null))
  }
  return out
}

async function resolveForEachItems(
  node: LoopItemsNodeLike,
  parentState: Record<string, unknown>,
  expression: ExpressionEngine,
  readText: LoopItemsRuntime["deps"]["readText"],
  executionDir: string | undefined,
  nodePointer: string,
): Promise<unknown[]> {
  const raw = await resolveValue(node.input ?? {}, parentState, expression, readText, executionDir)
  const resolved = isRecord(raw) ? raw.items : undefined
  if (!Array.isArray(resolved)) {
    throw Object.assign(new Error("Loop items must resolve to an array."), {
      code: "ECP_TYPE_MISMATCH",
      path: `${nodePointer}/input/items`,
    })
  }
  return structuredClone(resolved)
}

async function resolveForCount(
  node: LoopItemsNodeLike,
  parentState: Record<string, unknown>,
  expression: ExpressionEngine,
  readText: LoopItemsRuntime["deps"]["readText"],
  executionDir: string | undefined,
  nodePointer: string,
): Promise<number> {
  const raw = await resolveValue(node.input ?? {}, parentState, expression, readText, executionDir)
  const value = isRecord(raw) ? raw.count : undefined
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw Object.assign(new Error("Loop count must be a non-negative integer."), {
      code: "ECP_TYPE_MISMATCH",
      path: `${nodePointer}/input/count`,
    })
  }
  if (value > MAX_FOR_COUNT) {
    throw Object.assign(new Error(`Loop count exceeds the limit of ${MAX_FOR_COUNT}.`), {
      code: "ECP_LIMIT_EXCEEDED",
      path: `${nodePointer}/input/count`,
    })
  }
  return value
}

/**
 * Execute a `for` or `forEach` loop; body writes merge to arrays on the parent when the loop finishes.
 * @category Environment
 */
export async function executeLoopItems(
  node: LoopItemsNodeLike,
  parentState: Record<string, unknown>,
  runtime: LoopItemsRuntime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  nodePointer: string,
  deps: ExecuteLoopItemsDeps,
): Promise<void> {
  const mode = node.mode ?? "forEach"
  const asKey = node.as
  if (!asKey) {
    throw Object.assign(new Error("Loop node is incomplete."), { code: "ECP_STEP_FAILED", path: nodePointer })
  }
  const asIndexKey = `${asKey}Index`
  const onError = mode === "forEach" ? (node.onError ?? "fail") : "fail"
  const concurrency =
    mode === "forEach" ? Math.min(Math.max(node.concurrency ?? 1, 1), MAX_LOOP_CONCURRENCY) : 1
  const clock = runtime.deps.clock ?? defaultRunClock()
  const writePartial = runtime.loopItemsDepth === 0

  const base = structuredClone(parentState)
  const exportKeys = collectLoopBodyExportKeys(node.steps ?? [], asKey, asIndexKey)

  let iterationCount: number
  let driverItems: unknown[] | undefined
  if (mode === "forEach") {
    driverItems = await resolveForEachItems(
      node,
      parentState,
      runtime.deps.expression,
      runtime.deps.readText,
      runtime.deps.executionDir,
      nodePointer,
    )
    if (driverItems.length > MAX_LOOP_ITEMS) {
      throw Object.assign(new Error(`Loop items exceed the limit of ${MAX_LOOP_ITEMS}.`), {
        code: "ECP_LIMIT_EXCEEDED",
        path: nodePointer,
      })
    }
    iterationCount = driverItems.length
  } else {
    iterationCount = await resolveForCount(
      node,
      parentState,
      runtime.deps.expression,
      runtime.deps.readText,
      runtime.deps.executionDir,
      nodePointer,
    )
  }

  let partial: LoopPartialFile = { rounds: {}, errors: [] }
  if (writePartial && runtime.deps.store?.readLoopPartial) {
    partial = (await runtime.deps.store.readLoopPartial(runtime.runId, node.id)) ?? partial
  }

  const cursorCompleted =
    mode === "forEach"
      ? runtime.deps.cursor?.loopItems?.[node.id]?.completed
      : runtime.deps.cursor?.loops?.[node.id] !== undefined
        ? Array.from({ length: (runtime.deps.cursor.loops[node.id] ?? 0) + 1 }, (_, index) => index)
        : undefined
  const completed = mergeCompleted(partial, cursorCompleted)

  if (mode === "forEach") {
    emit("loop.start", { nodeId: node.id, count: iterationCount })
  }

  if (iterationCount === 0) {
    publishEmptyArrays(parentState, exportKeys)
    if (mode === "forEach") emit("loop.end", { nodeId: node.id, count: 0, failed: 0 })
    return
  }

  const roundSlots: Array<Record<string, JsonValue | null> | null | undefined> = new Array(iterationCount)
  for (const [key, slot] of Object.entries(partial.rounds)) {
    const index = Number(key)
    if (!Number.isNaN(index) && index >= 0 && index < iterationCount) roundSlots[index] = slot ?? null
  }

  const errors = [...partial.errors]
  let stopStarting = false
  let lowestFailure: { index: number; issue: ValidationIssue } | undefined
  let failedCount = 0
  let partialChain: Promise<void> = Promise.resolve()

  const signal = runtime.controller.signal

  const updateCursor = (index: number): void => {
    if (mode === "forEach") {
      const bucket = runtime.cursor.loopItems[node.id] ?? { completed: [] }
      if (!bucket.completed.includes(index)) bucket.completed.push(index)
      bucket.completed.sort((a, b) => a - b)
      runtime.cursor.loopItems[node.id] = bucket
    } else if (runtime.cursor.loops) {
      runtime.cursor.loops[node.id] = index
    }
  }

  const recordPartial = async (
    index: number,
    slot: Record<string, JsonValue | null> | null,
    error?: ValidationIssue,
  ): Promise<void> => {
    if (!writePartial || !runtime.deps.store?.writeLoopPartial) return
    await (partialChain = partialChain.then(async () => {
      const next: LoopPartialFile = {
        rounds: { ...partial.rounds, [String(index)]: slot },
        errors: error ? [...partial.errors, { index, error }] : partial.errors,
      }
      partial = next
      await runtime.deps.store?.writeLoopPartial?.(runtime.runId, node.id, next)
      updateCursor(index)
    }))
  }

  const runIteration = async (index: number): Promise<void> => {
    if (completed.has(index)) {
      roundSlots[index] = partial.rounds[String(index)] ?? null
      return
    }
    if (signal.aborted || runtime.interrupted || stopStarting) return

    const started = clock.now()
    if (mode === "forEach") emit("loop.item.start", { nodeId: node.id, index })
  if (mode === "for") {
      runtime.cursor.loops = runtime.cursor.loops ?? {}
      runtime.cursor.loops[node.id] = index
      emit("loop.round", { nodeId: node.id, round: index })
    }

    const itemState = structuredClone(base)
    if (mode === "forEach" && driverItems) {
      itemState[asKey] = structuredClone(driverItems[index])
    } else {
      itemState[asKey] = index
    }
    itemState[asIndexKey] = index

    const itemRuntime = Object.assign(Object.create(runtime) as LoopItemsRuntime, {
      items: [...(runtime.items ?? []), index],
      loopItemsDepth: runtime.loopItemsDepth + 1,
      completed: new Set<string>(),
      cursor: {
        loopItems: runtime.cursor.loopItems,
        choices: {},
        loops: {},
      },
      deps: { ...runtime.deps, cursor: undefined },
    })

    try {
      await deps.runBody(node.steps ?? [], itemState, itemRuntime, emit, `${nodePointer}/steps`, index)
      const written = diffWrittenKeys(base, itemState, [asKey, asIndexKey])
      for (const key of exportKeys) {
        if (!Object.prototype.hasOwnProperty.call(written, key)) {
          written[key] = null
        }
      }
      const slot = written as Record<string, JsonValue | null>
      roundSlots[index] = slot
      completed.add(index)
      await recordPartial(index, slot)
      if (mode === "forEach") emit("loop.item.end", { nodeId: node.id, index, durationMs: clock.now() - started })
    } catch (error) {
      const issue = deps.toIssue(error)
      failedCount += 1
      if (mode === "forEach") emit("loop.item.error", { nodeId: node.id, index, error: issue })
      if (onError === "continue") {
        const nullSlot: Record<string, JsonValue | null> = {}
        for (const key of exportKeys) nullSlot[key] = null
        roundSlots[index] = nullSlot
        errors.push({ index, error: issue })
        completed.add(index)
        await recordPartial(index, nullSlot, issue)
        if (mode === "forEach") emit("loop.item.end", { nodeId: node.id, index, durationMs: clock.now() - started })
        return
      }
      if (!lowestFailure || index < lowestFailure.index) {
        lowestFailure = {
          index,
          issue: {
            ...issue,
            path: nodePointer,
            ...(issue.details ? { details: { ...issue.details, index } } : { details: { index } }),
          },
        }
      }
      stopStarting = true
    }
  }

  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, iterationCount) }, async () => {
    while (nextIndex < iterationCount) {
      if (signal.aborted || runtime.interrupted) return
      if (stopStarting && onError === "fail") return
      const index = nextIndex
      nextIndex += 1
      await runIteration(index)
    }
  })
  await Promise.all(workers)
  await partialChain

  if (signal.aborted || runtime.interrupted) {
    if (mode === "forEach") emit("loop.end", { nodeId: node.id, count: iterationCount, failed: failedCount })
    return
  }

  if (lowestFailure) {
    if (mode === "forEach") emit("loop.end", { nodeId: node.id, count: iterationCount, failed: failedCount })
    throw Object.assign(new Error(lowestFailure.issue.message), {
      code: lowestFailure.issue.code,
      path: lowestFailure.issue.path,
      details: { index: lowestFailure.index, ...(lowestFailure.issue.details ?? {}) },
    })
  }

  const ordered = roundSlots.map((slot, index) =>
    completed.has(index) ? (slot ?? null) : null,
  ) as Array<Record<string, JsonValue | null> | null>
  const merged = mergeRoundsToArrays(ordered, exportKeys)
  for (const [key, values] of Object.entries(merged)) {
    if (Object.prototype.hasOwnProperty.call(parentState, key) && parentState[key] !== undefined) {
      throw Object.assign(new Error(`Loop writes ${key}, which already exists in the parent scope.`), {
        code: "ECP_COMMIT_CONFLICT",
        path: `${nodePointer}/steps`,
      })
    }
    parentState[key] = values
  }
  if (mode === "forEach") emit("loop.end", { nodeId: node.id, count: iterationCount, failed: failedCount })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}