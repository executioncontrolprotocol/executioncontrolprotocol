import type {
  CommitData,
  CommitInput,
  ConfigObject,
  ExecuteData,
  ExecuteInput,
  ExecutionManifest,
  ExpressionEngine as ExpressionEngineService,
  Formatter as FormatterService,
  OperationError,
  OperationResponse,
  RetrieveData,
  RetrieveInput,
  RunRecord,
  StorageProvider as StorageProviderService,
  ValidationResult,
} from "@executioncontrolprotocol/protocol"
import {
  ExpressionEngine,
  Formatter,
  IMPLEMENTATION_IDS,
  PluginAdapter,
  SecretsProvider,
  StorageProvider,
} from "@executioncontrolprotocol/protocol"
import type { ActiveRun } from "../execute/run.js"
import { startExecution } from "../execute/run.js"
import type { Operations, ResolvedHostSettings, ServiceLookup } from "../container/environment.js"
import { VERSION } from "../version.js"
import { closeMatches } from "../schema/suggest.js"
import { canonicalJson, sha256Hex } from "../schema/canonical.js"
import { HostSchemaSet, loadExecutionText, validateExecution } from "../validate/validate.js"
import { matchCandidates } from "./match.js"
import { applyPatch } from "./patch.js"

const DEFAULT_JSON_FORMATTER = IMPLEMENTATION_IDS.jsonFormatter
const DEFAULT_LIST_LIMIT = 10
const MAX_LIST_LIMIT = 100
const CANCEL_WAIT_MS = 10_000

/**
 * Options for {@link createOperations}.
 * @category Operations
 */
export interface OperationsOptions {
  /** Write `output.path` files. Injected by the host; never `node:fs` here. */
  writeTextFile?: (path: string, text: string) => Promise<void>
  /** Host settings used for timeouts and concurrency. */
  settings?: ResolvedHostSettings
  /** Override run id creation. */
  createRunId?: () => string
}

interface LiveRun {
  handle: ActiveRun
  controller: AbortController
  promise: Promise<void>
}

/**
 * Build retrieve / execute / commit against the service lookup.
 * @category Operations
 */
export function createOperations(services: ServiceLookup, options: OperationsOptions = {}): Operations {
  const live = new Map<string, LiveRun>()
  const createRunId = options.createRunId ?? defaultRunId

  return {
    retrieve: (input) => retrieve(services, input, options),
    execute: (input) => execute(services, input, options, live, createRunId),
    commit: (input) => commit(services, input),
  }
}

async function retrieve(
  services: ServiceLookup,
  input: RetrieveInput,
  options: OperationsOptions,
): Promise<OperationResponse<RetrieveData>> {
  try {
    if (input.id !== undefined && input.query !== undefined) {
      return fail("ECP_REQUEST_INVALID", "Pass id or query, not both.")
    }
    const limit = clampLimit(input.limit)
    const payload = await loadRetrievePayload(services, input, limit)
    if (!payload.ok) return payload

    const formatId = input.format ?? DEFAULT_JSON_FORMATTER
    if (formatId !== DEFAULT_JSON_FORMATTER) {
      const formatter = findFormatter(services, formatId)
      if (!formatter) {
        return fail("ECP_NOT_FOUND", `Formatter ${formatId} was not found.`, {
          suggestions: services.getAll(Formatter).map((_, index) => `formatter-${index}`),
        })
      }
      const text = formatter.format(payload.data)
      if (input.output?.path) {
        return writeOutput(options, input.type, input.output.path, text, `Formatted ${input.type} as ${formatId}.`)
      }
      return ok({ type: input.type, format: formatId, text })
    }

    if (input.output?.path) {
      const text = JSON.stringify(payload.data, null, 2)
      return writeOutput(options, input.type, input.output.path, text, `Wrote ${input.type} JSON.`)
    }
    return ok(payload.data)
  } catch (error) {
    return fromThrown(error)
  }
}

