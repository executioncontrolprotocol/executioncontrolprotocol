import type {
  CapabilityCall,
  CapabilityEntry,
  ConfigObject,
  ExecutionManifest,
  ExpressionEngine,
  RunCursor,
  RunEvent,
  RunEventType,
  RunStore,
  StepRecord,
  StepStatus,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { DEFAULT_STEP_TIMEOUT_MS } from "../container/constants.js"
import { HostSchemaSet } from "../validate/validate.js"
import { resolveValue, type ScriptReader } from "./resolve.js"

/**
 * One line in an execute response.
 * @category Environment
 */
export interface StepSummary {
  /** Node id. */
  nodeId: string
  /** Loop round, when the step ran inside a loop. */
  round?: number
  /** Step status. */
  status: StepStatus
  /** Wall time in milliseconds. */
  durationMs?: number
}

/**
 * Outcome of one run.
 * @category Environment
 */
export interface RunOutcome {
  /** Final status. */
  status: "completed" | "failed" | "cancelled" | "interrupted"
  /** Redacted result. */
  result: Record<string, unknown>
  /** Steps in start order. */
  steps: StepSummary[]
  /** Event types in order. */
  events: RunEventType[]
  /** Full events. */
  records: RunEvent[]
  /** Failure issue, when the run failed. */
  error?: ValidationIssue
  /** Cursor for resume, when the run was interrupted. */
  cursor?: RunCursor
  /** Final state. */
  state: Record<string, unknown>
}

/**
 * Services the executor calls. It does no I/O itself.
 * @category Environment
 */
export interface RunDependencies {
  /** Installed capabilities. */
  capabilities: readonly CapabilityEntry[]
  /** Invoke a capability. `store` receives staged writes. */
  call: (request: CapabilityCall, signal: AbortSignal, store: StateStore) => Promise<unknown>
  /** Expression sandbox. */
  expression: ExpressionEngine
  /** Resolve `$secret` keys. */
  getSecret?: (key: string) => Promise<string | undefined>
  /** Read `$env` names. */
  getEnv?: (name: string) => string | undefined
  /** Config objects. */
  configs?: readonly ConfigObject[]
  /** Read a script file. */
  readText?: ScriptReader
  /** Directory of the execution file. */
  executionDir?: string
  /** Parallel limit. Default 4. */
  maxConcurrency?: number
  /** Step timeout when the capability sets none. */
  defaultStepTimeoutMs?: number
  /** External cancel or interrupt signal. */
  signal?: AbortSignal
  /** Resume cursor. Skip completed nodes and restore loop and branch state. */
  cursor?: RunCursor
  /** Run id used when writing to {@link RunDependencies.store}. */
  runId?: string
  /** Persist steps, state and events. */
  store?: Pick<RunStore, "writeStep" | "writeState" | "appendEvent">
  /** Compiled schemas for run-time input and output checks. */
  schemas?: HostSchemaSet
}

/**
 * Staged writes applied only if the step succeeds.
 * @category Environment
 */
export interface StateStore {
  /** Replace the value at the handle path. */
  set(handle: { path: string }, value: unknown): void
  /** Shallow-merge an object at the handle path. */
  merge(handle: { path: string }, value: Record<string, unknown>): void
  /** Append a value at the handle path. */
  append(handle: { path: string }, value: unknown): void
}

/**
 * A started run that can be cancelled or interrupted.
 * @category Environment
 */
export interface ActiveRun {
  /** Settles when the run ends. */
  readonly outcome: Promise<RunOutcome>
  /** Abort in-flight steps. The outcome status is `cancelled`. */
  cancel(): void
  /** Mark the run interrupted. The outcome status is `interrupted`. */
  interrupt(reason?: string): void
}

interface StagedWrite {
  op: "set" | "merge" | "append"
  path: string
  value: unknown
}

interface NodeLike {
  type?: string
  id: string
  uses?: string
  expr?: string
  input?: unknown
  as?: string
  mode?: string
  config?: string
  steps?: NodeLike[]
  branches?: unknown
  maxRounds?: number
  maxConcurrency?: number
}

interface Runtime {
  deps: RunDependencies
  secrets: Set<string>
  steps: StepSummary[]
  records: RunEvent[]
  events: RunEventType[]
  seq: number
  controller: AbortController
  interrupted: boolean
  interruptReason?: string
  cursor: RunCursor
  completed: Set<string>
  schemas?: HostSchemaSet
  runId: string
}

/**
 * Run an execution to completion.
 * @category Environment
 */
export async function runExecution(
  manifest: ExecutionManifest,
  input: Record<string, unknown>,
  deps: RunDependencies,
): Promise<RunOutcome> {
  return startExecution(manifest, input, deps).outcome
}

/**
 * Start a run and return a handle that can cancel or interrupt it.
 * @category Environment
 */
export function startExecution(
  manifest: ExecutionManifest,
  input: Record<string, unknown>,
  deps: RunDependencies,
): ActiveRun {
  const controller = new AbortController()
  if (deps.signal) {
    if (deps.signal.aborted) controller.abort()
    else deps.signal.addEventListener("abort", () => controller.abort(), { once: true })
  }
  const runtime: Runtime = {
    deps,
    secrets: new Set(),
    steps: [],
    records: [],
    events: [],
    seq: 0,
    controller,
    interrupted: false,
    cursor: {
      completed: [...(deps.cursor?.completed ?? [])],
      inProgress: deps.cursor?.inProgress,
      loops: { ...(deps.cursor?.loops ?? {}) },
      branches: { ...(deps.cursor?.branches ?? {}) },
    },
    completed: new Set(deps.cursor?.completed ?? []),
    schemas: deps.schemas,
    runId: deps.runId ?? "run",
  }
  const state: Record<string, unknown> = { ...input }
  const emit = (type: RunEventType, data: Record<string, unknown>): void => {
    runtime.seq += 1
    const event: RunEvent = {
      seq: runtime.seq,
      at: new Date().toISOString(),
      type,
      data: redact(data, runtime.secrets) as Record<string, unknown>,
    }
    runtime.records.push(event)
    runtime.events.push(type)
    void runtime.deps.store?.appendEvent(runtime.runId, event)
  }
  const outcome = (async (): Promise<RunOutcome> => {
    emit("run.start", { manifestHash: "", input: redact(input, runtime.secrets) })
    if (deps.cursor?.inProgress) emit("run.resume", { rerunNodeId: deps.cursor.inProgress })
    try {
      await runNodes(asNodes(manifest.steps), state, runtime, emit, undefined)
      if (runtime.interrupted) {
        emit("run.interrupted", { reason: runtime.interruptReason ?? "host-restart" })
        emit("run.end", { status: "interrupted" })
        return finish("interrupted", manifest, state, runtime)
      }
      if (runtime.controller.signal.aborted) {
        emit("run.end", { status: "cancelled" })
        return finish("cancelled", manifest, state, runtime, {
          code: "ECP_RUN_CANCELLED",
          severity: "error",
          message: "The run was cancelled.",
          path: "",
        })
      }
      emit("run.end", { status: "completed" })
      return finish("completed", manifest, state, runtime)
    } catch (error) {
      if (runtime.interrupted) {
        emit("run.interrupted", { reason: runtime.interruptReason ?? "host-restart" })
        emit("run.end", { status: "interrupted" })
        return finish("interrupted", manifest, state, runtime)
      }
      const issue = toIssue(error, runtime.secrets)
      const cancelled = issue.code === "ECP_RUN_CANCELLED" || runtime.controller.signal.aborted
      emit("run.end", { status: cancelled ? "cancelled" : "failed", error: issue })
      return finish(cancelled ? "cancelled" : "failed", manifest, state, runtime, issue)
    }
  })()
  return {
    outcome,
    cancel() {
      controller.abort()
    },
    interrupt(reason = "host-restart") {
      runtime.interrupted = true
      runtime.interruptReason = reason
      controller.abort()
    },
  }
}

function finish(
  status: RunOutcome["status"],
  manifest: ExecutionManifest,
  state: Record<string, unknown>,
  runtime: Runtime,
  error?: ValidationIssue,
): RunOutcome {
  return {
    status,
    result: redact(selectResult(manifest, state), runtime.secrets) as Record<string, unknown>,
    steps: runtime.steps,
    events: runtime.events,
    records: runtime.records,
    error,
    cursor: {
      completed: [...runtime.completed],
      inProgress: runtime.cursor.inProgress,
      loops: { ...runtime.cursor.loops },
      branches: { ...runtime.cursor.branches },
    },
    state: redact(state, runtime.secrets) as Record<string, unknown>,
  }
}

async function runNodes(
  nodes: NodeLike[],
  state: Record<string, unknown>,
  runtime: Runtime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  round: number | undefined,
): Promise<void> {
  for (const node of nodes) {
    if (runtime.controller.signal.aborted || runtime.interrupted) return
    await runNode(node, state, runtime, emit, round)
  }
}

async function runNode(
  node: NodeLike,
  state: Record<string, unknown>,
  runtime: Runtime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  round: number | undefined,
): Promise<void> {
  if (runtime.completed.has(node.id) && runtime.cursor.inProgress !== node.id) return
  runtime.cursor.inProgress = node.id
  if (node.type === "branch") {
    await runBranch(node, state, runtime, emit, round)
  } else if (node.type === "loop") {
    await runLoop(node, state, runtime, emit)
  } else if (node.type === "parallel") {
    await runParallel(node, state, runtime, emit, round)
  } else {
    await runStep(node, state, runtime, emit, round)
  }
  if (!runtime.interrupted && !runtime.controller.signal.aborted) {
    runtime.completed.add(node.id)
    runtime.cursor.completed = [...runtime.completed]
    runtime.cursor.inProgress = undefined
  }
}

async function runStep(
  node: NodeLike,
  state: Record<string, unknown>,
  runtime: Runtime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  round: number | undefined,
): Promise<void> {
  const summary: StepSummary = { nodeId: node.id, status: "completed", ...(round === undefined ? {} : { round }) }
  if (node.expr) {
    const gate = await runtime.deps.expression.evaluate(node.expr, state, "control")
    if (gate !== true) {
      summary.status = "skipped"
      runtime.steps.push(summary)
      emit("step.skip", { nodeId: node.id, round })
      await persistStep(runtime, node, summary, {}, null, null)
      return
    }
  }
  runtime.steps.push(summary)
  const capability = runtime.deps.capabilities.find((item) => item.id === node.uses)
  emit("step.start", { nodeId: node.id, round, capabilityId: node.uses })
  const staged: StagedWrite[] = []
  const store = createStore(staged)
  const timeoutMs = capability?.timeoutMs ?? runtime.deps.defaultStepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS
  const timeout = new AbortController()
  const started = Date.now()
  const timer = setTimeout(() => timeout.abort(), timeoutMs)
  const signal = AbortSignal.any([runtime.controller.signal, timeout.signal])
  let resolvedInput: unknown = {}
  try {
    resolvedInput = await resolveValue(node.input ?? {}, state, runtime.deps.expression, runtime.deps.readText, runtime.deps.executionDir)
    if (capability && runtime.schemas) {
      const inputErrors = runtime.schemas.validateInput(capability, resolvedInput)
      if (inputErrors.length > 0) {
        throw Object.assign(new Error(inputErrors[0]?.message ?? "Input is invalid."), { code: "ECP_INPUT_INVALID" })
      }
    } else if (capability) {
      assertSchema(capability.accepts, resolvedInput, "ECP_INPUT_INVALID")
    }
    const config = await resolveConfig(node, runtime.deps, runtime.secrets)
    const output = await runtime.deps.call(
      {
        capabilityId: node.uses ?? "",
        input: resolvedInput,
        config,
        context: { runId: runtime.runId, stepId: node.id, round, state },
        store,
      },
      signal,
      store,
    )
    if (!isJson(output)) throw Object.assign(new Error("Capability output is not JSON."), { code: "ECP_OUTPUT_INVALID" })
    if (capability) assertSchema(capability.returns, output, "ECP_OUTPUT_INVALID")
    const redacted = redact(output, runtime.secrets)
    applyStaged(state, staged, runtime.secrets)
    commitAs(state, node, redacted)
    summary.status = "completed"
    summary.durationMs = Date.now() - started
    emit("step.end", { nodeId: node.id, round, as: node.as, durationMs: summary.durationMs })
    await persistStep(runtime, node, summary, resolvedInput, redacted, null)
    await runtime.deps.store?.writeState(runtime.runId, redact(state, runtime.secrets))
  } catch (error) {
    summary.durationMs = Date.now() - started
    if (timeout.signal.aborted && !runtime.controller.signal.aborted) {
      summary.status = "failed"
      const issue = { code: "ECP_STEP_TIMEOUT" as const, severity: "error" as const, message: "Step timed out.", path: "" }
      emit("step.error", { nodeId: node.id, round, error: issue })
      await persistStep(runtime, node, summary, resolvedInput, null, issue)
      throw Object.assign(new Error("Step timed out."), { code: "ECP_STEP_TIMEOUT" })
    }
    if (runtime.interrupted || runtime.controller.signal.aborted || signal.aborted) {
      summary.status = "cancelled"
      await persistStep(runtime, node, summary, resolvedInput, null, null)
      if (runtime.interrupted) return
      throw Object.assign(new Error("The run was cancelled."), { code: "ECP_RUN_CANCELLED" })
    }
    const issue = toIssue(error, runtime.secrets)
    summary.status = "failed"
    emit("step.error", { nodeId: node.id, round, error: issue })
    await persistStep(runtime, node, summary, resolvedInput, null, issue)
    throw Object.assign(new Error(issue.message), {
      code: issue.code,
      ...(issue.details ? { details: issue.details } : {}),
    })
  } finally {
    clearTimeout(timer)
  }
}

async function runBranch(
  node: NodeLike,
  state: Record<string, unknown>,
  runtime: Runtime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  round: number | undefined,
): Promise<void> {
  const arms = Array.isArray(node.branches) ? (node.branches as Array<{ expr?: string; steps?: NodeLike[] }>) : []
  const restored = runtime.cursor.branches[node.id]
  let selected: number | null = restored ?? null
  if (restored === undefined) {
    for (let index = 0; index < arms.length; index += 1) {
      const arm = arms[index]
      if (!arm) continue
      if (arm.expr === undefined) {
        selected = index
        break
      }
      const gate = await runtime.deps.expression.evaluate(arm.expr, state, "control")
      if (gate === true) {
        selected = index
        break
      }
    }
  }
  if (selected !== null) runtime.cursor.branches[node.id] = selected
  emit("branch.select", { nodeId: node.id, arm: selected })
  const chosen = selected === null ? undefined : arms[selected]
  if (chosen?.steps) await runNodes(asNodes(chosen.steps as never), state, runtime, emit, round)
}

async function runLoop(
  node: NodeLike,
  state: Record<string, unknown>,
  runtime: Runtime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
): Promise<void> {
  const maxRounds = node.maxRounds ?? 1
  const resumeRound = runtime.deps.cursor?.loops[node.id]
  const resumeNode = runtime.deps.cursor?.inProgress
  let round = resumeRound ?? 0
  while (round < maxRounds) {
    if (runtime.controller.signal.aborted || runtime.interrupted) return
    const gate = await runtime.deps.expression.evaluate(node.expr ?? "(state) => false", state, "control")
    if (gate !== true) break
    const isResumeRound = resumeRound !== undefined && round === resumeRound && Boolean(resumeNode)
    if (!isResumeRound) {
      for (const id of collectIds(node.steps ?? [])) {
        runtime.completed.delete(id)
      }
    }
    runtime.cursor.loops[node.id] = round
    emit("loop.round", { nodeId: node.id, round })
    await runNodes(node.steps ?? [], state, runtime, emit, round)
    round += 1
  }
  if (round >= maxRounds) emit("loop.exhausted", { nodeId: node.id, rounds: round })
}

function collectIds(nodes: NodeLike[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    ids.push(node.id)
    if (node.steps) ids.push(...collectIds(node.steps))
    if (Array.isArray(node.branches)) {
      for (const arm of node.branches) {
        if (Array.isArray(arm)) ids.push(...collectIds(arm as NodeLike[]))
        else if (isRecord(arm) && Array.isArray(arm.steps)) ids.push(...collectIds(arm.steps as NodeLike[]))
      }
    }
  }
  return ids
}

async function runParallel(
  node: NodeLike,
  state: Record<string, unknown>,
  runtime: Runtime,
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  round: number | undefined,
): Promise<void> {
  const lines = Array.isArray(node.branches) ? (node.branches as NodeLike[][]) : []
  const limit = node.maxConcurrency ?? runtime.deps.maxConcurrency ?? 4
  const local = new AbortController()
  const onParent = (): void => local.abort()
  runtime.controller.signal.addEventListener("abort", onParent)
  let failure: unknown
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, lines.length) }, async () => {
    while (cursor < lines.length) {
      const index = cursor
      cursor += 1
      const line = lines[index]
      if (!line || local.signal.aborted) return
      const child: Runtime = { ...runtime, controller: local }
      try {
        await runNodes(asNodes(line as never), state, child, emit, round)
      } catch (error) {
        if (!failure) {
          failure = error
          local.abort()
        }
      }
    }
  })
  await Promise.all(workers)
  runtime.controller.signal.removeEventListener("abort", onParent)
  if (failure) throw failure
}

