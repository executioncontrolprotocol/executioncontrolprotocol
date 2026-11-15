import type {
  CapabilityCall,
  CapabilityEntry,
  ConfigObject,
  ExecutionManifest,
  ExpressionEngine,
  RunEvent,
  RunEventType,
  StepStatus,
  ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { DEFAULT_STEP_TIMEOUT_MS } from "../container/constants.js"
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
}

/**
 * Outcome of one run.
 * @category Environment
 */
export interface RunOutcome {
  /** Final status. */
  status: "completed" | "failed" | "cancelled"
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
}

/**
 * Services the executor calls. It does no I/O itself.
 * @category Environment
 */
export interface RunDependencies {
  /** Installed capabilities. */
  capabilities: readonly CapabilityEntry[]
  /** Invoke a capability. `store` receives staged writes. */
  call: (
    request: CapabilityCall,
    signal: AbortSignal,
    store: StateStore,
  ) => Promise<unknown>
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
  /** Skip L0–L4. Used to exercise a run-time create conflict. */
  force?: boolean
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

/**
 * Run an execution. Validation failures return `failed` without running steps.
 * @category Environment
 */
export async function runExecution(
  manifest: ExecutionManifest,
  input: Record<string, unknown>,
  deps: RunDependencies,
): Promise<RunOutcome> {
  const state: Record<string, unknown> = { ...input }
  const secrets = new Set<string>()
  const steps: StepSummary[] = []
  const records: RunEvent[] = []
  const events: RunEventType[] = []
  let seq = 0
  const emit = (type: RunEventType, data: Record<string, unknown>): void => {
    seq += 1
    records.push({ seq, at: new Date().toISOString(), type, data: redact(data, secrets) as Record<string, unknown> })
    events.push(type)
  }
  const controller = new AbortController()
  emit("run.start", { manifestHash: "", input: redact(input, secrets) })
  try {
    await runNodes(asNodes(manifest.steps), state, deps, secrets, steps, emit, controller, undefined)
    emit("run.end", { status: "completed" })
    return { status: "completed", result: redact(selectResult(manifest, state), secrets) as Record<string, unknown>, steps, events, records }
  } catch (error) {
    const issue = toIssue(error)
    const cancelled = issue.code === "ECP_RUN_CANCELLED"
    emit("run.end", { status: cancelled ? "cancelled" : "failed", error: issue })
    return {
      status: cancelled ? "cancelled" : "failed",
      result: redact(selectResult(manifest, state), secrets) as Record<string, unknown>,
      steps,
      events,
      records,
      error: issue,
    }
  }
}

async function runNodes(
  nodes: NodeLike[],
  state: Record<string, unknown>,
  deps: RunDependencies,
  secrets: Set<string>,
  steps: StepSummary[],
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  controller: AbortController,
  round: number | undefined,
): Promise<void> {
  for (const node of nodes) {
    if (controller.signal.aborted) return
    await runNode(node, state, deps, secrets, steps, emit, controller, round)
  }
}

async function runNode(
  node: NodeLike,
  state: Record<string, unknown>,
  deps: RunDependencies,
  secrets: Set<string>,
  steps: StepSummary[],
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  controller: AbortController,
  round: number | undefined,
): Promise<void> {
  if (node.type === "branch") return runBranch(node, state, deps, secrets, steps, emit, controller, round)
  if (node.type === "loop") return runLoop(node, state, deps, secrets, steps, emit, controller)
  if (node.type === "parallel") return runParallel(node, state, deps, secrets, steps, emit, controller, round)
  await runStep(node, state, deps, secrets, steps, emit, controller, round)
}

async function runStep(
  node: NodeLike,
  state: Record<string, unknown>,
  deps: RunDependencies,
  secrets: Set<string>,
  steps: StepSummary[],
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  controller: AbortController,
  round: number | undefined,
): Promise<void> {
  const summary: StepSummary = { nodeId: node.id, status: "completed", ...(round === undefined ? {} : { round }) }
  if (node.expr) {
    const gate = await deps.expression.evaluate(node.expr, state, "control")
    if (gate !== true) {
      summary.status = "skipped"
      steps.push(summary)
      emit("step.skip", { nodeId: node.id, round })
      return
    }
  }
  steps.push(summary)
  const capability = deps.capabilities.find((item) => item.id === node.uses)
  emit("step.start", { nodeId: node.id, round, capabilityId: node.uses })
  const staged: StagedWrite[] = []
  const store = createStore(staged)
  const timeoutMs = capability?.timeoutMs ?? deps.defaultStepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), timeoutMs)
  const signal = AbortSignal.any([controller.signal, timeout.signal])
  try {
    const resolved = await resolveValue(node.input ?? {}, state, deps.expression, deps.readText, deps.executionDir)
    const config = await resolveConfig(node, deps, secrets)
    const output = await deps.call(
      {
        capabilityId: node.uses ?? "",
        input: resolved,
        config,
        context: { runId: "run", stepId: node.id, round, state },
      },
      signal,
      store,
    )
    if (!isJson(output)) throw Object.assign(new Error("Capability output is not JSON."), { code: "ECP_OUTPUT_INVALID" })
    const redacted = redact(output, secrets)
    applyStaged(state, staged, secrets)
    commitAs(state, node, redacted)
    summary.status = "completed"
    emit("step.end", { nodeId: node.id, round, as: node.as })
  } catch (error) {
    if (timeout.signal.aborted && !controller.signal.aborted) {
      summary.status = "failed"
      emit("step.error", { nodeId: node.id, round, error: { code: "ECP_STEP_TIMEOUT", message: "Step timed out." } })
      throw Object.assign(new Error("Step timed out."), { code: "ECP_STEP_TIMEOUT" })
    }
    if (controller.signal.aborted || signal.aborted) {
      summary.status = "cancelled"
      return
    }
    const issue = toIssue(error)
    summary.status = "failed"
    emit("step.error", { nodeId: node.id, round, error: issue })
    throw Object.assign(new Error(issue.message), { code: issue.code })
  } finally {
    clearTimeout(timer)
  }
}