async function loadRetrievePayload(
  services: ServiceLookup,
  input: RetrieveInput,
  limit: number,
): Promise<OperationResponse<RetrieveData>> {
  const plugins = services.get(PluginAdapter)
  const storage = services.get(StorageProvider)

  if (input.type === "capability") {
    const all = plugins.capabilities()
    if (input.id) {
      const item = all.find((capability) => capability.id === input.id)
      if (!item) {
        return fail("ECP_NOT_FOUND", `Capability ${input.id} was not found.`, {
          suggestions: closeMatches(input.id, all.map((capability) => capability.id)),
        })
      }
      return ok({ type: "capability", item })
    }
    if (input.query) {
      const hits = matchCandidates(
        input.query,
        all.map((capability) => ({
          id: capability.id,
          summary: capability.summary,
          description: [capability.description, ...capability.useCases].join(" "),
        })),
        limit,
      )
      return ok({
        type: "capability",
        items: hits.map((hit) => {
          const capability = all.find((item) => item.id === hit.id)
          return {
            id: hit.id,
            summary: capability?.summary,
            plugin: capability?.plugin,
            score: hit.score,
          }
        }),
        total: hits.length,
      })
    }
    const items = [...all].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit)
    return ok({ type: "capability", items, total: all.length })
  }

  if (input.type === "execution") {
    if (input.id) {
      const item = await storage.getExecution(input.id)
      if (!item) {
        const ids = (await storage.listExecutions()).map((row) => row.id)
        return fail("ECP_NOT_FOUND", `Execution ${input.id} was not found.`, { suggestions: closeMatches(input.id, ids) })
      }
      return ok({ type: "execution", item })
    }
    const listed = await storage.listExecutions()
    if (input.query) {
      const full = await Promise.all(listed.map(async (row) => storage.getExecution(row.id)))
      const candidates = full
        .filter((item): item is NonNullable<typeof item> => item !== undefined)
        .map((item) => ({
          id: item.id,
          summary: item.manifest.execution?.label,
          description: item.manifest.execution?.description,
        }))
      const hits = matchCandidates(input.query, candidates, limit)
      return ok({
        type: "execution",
        items: hits.map((hit) => listed.find((row) => row.id === hit.id)).filter(Boolean),
        total: hits.length,
      })
    }
    return ok({ type: "execution", items: listed.slice(0, limit), total: listed.length })
  }

  if (input.type === "config") {
    const listed = await storage.listConfigs(input.filter?.plugin)
    if (input.id) {
      const item = await storage.getConfig(input.id)
      if (!item) {
        return fail("ECP_NOT_FOUND", `Config ${input.id} was not found.`, {
          suggestions: closeMatches(
            input.id,
            listed.map((row) => row.id),
          ),
        })
      }
      return ok({ type: "config", item })
    }
    if (input.query) {
      const hits = matchCandidates(
        input.query,
        listed.map((item) => ({ id: item.id, summary: item.plugin })),
        limit,
      )
      return ok({
        type: "config",
        items: hits.map((hit) => listed.find((row) => row.id === hit.id)).filter(Boolean),
        total: hits.length,
      })
    }
    return ok({ type: "config", items: listed.slice(0, limit), total: listed.length })
  }

  if (input.type === "run") {
    if (input.id) {
      const include = input.include?.filter((part): part is "steps" | "events" | "state" => part !== "manifest")
      const item = await storage.runs.get(input.id, include)
      if (!item) {
        const ids = (await storage.runs.list({}, 100)).map((row) => row.id)
        return fail("ECP_NOT_FOUND", `Run ${input.id} was not found.`, { suggestions: closeMatches(input.id, ids) })
      }
      if (input.include?.includes("manifest")) {
        item.manifest = await storage.runs.getManifest(input.id)
      }
      return ok({ type: "run", item })
    }
    const items = await storage.runs.list(
      {
        executionId: input.filter?.executionId,
        status: input.filter?.status,
        clientRequestId: input.filter?.clientRequestId,
      },
      limit,
    )
    return ok({ type: "run", items, total: items.length })
  }

  if (input.type === "plugin") {
    const all = plugins.plugins()
    if (input.id) {
      const item = all.find((plugin) => plugin.id === input.id || plugin.package === input.id)
      if (!item) {
        return fail("ECP_NOT_FOUND", `Plugin ${input.id} was not found.`, {
          suggestions: closeMatches(
            input.id,
            all.flatMap((plugin) => [plugin.id, plugin.package]),
          ),
        })
      }
      return ok({ type: "plugin", item })
    }
    const items = [...all].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit)
    return ok({ type: "plugin", items, total: all.length })
  }

  const formatters = services.getAll(Formatter)
  const items = formatters.map((formatter, index) => ({
    id: index === 0 ? DEFAULT_JSON_FORMATTER : `formatter-${index}`,
    mediaType: formatter.mediaType,
    default: index === 0,
  }))
  if (input.id) {
    const item = items.find((row) => row.id === input.id)
    if (!item) {
      return fail("ECP_NOT_FOUND", `Formatter ${input.id} was not found.`, {
        suggestions: closeMatches(
          input.id,
          items.map((row) => row.id),
        ),
      })
    }
    return ok({ type: "formatter", item })
  }
  return ok({ type: "formatter", items: items.slice(0, limit), total: items.length })
}