async function persistStep(
  runtime: Runtime,
  node: NodeLike,
  summary: StepSummary,
  input: unknown,
  output: unknown,
  error: ValidationIssue | null,
): Promise<void> {
  if (!runtime.deps.store) return
  const record: StepRecord = {
    nodeId: node.id,
    round: summary.round ?? null,
    capabilityId: node.uses ?? "",
    status: summary.status,
    input: redact(input, runtime.secrets),
    output: redact(output, runtime.secrets),
    error,
    startedAt: new Date().toISOString(),
    durationMs: summary.durationMs,
  }
  await runtime.deps.store.writeStep(runtime.runId, record)
}

function createStore(staged: StagedWrite[]): StateStore {
  return {
    set(handle, value) {
      staged.push({ op: "set", path: handle.path, value })
    },
    merge(handle, value) {
      staged.push({ op: "merge", path: handle.path, value })
    },
    append(handle, value) {
      staged.push({ op: "append", path: handle.path, value })
    },
  }
}

function applyStaged(state: Record<string, unknown>, staged: StagedWrite[], secrets: Set<string>): void {
  for (const write of staged) {
    const value = redact(write.value, secrets)
    if (write.op === "set") setPath(state, write.path, value)
    else if (write.op === "append") {
      const current = getPath(state, write.path)
      setPath(state, write.path, [...(Array.isArray(current) ? current : []), value])
    } else if (isRecord(value)) {
      const current = getPath(state, write.path)
      setPath(state, write.path, { ...(isRecord(current) ? current : {}), ...value })
    }
  }
}