async function runBranch(
  node: NodeLike,
  state: Record<string, unknown>,
  deps: RunDependencies,
  secrets: Set<string>,
  steps: StepSummary[],
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  controller: AbortController,
  round: number | undefined,
): Promise<void> {
  const arms = Array.isArray(node.branches) ? (node.branches as Array<{ expr?: string; steps?: NodeLike[] }>) : []
  let selected: number | null = null
  for (let index = 0; index < arms.length; index += 1) {
    const arm = arms[index]
    if (!arm) continue
    if (arm.expr === undefined) {
      selected = index
      break
    }
    const gate = await deps.expression.evaluate(arm.expr, state, "control")
    if (gate === true) {
      selected = index
      break
    }
  }
  emit("branch.select", { nodeId: node.id, arm: selected })
  const chosen = selected === null ? undefined : arms[selected]
  if (chosen?.steps) await runNodes(asNodes(chosen.steps as never), state, deps, secrets, steps, emit, controller, round)
}

async function runLoop(
  node: NodeLike,
  state: Record<string, unknown>,
  deps: RunDependencies,
  secrets: Set<string>,
  steps: StepSummary[],
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  controller: AbortController,
): Promise<void> {
  const maxRounds = node.maxRounds ?? 1
  let round = 0
  while (round < maxRounds) {
    const gate = await deps.expression.evaluate(node.expr ?? "(state) => false", state, "control")
    if (gate !== true) break
    emit("loop.round", { nodeId: node.id, round })
    await runNodes(node.steps ?? [], state, deps, secrets, steps, emit, controller, round)
    round += 1
  }
  if (round >= maxRounds) emit("loop.exhausted", { nodeId: node.id, rounds: round })
}

async function runParallel(
  node: NodeLike,
  state: Record<string, unknown>,
  deps: RunDependencies,
  secrets: Set<string>,
  steps: StepSummary[],
  emit: (type: RunEventType, data: Record<string, unknown>) => void,
  parent: AbortController,
  round: number | undefined,
): Promise<void> {
  const lines = Array.isArray(node.branches) ? (node.branches as NodeLike[][]) : []
  const limit = node.maxConcurrency ?? deps.maxConcurrency ?? 4
  const local = new AbortController()
  const onParent = (): void => local.abort()
  parent.signal.addEventListener("abort", onParent)
  let failure: unknown
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, lines.length) }, async () => {
    while (cursor < lines.length) {
      const index = cursor
      cursor += 1
      const line = lines[index]
      if (!line || local.signal.aborted) return
      try {
        await runNodes(asNodes(line as never), state, deps, secrets, steps, emit, local, round)
      } catch (error) {
        if (!failure) {
          failure = error
          local.abort()
        }
      }
    }
  })
  await Promise.all(workers)
  parent.signal.removeEventListener("abort", onParent)
  if (failure) throw failure
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
  if (!node.config) return undefined
  const config = deps.configs?.find((item) => item.id === node.config)
  if (!config) throw Object.assign(new Error(`Config ${node.config} does not exist.`), { code: "ECP_CONFIG_UNKNOWN" })
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

function toIssue(error: unknown): ValidationIssue {
  const code = isRecord(error) && typeof error.code === "string" ? error.code : "ECP_STEP_FAILED"
  const message = error instanceof Error ? error.message : "Step failed."
  return { code: code as ValidationIssue["code"], severity: "error", message, path: "" }
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