async function execute(
  services: ServiceLookup,
  input: ExecuteInput,
  options: OperationsOptions,
  live: Map<string, LiveRun>,
  createRunId: () => string,
): Promise<OperationResponse<ExecuteData>> {
  try {
    const modes = [input.execution !== undefined, input.resume !== undefined, input.cancel !== undefined].filter(Boolean)
    if (modes.length !== 1) return fail("ECP_REQUEST_INVALID", "Pass exactly one of execution, resume, or cancel.")

    if (input.cancel) return cancelRun(input.cancel, live)
    if (input.resume) return resumeRun(services, input, options, live)

    const loaded = await loadExecution(services, input.execution!)
    if (!loaded.ok) return loaded
    let manifest = loaded.manifest
    if (loaded.patch) {
      try {
        manifest = applyPatch(manifest, loaded.patch)
      } catch (error) {
        return fromThrown(error)
      }
    }

    const plugins = services.get(PluginAdapter)
    const capabilities = plugins.capabilities()
    const storage = services.get(StorageProvider)
    const executionDir = dirnameOf(loaded.ref.path)
    const validation = await validateExecution(manifest, {
      capabilities,
      input: input.mode === "validate" || input.mode === undefined ? input.input : input.input,
      ...(executionDir ? { executionDir } : {}),
      readText: (absolutePath) => storage.readTextFile(absolutePath),
    })
    if (validation.issues.some((issue) => issue.severity === "error")) {
      const first = validation.issues.find((issue) => issue.severity === "error")
      return {
        ok: false,
        error: {
          code: first?.code === "ECP_EXECUTION_LOAD" || first?.code === "ECP_INPUT_INVALID" ? first.code : "ECP_MANIFEST_INVALID",
          message: first?.message ?? "The execution is invalid.",
          issues: validation.issues,
          path: first?.path,
        },
      }
    }

    if (input.mode === "validate") {
      return ok({ validation })
    }

    if (input.clientRequestId) {
      const existing = await services.get(StorageProvider).runs.list({ clientRequestId: input.clientRequestId }, 1)
      const found = existing[0]
      if (found) {
        const detail = await services.get(StorageProvider).runs.get(found.id, ["steps"])
        return ok({
          runId: found.id,
          status: found.status,
          validation,
          result: found.result ?? undefined,
          error: found.error ?? undefined,
          steps:
            detail?.steps?.map((step) => ({
              nodeId: step.nodeId,
              ...(step.round === null || step.round === undefined ? {} : { round: step.round }),
              status: step.status,
              durationMs: step.durationMs,
            })) ?? [],
          warnings: found.warnings,
        })
      }
    }

    return startAndAwait(services, manifest, input, validation, options, live, createRunId, loaded.ref)
  } catch (error) {
    return fromThrown(error)
  }
}