function commitAs(state: Record<string, unknown>, node: NodeLike, output: unknown): void {
  if (!node.as) return
  const mode = node.mode ?? "create"
  if (mode === "create" && Object.prototype.hasOwnProperty.call(state, node.as)) {
    throw Object.assign(new Error(`Step ${node.id} creates ${node.as}, which already exists.`), { code: "ECP_COMMIT_CONFLICT" })
  }
  if (mode === "merge") {
    if (!isRecord(output)) {
      throw Object.assign(new Error(`Step ${node.id} cannot merge a non-object into ${node.as}.`), { code: "ECP_COMMIT_CONFLICT" })
    }
    const current = state[node.as]
    state[node.as] = { ...(isRecord(current) ? current : {}), ...output }
    return
  }
  if (mode === "append") {
    const current = state[node.as]
    state[node.as] = [...(Array.isArray(current) ? current : []), output]
    return
  }
  state[node.as] = output
}

async function resolveConfig(
  node: NodeLike,
  deps: RunDependencies,
  secrets: Set<string>,
): Promise<Record<string, unknown> | undefined> {
  let configId = node.config
  if (!configId && node.uses) {
    const capability = deps.capabilities.find((item) => item.id === node.uses)
    if (capability) {
      const slash = capability.plugin.lastIndexOf("/")
      const short = slash >= 0 ? capability.plugin.slice(slash + 1) : capability.plugin
      configId = `${short}/default`
    }
  }
  if (!configId) return undefined
  const config = deps.configs?.find((item) => item.id === configId)
  if (!config) {
    if (node.config) {
      throw Object.assign(new Error(`Config ${node.config} does not exist.`), { code: "ECP_CONFIG_UNKNOWN" })
    }
    return undefined
  }
  return resolveSecrets(config.values, deps, secrets) as Promise<Record<string, unknown>>
}