async function cancelRun(runId: string, live: Map<string, LiveRun>): Promise<OperationResponse<ExecuteData>> {
  const active = live.get(runId)
  if (!active) {
    return fail("ECP_NOT_FOUND", `Run ${runId} is not running.`)
  }
  active.handle.cancel()
  await Promise.race([active.promise, delay(CANCEL_WAIT_MS)])
  const status = (await active.promise.then(() => "cancelled").catch(() => "cancelled")) as "cancelled"
  live.delete(runId)
  return ok({
    runId,
    status,
    validation: emptyValidation(),
    steps: [],
  })
}

async function resumeRun(
  services: ServiceLookup,
  input: ExecuteInput,
  options: OperationsOptions,
  live: Map<string, LiveRun>,
): Promise<OperationResponse<ExecuteData>> {
  const storage = services.get(StorageProvider)
  const runId = input.resume!
  const detail = await storage.runs.get(runId, ["state", "steps"])
  if (!detail) return fail("ECP_NOT_FOUND", `Run ${runId} was not found.`)
  if (detail.status !== "interrupted") {
    return fail("ECP_REQUEST_INVALID", `Run ${runId} has status ${detail.status}; only interrupted runs can resume.`)
  }
  const manifest = await storage.runs.getManifest(runId)
  if (!manifest) return fail("ECP_NOT_FOUND", `Manifest for run ${runId} was not found.`)
  const validation = await validateExecution(manifest, {
    capabilities: services.get(PluginAdapter).capabilities(),
    input: detail.input,
  })
  return startAndAwait(
    services,
    manifest,
    { ...input, input: detail.state ?? detail.input, clientRequestId: detail.clientRequestId },
    validation,
    options,
    live,
    () => runId,
    { path: null, id: detail.execution.id },
    detail.cursor,
    true,
  )
}

async function startAndAwait(
  services: ServiceLookup,
  manifest: ExecutionManifest,
  input: ExecuteInput,
  validation: ValidationResult,
  options: OperationsOptions,
  live: Map<string, LiveRun>,
  createRunId: () => string,
  ref: { path: string | null; id?: string },
  cursor?: RunRecord["cursor"],
  resuming = false,
): Promise<OperationResponse<ExecuteData>> {
  const storage = services.get(StorageProvider)
  const plugins = services.get(PluginAdapter)
  const expression = services.get(ExpressionEngine)
  const secrets = services.has(SecretsProvider) ? services.get(SecretsProvider) : undefined
  const runId = createRunId()
  const startedAt = new Date().toISOString()
  const runInput = input.input ?? {}
  const manifestHash = await sha256Hex(canonicalJson(manifest))
  const record: RunRecord = {
    schema: "@executioncontrolprotocol.run",
    version: "1.0",
    id: runId,
    execution: {
      path: ref.path,
      id: ref.id,
      manifestHash,
    },
    status: "running",
    input: runInput,
    result: null,
    error: null,
    startedAt,
    plugins: Object.fromEntries(plugins.plugins().map((plugin) => [plugin.id, plugin.version])),
    host: { version: VERSION, pid: 0 },
    clientRequestId: input.clientRequestId,
    cursor,
    warnings: validation.issues.filter((issue) => issue.severity === "warning"),
  }
  if (!resuming) await storage.runs.create(record, manifest)
  else await storage.runs.update(runId, { status: "running", cursor })

  const configs = await storage.listConfigs()
  const controller = new AbortController()
  const schemas = await HostSchemaSet.create(plugins.capabilities())
  const executionDir = dirnameOf(ref.path)
  const handle = startExecution(manifest, runInput, {
    capabilities: plugins.capabilities(),
    expression: expression as ExpressionEngineService,
    configs,
    getSecret: secrets ? (key) => secrets.get(key) : undefined,
    getEnv: (name) => process.env[name],
    readText: (absolutePath) => storage.readTextFile(absolutePath),
    ...(executionDir ? { executionDir } : {}),
    maxConcurrency: options.settings?.defaultMaxConcurrency,
    defaultStepTimeoutMs: options.settings?.defaultStepTimeoutMs,
    signal: controller.signal,
    cursor,
    runId,
    store: storage.runs,
    schemas,
    call: async (request, signal, store) => plugins.call({ ...request, store }, signal),
  })

  const settled = handle.outcome.then(async (outcome) => {
    await storage.runs.update(runId, {
      status: outcome.status,
      result: outcome.result,
      error: outcome.error ?? null,
      endedAt: new Date().toISOString(),
      cursor: outcome.cursor,
    })
    live.delete(runId)
  })
  live.set(runId, { handle, controller, promise: settled.then(() => undefined) })

  if (input.wait === false) {
    return ok({
      runId,
      status: "running",
      validation,
      steps: [],
      warnings: record.warnings,
    })
  }

  const timeoutMs = input.waitTimeoutMs
  const outcome =
    timeoutMs === undefined
      ? await handle.outcome
      : await Promise.race([
          handle.outcome,
          delay(timeoutMs).then(() => undefined),
        ])
  if (!outcome) {
    return ok({
      runId,
      status: "running",
      validation,
      steps: [],
      warnings: record.warnings,
    })
  }
  await settled

  const data: ExecuteData = {
    runId,
    status: outcome.status,
    validation,
    result: outcome.result,
    error: outcome.error,
    steps: outcome.steps,
    warnings: record.warnings,
  }
  if (input.output?.path) {
    const text = JSON.stringify(data, null, 2)
    if (!options.writeTextFile) return fail("ECP_REQUEST_INVALID", "output.path requires a writeTextFile host option.")
    await options.writeTextFile(input.output.path, text)
  }
  return ok(data)
}

async function loadExecution(
  services: ServiceLookup,
  execution: NonNullable<ExecuteInput["execution"]>,
): Promise<
  | { ok: true; manifest: ExecutionManifest; patch?: import("@executioncontrolprotocol/protocol").PatchOp[]; ref: { path: string | null; id?: string } }
  | { ok: false; error: OperationError }
> {
  if (isManifest(execution)) {
    return { ok: true, manifest: execution, ref: { path: null, id: execution.execution?.id } }
  }
  if ("path" in execution) {
    if (!execution.path.endsWith(".ecp.json")) {
      return fail("ECP_REQUEST_INVALID", "Execution paths must end with .ecp.json.")
    }
    try {
      const text = await services.get(StorageProvider).readExecutionFile(execution.path)
      const loaded = loadExecutionText(text)
      if (loaded.issues.length > 0) {
        return { ok: false, error: { code: "ECP_EXECUTION_LOAD", message: loaded.issues[0]?.message ?? "Load failed.", issues: loaded.issues } }
      }
      if (!isManifest(loaded.manifest)) {
        return fail("ECP_EXECUTION_LOAD", "Execution file did not contain an execution object.")
      }
      return { ok: true, manifest: loaded.manifest, ref: { path: execution.path } }
    } catch (error) {
      return fromThrown(error)
    }
  }
  if ("id" in execution) {
    const stored = await services.get(StorageProvider).getExecution(execution.id)
    if (!stored) {
      const ids = (await services.get(StorageProvider).listExecutions()).map((row) => row.id)
      return fail("ECP_NOT_FOUND", `Execution ${execution.id} was not found.`, { suggestions: closeMatches(execution.id, ids) })
    }
    const patch = "patch" in execution ? execution.patch : undefined
    return { ok: true, manifest: stored.manifest, patch, ref: { path: null, id: execution.id } }
  }
  return fail("ECP_REQUEST_INVALID", "execution must be a manifest, { id }, { path }, or { id, patch }.")
}