async function resolveSecrets(value: unknown, deps: RunDependencies, secrets: Set<string>): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => resolveSecrets(item, deps, secrets)))
  if (!isRecord(value)) return value
  if (typeof value.$secret === "string") {
    const resolved = await deps.getSecret?.(value.$secret)
    if (resolved === undefined) {
      throw Object.assign(new Error(`Secret ${value.$secret} is not set. ecp secrets set ${value.$secret}`), {
        code: "ECP_SECRET_MISSING",
      })
    }
    secrets.add(resolved)
    return resolved
  }
  if (typeof value.$env === "string") return deps.getEnv?.(value.$env)
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) output[key] = await resolveSecrets(child, deps, secrets)
  return output
}

function selectResult(manifest: ExecutionManifest, state: Record<string, unknown>): Record<string, unknown> {
  const properties = manifest.execution?.returns?.properties
  if (!properties || typeof properties !== "object") return { ...state }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(properties as Record<string, unknown>)) result[key] = state[key]
  return result
}

function redact(value: unknown, secrets: Set<string>): unknown {
  if (typeof value === "string") {
    let output = value
    for (const secret of secrets) {
      if (secret.length > 0) output = output.split(secret).join("[redacted]")
    }
    return output
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets))
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redact(child, secrets)]))
}