async function commit(services: ServiceLookup, input: CommitInput): Promise<OperationResponse<CommitData>> {
  try {
    if (input.type !== "execution" && input.type !== "config") {
      return fail("ECP_REQUEST_INVALID", `Type ${String(input.type)} is read-only.`)
    }
    if (input.action === "update" && input.object !== undefined && input.patch !== undefined) {
      return fail("ECP_REQUEST_INVALID", "Pass object or patch, not both.")
    }
    if ((input.action === "update" || input.action === "delete") && input.ifVersion === undefined) {
      return fail("ECP_REQUEST_INVALID", "ifVersion is required for update and delete.")
    }

    const storage = services.get(StorageProvider)
    if (input.type === "execution") {
      return await commitExecution(services, storage, input)
    }
    return await commitConfig(services, storage, input)
  } catch (error) {
    return fromThrown(error)
  }
}

async function commitExecution(
  services: ServiceLookup,
  storage: StorageProviderService,
  input: CommitInput,
): Promise<OperationResponse<CommitData>> {
  if (input.action === "delete") {
    if (!input.id) return fail("ECP_REQUEST_INVALID", "id is required for delete.")
    await storage.deleteExecution(input.id, input.ifVersion!)
    return ok({ type: "execution", id: input.id, version: null })
  }

  let manifest: ExecutionManifest
  let id = input.id
  if (input.action === "create") {
    if (!isManifest(input.object)) return fail("ECP_REQUEST_INVALID", "create requires an execution object.")
    manifest = input.object
    id = id ?? manifest.execution?.id
    if (!id) return fail("ECP_REQUEST_INVALID", "create requires id or execution.id.")
  } else {
    if (!id) return fail("ECP_REQUEST_INVALID", "id is required for update.")
    const current = await storage.getExecution(id)
    if (!current) return fail("ECP_NOT_FOUND", `Execution ${id} was not found.`)
    if (input.patch) {
      try {
        manifest = applyPatch(current.manifest, input.patch)
      } catch (error) {
        return fromThrown(error)
      }
    } else if (isManifest(input.object)) {
      manifest = input.object
    } else {
      return fail("ECP_REQUEST_INVALID", "update requires object or patch.")
    }
  }

  const validation = await validateExecution(manifest, { capabilities: services.get(PluginAdapter).capabilities() })
  if (validation.issues.some((issue) => issue.severity === "error")) {
    return {
      ok: false,
      error: {
        code: "ECP_MANIFEST_INVALID",
        message: "The execution is invalid.",
        issues: validation.issues,
      },
    }
  }
  const warnings = validation.issues.filter((issue) => issue.severity === "warning")
  const { version } = await storage.putExecution(id!, manifest, {
    create: input.action === "create",
    ifVersion: input.ifVersion,
    warnings,
  })
  return ok({ type: "execution", id: id!, version, warnings })
}

async function commitConfig(
  services: ServiceLookup,
  storage: StorageProviderService,
  input: CommitInput,
): Promise<OperationResponse<CommitData>> {
  if (input.action === "delete") {
    if (!input.id) return fail("ECP_REQUEST_INVALID", "id is required for delete.")
    await storage.deleteConfig(input.id, input.ifVersion!)
    return ok({ type: "config", id: input.id, version: null })
  }

  let config: ConfigObject
  if (input.action === "create") {
    if (!isConfig(input.object)) return fail("ECP_REQUEST_INVALID", "create requires a config object.")
    config = input.object
  } else {
    if (!input.id) return fail("ECP_REQUEST_INVALID", "id is required for update.")
    const current = await storage.getConfig(input.id)
    if (!current) return fail("ECP_NOT_FOUND", `Config ${input.id} was not found.`)
    if (input.patch) {
      try {
        config = applyPatch(current, input.patch)
      } catch (error) {
        return fromThrown(error)
      }
    } else if (isConfig(input.object)) {
      config = { ...input.object, id: input.id }
    } else {
      return fail("ECP_REQUEST_INVALID", "update requires object or patch.")
    }
  }

  const plugins = services.get(PluginAdapter)
  const schema = plugins.configSchema(config.plugin)
  if (!schema) {
    const known = plugins.plugins().some((plugin) => plugin.id === config.plugin)
    if (!known) {
      return fail(
        "ECP_PLUGINS_MISSING",
        `Plugin ${config.plugin} is not installed. Install it before committing this config.`,
      )
    }
  } else {
    const issue = validateConfigValues(schema, config.values)
    if (issue) return { ok: false, error: issue }
  }

  const { version } = await storage.putConfig(config, {
    create: input.action === "create",
    ifVersion: input.ifVersion,
  })
  return ok({ type: "config", id: config.id, version })
}

function validateConfigValues(schema: Record<string, unknown>, values: unknown): OperationError | undefined {
  const normalized = normalizeSecrets(values)
  if (schema.type === "object" && !isRecord(normalized)) {
    return { code: "ECP_REQUEST_INVALID", message: "Config values must be an object." }
  }
  if (isRecord(schema.properties) && isRecord(normalized)) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
    for (const key of required) {
      if (normalized[key] === undefined) {
        return { code: "ECP_REQUEST_INVALID", message: `Config is missing ${key}.`, path: `/values/${key}` }
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (normalized[key] === undefined || !isRecord(child)) continue
      if (child.type === "string" && typeof normalized[key] !== "string") {
        return { code: "ECP_REQUEST_INVALID", message: `Config ${key} must be a string.`, path: `/values/${key}` }
      }
    }
  }
  return undefined
}

function normalizeSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeSecrets(item))
  if (!isRecord(value)) return value
  if (typeof value.$secret === "string" || typeof value.$env === "string") return ""
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeSecrets(child)]))
}

async function writeOutput(
  options: OperationsOptions,
  type: RetrieveInput["type"],
  path: string,
  text: string,
  summary: string,
): Promise<OperationResponse<RetrieveData>> {
  if (!options.writeTextFile) return fail("ECP_REQUEST_INVALID", "output.path requires a writeTextFile host option.")
  await options.writeTextFile(path, text)
  return ok({
    type,
    written: { path, bytes: text.length },
    summary,
  })
}

function findFormatter(services: ServiceLookup, id: string): FormatterService | undefined {
  const all = services.getAll(Formatter)
  if (id === DEFAULT_JSON_FORMATTER) return all[0]
  const match = /^formatter-(\d+)$/.exec(id)
  if (!match) return undefined
  return all[Number(match[1])]
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIST_LIMIT
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_LIST_LIMIT
  return Math.min(Math.floor(limit), MAX_LIST_LIMIT)
}

function defaultRunId(): string {
  const stamp = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  const suffix = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")
  return `run-${stamp}-${suffix}`
}

function emptyValidation(): ValidationResult {
  return { valid: true, issues: [], manifestHash: "", schemaHash: "" }
}

function ok<T>(data: T): OperationResponse<T> {
  return { ok: true, data }
}

function fail(code: string, message: string, extra: Partial<OperationError> = {}): { ok: false; error: OperationError } {
  return { ok: false, error: { code, message, ...extra } }
}

function fromThrown(error: unknown): { ok: false; error: OperationError } {
  if (isRecord(error) && typeof error.code === "string") {
    return fail(error.code, error instanceof Error ? error.message : String(error.message ?? error.code), {
      suggestions: Array.isArray(error.suggestions) ? (error.suggestions as string[]) : undefined,
    })
  }
  return fail("ECP_INTERNAL", error instanceof Error ? error.message : "Unexpected error.")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isManifest(value: unknown): value is ExecutionManifest {
  return isRecord(value) && value.schema === "@executioncontrolprotocol.execution" && value.version === "2.0"
}

function isConfig(value: unknown): value is ConfigObject {
  return isRecord(value) && value.schema === "@executioncontrolprotocol.config" && typeof value.id === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Parent directory of an absolute execution path (POSIX or Windows). */
function dirnameOf(filePath: string | null | undefined): string | undefined {
  if (!filePath) return undefined
  const unix = filePath.lastIndexOf("/")
  const win = filePath.lastIndexOf("\\")
  const index = Math.max(unix, win)
  if (index <= 0) return undefined
  return filePath.slice(0, index)
}