function toIssue(error: unknown, secrets: Set<string> = new Set()): ValidationIssue {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "ECP_STEP_FAILED"
  const message = error instanceof Error ? error.message : "Step failed."
  const rawDetails = isRecord(error) && isRecord(error.details) ? error.details : undefined
  const details = rawDetails
    ? (redact(rawDetails, secrets) as Record<string, unknown>)
    : undefined
  return {
    code: code as ValidationIssue["code"],
    severity: "error",
    message,
    path: "",
    ...(details && Object.keys(details).length > 0 ? { details } : {}),
  }
}

function assertSchema(schema: Record<string, unknown> | undefined, value: unknown, code: "ECP_INPUT_INVALID" | "ECP_OUTPUT_INVALID"): void {
  if (!schema) return
  const type = schema.type
  if (type === "object") {
    if (!isRecord(value)) throw Object.assign(new Error(`Value must be an object.`), { code })
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
    for (const key of required) {
      if (value[key] === undefined) throw Object.assign(new Error(`Missing required property ${key}.`), { code })
    }
    if (isRecord(schema.properties)) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (value[key] === undefined || !isRecord(childSchema)) continue
        assertSchema(childSchema, value[key], code)
      }
    }
    return
  }
  if (type === "array" && !Array.isArray(value)) {
    throw Object.assign(new Error(`Value must be an array.`), { code })
  }
  if (type === "string" && typeof value !== "string") {
    throw Object.assign(new Error(`Value must be a string.`), { code })
  }
  if ((type === "number" || type === "integer") && typeof value !== "number") {
    throw Object.assign(new Error(`Value must be a number.`), { code })
  }
  if (type === "boolean" && typeof value !== "boolean") {
    throw Object.assign(new Error(`Value must be a boolean.`), { code })
  }
}

function setPath(state: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".")
  let current: Record<string, unknown> = state
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index] ?? ""
    if (!isRecord(current[key])) current[key] = {}
    current = current[key] as Record<string, unknown>
  }
  current[parts.at(-1) ?? ""] = value
}

function getPath(state: Record<string, unknown>, path: string): unknown {
  let current: unknown = state
  for (const part of path.split(".")) {
    if (!isRecord(current)) return undefined
    current = current[part]
  }
  return current
}

function asNodes(nodes: unknown[]): NodeLike[] {
  return nodes.map((node) => node as NodeLike)
}

function isJson(value: unknown): boolean {
  if (value === undefined) return false
  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
