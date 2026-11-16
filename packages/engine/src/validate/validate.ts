import { EXECUTION_SCHEMA, EXECUTION_VERSION, firstPartyInstallCommand, firstPartyPlugin, pluginIdFromCapability } from "@executioncontrolprotocol/protocol"
import type {
  CapabilityEntry,
  ConfigObject,
  ExecutionManifest,
  PluginSchemaDocument,
  ValidationIssue,
  ValidationResult,
} from "@executioncontrolprotocol/protocol"
import Ajv2020 from "ajv/dist/2020.js"
import addFormatsModule from "ajv-formats"
import baseSchema from "@executioncontrolprotocol/protocol/schemas/execution.base.schema.json" with { type: "json" }
import { canonicalJson, sha256Hex } from "../schema/canonical.js"
import { generateExecutionSchema, type JsonSchema } from "../schema/generate.js"
import { closeMatches } from "../schema/suggest.js"
import { checkDataFlow } from "./dataflow.js"
import { checkExpression, checkScript, syntaxIssue } from "./expr.js"
import {
  assertScriptPositions,
  collectSecretEnvIssues,
  validateWithMarkers,
  type MarkerAjvError,
} from "./markers.js"

/**
 * What the validator needs besides the manifest. File reads are injected.
 * @category Validation
 */
export interface ValidateOptions {
  /** Installed capabilities. Their `accepts` schemas drive L1. */
  capabilities: readonly CapabilityEntry[]
  /** Known config objects. Named step configs must be here. */
  configs?: readonly ConfigObject[]
  /** Directory of the execution file, for relative `$script` paths. */
  executionDir?: string
  /** Read a `$script` file. The path is absolute. */
  readText?: (absolutePath: string) => Promise<string>
  /** Run input. When set, L4 checks it against `execution.accepts`. */
  input?: Record<string, unknown>
  /**
   * Optional loader for a plugin's schema document.
   * Preferred by the scale path for raw `accepts` (S2+).
   */
  loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
  /**
   * When true, use the base + lazy raw accepts path (S2). Default remains the legacy
   * combined wrapped schema until S3.
   */
  useScalePath?: boolean
  /**
   * Optional prebuilt schema set. When set, skips {@link HostSchemaSet.create} /
   * {@link HostSchemaSet.createBase} (tests and host-lifetime cache).
   */
  schemaSet?: HostSchemaSet
}

interface AjvError {
  instancePath: string
  schemaPath: string
  keyword: string
  message?: string
  params: Record<string, unknown>
}

interface AjvLike {
  compile: (schema: unknown) => ((data: unknown) => boolean) & { errors?: AjvError[] | null }
  addSchema: (schema: unknown) => AjvLike
  getSchema: (keyRef: string) => (((data: unknown) => boolean) & { errors?: AjvError[] | null }) | undefined
}

const Ajv = Ajv2020 as unknown as new (options?: object) => AjvLike
const addFormats = addFormatsModule as unknown as (ajv: AjvLike) => AjvLike

const HOST_EXECUTION_SCHEMA_ID = "ecp://host/execution.schema.json"

/**
 * Compiled host schema. Input validators are compiled on first use.
 * @category Validation
 */
export class HostSchemaSet {
  /** Full editor schema (legacy) or base schema (scale). */
  readonly schema: JsonSchema
  /** Hash of {@link HostSchemaSet.schema}. */
  readonly schemaHash: string
  /** True when this set was built with {@link HostSchemaSet.createBase}. */
  readonly scalePath: boolean
  private readonly ajv = new Ajv({ allErrors: true, strict: false, useDefaults: false })
  private readonly inputAjv = new Ajv({ allErrors: true, strict: false, useDefaults: false })
  private readonly documentValidator: ReturnType<AjvLike["compile"]>
  private readonly inputValidators = new Map<string, ReturnType<AjvLike["compile"]>>()
  private readonly pluginSchemas = new Map<string, PluginSchemaDocument>()
  private readonly addedPluginSchemaIds = new Set<string>()
  private readonly loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
  private readonly capabilities: readonly CapabilityEntry[]

  private constructor(
    schema: JsonSchema,
    schemaHash: string,
    options: {
      scalePath?: boolean
      capabilities?: readonly CapabilityEntry[]
      loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
    } = {},
  ) {
    this.schema = schema
    this.schemaHash = schemaHash
    this.scalePath = options.scalePath === true
    this.capabilities = options.capabilities ?? []
    this.loadPluginSchema = options.loadPluginSchema
    addFormats(this.ajv)
    addFormats(this.inputAjv)
    this.documentValidator = this.ajv.compile(schema)
  }

  /**
   * Build a schema set for the installed capabilities (legacy combined wrapped schema).
   * @category Validation
   */
  static async create(capabilities: readonly CapabilityEntry[]): Promise<HostSchemaSet> {
    const schema = generateExecutionSchema(capabilities)
    const schemaHash = await sha256Hex(canonicalJson(schema))
    return new HostSchemaSet(schema, schemaHash, { capabilities })
  }

  /**
   * Build a base-only schema set for the scale path. Capabilities are not inlined.
   * @category Validation
   */
  static async createBase(
    capabilities: readonly CapabilityEntry[],
    loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>,
  ): Promise<HostSchemaSet> {
    const schema = structuredClone(baseSchema) as JsonSchema
    schema.$id = HOST_EXECUTION_SCHEMA_ID
    const schemaHash = await sha256Hex(canonicalJson(schema))
    return new HostSchemaSet(schema, schemaHash, { scalePath: true, capabilities, loadPluginSchema })
  }

  /** Validate a manifest document. */
  validateDocument(manifest: unknown): AjvError[] {
    this.documentValidator(manifest)
    return (this.documentValidator.errors ?? []) as AjvError[]
  }

  /**
   * Validate one capability input. Compiled once per schema hash and capability.
   * Legacy path and runtime resolved-input checks (no marker filtering).
   * @category Validation
   */
  validateInput(capability: CapabilityEntry, input: unknown): AjvError[] {
    const cacheKey = `${this.schemaHash}:${capability.id}`
    let validator = this.inputValidators.get(cacheKey)
    if (!validator) {
      validator = this.inputAjv.compile(capability.accepts)
      this.inputValidators.set(cacheKey, validator)
    }
    validator(input)
    return (validator.errors ?? []) as AjvError[]
  }

  /**
   * Load a plugin schema document into Ajv at most once.
   * @category Validation
   */
  async ensurePluginSchema(pluginId: string): Promise<PluginSchemaDocument | undefined> {
    const cached = this.pluginSchemas.get(pluginId)
    if (cached) return cached
    const fromCapability = this.capabilities.find((capability) => capability.plugin === pluginId)
    const packageId = fromCapability?.package
    let document = await this.loadPluginSchema?.(pluginId)
    if (!document && packageId && packageId !== pluginId) {
      document = await this.loadPluginSchema?.(packageId)
    }
    if (!document) return undefined
    if (!this.addedPluginSchemaIds.has(document.$id)) {
      this.inputAjv.addSchema(document)
      this.addedPluginSchemaIds.add(document.$id)
    }
    this.pluginSchemas.set(pluginId, document)
    if (packageId) this.pluginSchemas.set(packageId, document)
    return document
  }

  /**
   * Validate one capability input against raw accepts with marker-error filtering.
   * Compiles each capability validator at most once per set.
   * @category Validation
   */
  async validateCapabilityInput(capability: CapabilityEntry, input: unknown): Promise<AjvError[]> {
    const name = capabilityName(capability.id)
    const document = await this.ensurePluginSchema(capability.plugin)
    const cacheKey = `${this.schemaHash}:scale:${capability.id}`
    let validator = this.inputValidators.get(cacheKey)
    if (!validator) {
      if (document?.$defs[`${name}.accepts`]) {
        validator = this.inputAjv.compile({ $ref: `${document.$id}#/$defs/${name}.accepts` })
      } else {
        validator = this.inputAjv.compile(capability.accepts)
      }
      this.inputValidators.set(cacheKey, validator)
    }
    return validateWithMarkers(validator as ((data: unknown) => boolean) & { errors?: MarkerAjvError[] | null }, input) as AjvError[]
  }

  /**
   * Raw accepts schema for a capability (from the plugin document when available).
   * @category Validation
   */
  async rawAccepts(capability: CapabilityEntry): Promise<Record<string, unknown>> {
    const document = await this.ensurePluginSchema(capability.plugin)
    const name = capabilityName(capability.id)
    return document?.$defs[`${name}.accepts`] ?? capability.accepts
  }
}

/**
 * Validate an execution object through L0–L3, and L4 when `input` is set.
 * Default path is the legacy combined wrapped schema. Pass `useScalePath: true` for the S2 path.
 * @category Validation
 */
export async function validateExecution(manifest: unknown, options: ValidateOptions): Promise<ValidationResult> {
  if (options.useScalePath) return validateExecutionNext(manifest, options)
  const schemas = options.schemaSet ?? (await HostSchemaSet.create(options.capabilities))
  const manifestHash = await sha256Hex(canonicalJson(manifest))
  const loaded = loadObject(manifest)
  if (loaded) {
    return finish([loaded], manifestHash, schemas.schemaHash)
  }
  const structural = mapAjvErrors(schemas.validateDocument(manifest), manifest, options.capabilities)
  const semantic = await checkSemantics(manifest, options)
  const layerErrors = [...structural, ...semantic]
  const flow =
    layerErrors.some((item) => item.severity === "error") || !isManifest(manifest)
      ? []
      : checkDataFlow(manifest, options.capabilities)
  const inputIssues = options.input ? validateRunInput(manifest, options.input) : []
  return finish([...layerErrors, ...flow, ...inputIssues], manifestHash, schemas.schemaHash)
}

/** Ajv keywords that only aggregate sub-schema failures. */
const COMBINATOR_NOISE = new Set(["if", "then", "else", "anyOf", "oneOf", "allOf", "not", "false"])

/**
 * Scale-path validation: base document schema + per-capability raw accepts with marker filtering.
 * @category Validation
 */
export async function validateExecutionNext(manifest: unknown, options: ValidateOptions): Promise<ValidationResult> {
  const schemas =
    options.schemaSet?.scalePath === true
      ? options.schemaSet
      : await HostSchemaSet.createBase(options.capabilities, options.loadPluginSchema)
  const manifestHash = await sha256Hex(canonicalJson(manifest))
  const loaded = loadObject(manifest)
  if (loaded) {
    return finish([loaded], manifestHash, schemas.schemaHash)
  }
  const secretEnv = collectSecretEnvIssues(manifest)
  const secretEnvPaths = [...new Set(secretEnv.map((issue) => issue.path))]
  // At or under a $secret/$env: the dedicated issue replaces the schema errors. Above it, drop only
  // combinator noise (the dedicated issue explains why a branch failed); real structural errors on
  // ancestors, such as an unknown step property, must still be reported.
  const atOrUnderSecretEnv = (path: string): boolean =>
    secretEnvPaths.some((secretPath) => path === secretPath || path.startsWith(`${secretPath}/`))
  const aboveSecretEnv = (path: string): boolean =>
    secretEnvPaths.some((secretPath) => path === "" || path === "/" || secretPath.startsWith(`${path}/`))
  const baseErrors = schemas.validateDocument(manifest).filter((error) => {
    const path = ajvPointer(error)
    if (atOrUnderSecretEnv(path) || atOrUnderSecretEnv(error.instancePath)) return false
    return !(COMBINATOR_NOISE.has(error.keyword) && aboveSecretEnv(error.instancePath))
  })
  const structural = mapAjvErrors(baseErrors, manifest, options.capabilities).filter(
    (issue) => !atOrUnderSecretEnv(issue.path),
  )
  const unknownUses = checkUnknownUses(manifest, options.capabilities)
  const capabilityInput = isManifest(manifest) ? await checkCapabilityInputs(manifest, schemas, options.capabilities) : []
  const semantic = await checkSemantics(manifest, options)
  const layerErrors = [...structural, ...unknownUses, ...capabilityInput, ...secretEnv, ...semantic]
  const flow =
    layerErrors.some((item) => item.severity === "error") || !isManifest(manifest)
      ? []
      : checkDataFlow(manifest, options.capabilities)
  const inputIssues = options.input ? validateRunInput(manifest, options.input) : []
  return finish(dedupeIssues([...layerErrors, ...flow, ...inputIssues]), manifestHash, schemas.schemaHash)
}

/**
 * Parse execution text. Invalid JSON is `ECP_EXECUTION_LOAD`.
 * @category Validation
 */
export function loadExecutionText(text: string): { manifest?: unknown; issues: ValidationIssue[] } {
  try {
    return { manifest: JSON.parse(text) as unknown, issues: [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution text is not JSON."
    return {
      issues: [
        {
          code: "ECP_EXECUTION_LOAD",
          severity: "error",
          message: `Execution text is not JSON. ${message}`,
          path: "",
        },
      ],
    }
  }
}

function loadObject(manifest: unknown): ValidationIssue | undefined {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    return {
      code: "ECP_EXECUTION_LOAD",
      severity: "error",
      message: "Execution must be a JSON object.",
      path: "",
    }
  }
  const record = manifest as Record<string, unknown>
  if (record.schema !== EXECUTION_SCHEMA) {
    return {
      code: "ECP_EXECUTION_LOAD",
      severity: "error",
      message: `schema must be ${EXECUTION_SCHEMA}.`,
      path: "/schema",
    }
  }
  if (record.version !== EXECUTION_VERSION) {
    return {
      code: "ECP_EXECUTION_LOAD",
      severity: "error",
      message: `version must be ${EXECUTION_VERSION}.`,
      path: "/version",
    }
  }
  return undefined
}

function capabilityName(capabilityId: string): string {
  const dot = capabilityId.lastIndexOf(".")
  return dot >= 0 ? capabilityId.slice(dot + 1) : capabilityId
}

/** Keep the first issue for each `{ code, path, severity }` (F2). */
function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  const out: ValidationIssue[] = []
  for (const issue of issues) {
    const key = `${issue.code}|${issue.path}|${issue.severity}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(issue)
  }
  return out
}

function checkUnknownUses(manifest: unknown, capabilities: readonly CapabilityEntry[]): ValidationIssue[] {
  if (!isRecord(manifest) || !Array.isArray(manifest.steps)) return []
  const ids = capabilities.map((capability) => capability.id)
  const byId = new Set(ids)
  const issues: ValidationIssue[] = []
  const visit = (nodes: unknown[], prefix: string): void => {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      const path = `${prefix}/${index}`
      if (!isRecord(node)) continue
      const type = typeof node.type === "string" ? node.type : "step"
      if (type === "step" && typeof node.uses === "string" && !byId.has(node.uses)) {
        issues.push(unknownCapabilityIssue(node.uses, `${path}/uses`, capabilities, ids))
      }
      if (type === "branch" && Array.isArray(node.branches)) {
        for (let arm = 0; arm < node.branches.length; arm += 1) {
          const branch = node.branches[arm]
          if (isRecord(branch) && Array.isArray(branch.steps)) visit(branch.steps, `${path}/branches/${arm}/steps`)
        }
      }
      if (type === "loop" && Array.isArray(node.steps)) visit(node.steps, `${path}/steps`)
      if (type === "parallel" && Array.isArray(node.branches)) {
        for (let line = 0; line < node.branches.length; line += 1) {
          const branch = node.branches[line]
          if (Array.isArray(branch)) visit(branch, `${path}/branches/${line}`)
        }
      }
    }
  }
  visit(manifest.steps, "/steps")
  return issues
}

function unknownCapabilityIssue(
  actual: string,
  path: string,
  capabilities: readonly CapabilityEntry[],
  ids: string[],
): ValidationIssue {
  const pluginId = pluginIdFromCapability(actual)
  const pluginInstalled = pluginId
    ? capabilities.some((capability) => pluginIdFromCapability(capability.id) === pluginId)
    : false
  const firstParty = pluginId ? firstPartyPlugin(pluginId) : undefined
  if (firstParty && pluginId && !pluginInstalled) {
    return {
      code: "ECP_PLUGINS_MISSING",
      severity: "error",
      message: `Plugin ${firstParty.short} is not installed. ${firstPartyInstallCommand(pluginId)}`,
      path,
      actual: trim(actual, 1024),
    }
  }
  return {
    code: "ECP_CAPABILITY_UNKNOWN",
    severity: "error",
    message: `Capability ${actual} is not installed.`,
    path,
    suggestions: closeMatches(actual, ids).map((id) => `did you mean '${id}'?`),
    actual: trim(actual, 1024),
  }
}

async function checkCapabilityInputs(
  manifest: ExecutionManifest,
  schemas: HostSchemaSet,
  capabilities: readonly CapabilityEntry[],
): Promise<ValidationIssue[]> {
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]))
  const issues: ValidationIssue[] = []
  const visit = async (nodes: unknown[], prefix: string): Promise<void> => {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      const path = `${prefix}/${index}`
      if (!isRecord(node)) continue
      const type = typeof node.type === "string" ? node.type : "step"
      if (type === "step" && typeof node.uses === "string") {
        const capability = byId.get(node.uses)
        if (capability) {
          const input = node.input ?? {}
          const inputPath = `${path}/input`
          const accepts = await schemas.rawAccepts(capability)
          const rawErrors = await schemas.validateCapabilityInput(capability, input)
          for (const error of rawErrors) {
            const relative = ajvPointer(error)
            const fullPath = relative === "/" ? inputPath : `${inputPath}${relative === "" ? "" : relative}`
            issues.push({
              code: "ECP_INPUT_INVALID",
              severity: "error",
              message: `Input does not match the capability accepts schema. ${error.message ?? "Invalid input."}`,
              path: fullPath,
              actual: trim(readPointer(input, relative === "/" ? "" : relative), 1024),
            })
          }
          issues.push(...assertScriptPositions(input, accepts, inputPath))
        }
      }
      if (type === "branch" && Array.isArray(node.branches)) {
        for (let arm = 0; arm < node.branches.length; arm += 1) {
          const branch = node.branches[arm]
          if (isRecord(branch) && Array.isArray(branch.steps)) {
            await visit(branch.steps, `${path}/branches/${arm}/steps`)
          }
        }
      }
      if (type === "loop" && Array.isArray(node.steps)) await visit(node.steps, `${path}/steps`)
      if (type === "parallel" && Array.isArray(node.branches)) {
        for (let line = 0; line < node.branches.length; line += 1) {
          const branch = node.branches[line]
          if (Array.isArray(branch)) await visit(branch, `${path}/branches/${line}`)
        }
      }
    }
  }
  await visit(manifest.steps, "/steps")
  return issues
}

function mapAjvErrors(errors: AjvError[], manifest: unknown, capabilities: readonly CapabilityEntry[]): ValidationIssue[] {
  const ids = capabilities.map((capability) => capability.id)
  const noisy = new Set(["if", "then", "else", "allOf"])
  const kept = errors.filter((error) => !noisy.has(error.keyword))
  return (kept.length > 0 ? kept : errors).map((error) => {
    const path = ajvPointer(error)
    const uses = path.endsWith("/uses") && (error.keyword === "enum" || error.keyword === "const")
    const input = path.includes("/input") && !path.endsWith("/uses") && error.keyword !== "false"
    let code: ValidationIssue["code"] = "ECP_MANIFEST_INVALID"
    let message = error.message ?? "Manifest does not match the execution schema."
    let suggestions: string[] | undefined
    if (uses) {
      const actual = readPointer(manifest, path)
      const pluginId = typeof actual === "string" ? pluginIdFromCapability(actual) : undefined
      const pluginInstalled = pluginId
        ? capabilities.some((capability) => pluginIdFromCapability(capability.id) === pluginId)
        : false
      const firstParty = pluginId ? firstPartyPlugin(pluginId) : undefined
      if (firstParty && pluginId && !pluginInstalled) {
        code = "ECP_PLUGINS_MISSING"
        message = `Plugin ${firstParty.short} is not installed. ${firstPartyInstallCommand(pluginId)}`
      } else {
        code = "ECP_CAPABILITY_UNKNOWN"
        message = `Capability ${String(actual)} is not installed.`
        suggestions = closeMatches(String(actual), ids).map((id) => `did you mean '${id}'?`)
      }
    } else if (input && error.keyword !== "if" && !markerValue(manifest, path)) {
      code = "ECP_INPUT_INVALID"
      message = `Input does not match the capability accepts schema. ${message}`
    }
    return {
      code,
      severity: "error" as const,
      message,
      path,
      suggestions,
      actual: trim(readPointer(manifest, path), 1024),
    }
  })
}

async function checkSemantics(manifest: unknown, options: ValidateOptions): Promise<ValidationIssue[]> {
  if (!isRecord(manifest) || !Array.isArray(manifest.steps)) return []
  const issues: ValidationIssue[] = []
  const seen = new Map<string, string>()
  const inputNames = new Set(Object.keys(schemaProperties(recordProperty(manifest.execution, "accepts")) ?? {}))
  const configs = new Map((options.configs ?? []).map((config) => [config.id, config]))
  await walkSemantics(manifest.steps, "/steps", { inLoop: false }, issues, seen, inputNames, configs, options)
  return issues
}

interface SemanticState {
  inLoop: boolean
}

async function walkSemantics(
  nodes: unknown[],
  prefix: string,
  state: SemanticState,
  issues: ValidationIssue[],
  seen: Map<string, string>,
  inputNames: Set<string>,
  configs: Map<string, ConfigObject>,
  options: ValidateOptions,
): Promise<void> {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const path = `${prefix}/${index}`
    if (!isRecord(node)) continue
    const id = typeof node.id === "string" ? node.id : undefined
    if (id) {
      const previous = seen.get(id)
      if (previous) {
        issues.push(semantic("ECP_MANIFEST_INVALID", `Node id ${id} is already used at ${previous}.`, `${path}/id`, id))
      } else {
        seen.set(id, path)
      }
    }
    if (typeof node.expr === "string") {
      const failure = checkExpression(node.expr)
      if (failure) issues.push(syntaxIssue("ECP_EXPR_INVALID", `${path}/expr`, failure, id))
    }
    await checkScripts(node.input, `${path}/input`, id, options, issues)
    const type = typeof node.type === "string" ? node.type : "step"
    if (type === "step") checkStep(node, path, id, state, issues, inputNames, configs, options)
    if (type === "branch" && Array.isArray(node.branches)) checkBranch(node.branches, path, issues)
    if (type === "branch" && Array.isArray(node.branches)) {
      for (let arm = 0; arm < node.branches.length; arm += 1) {
        const branch = node.branches[arm]
        if (isRecord(branch) && Array.isArray(branch.steps)) {
          await walkSemantics(branch.steps, `${path}/branches/${arm}/steps`, state, issues, seen, inputNames, configs, options)
        }
      }
    }
    if (type === "loop" && Array.isArray(node.steps)) {
      await walkSemantics(node.steps, `${path}/steps`, { inLoop: true }, issues, seen, inputNames, configs, options)
    }
    if (type === "parallel" && Array.isArray(node.branches)) {
      for (let line = 0; line < node.branches.length; line += 1) {
        const branch = node.branches[line]
        if (Array.isArray(branch)) {
          await walkSemantics(branch, `${path}/branches/${line}`, state, issues, seen, inputNames, configs, options)
        }
      }
    }
  }
}

function checkBranch(arms: unknown[], path: string, issues: ValidationIssue[]): void {
  arms.forEach((arm, index) => {
    if (!isRecord(arm)) return
    if (arm.expr === undefined && index !== arms.length - 1) {
      issues.push(
        semantic(
          "ECP_MANIFEST_INVALID",
          "A branch arm without expr is the default and must be last.",
          `${path}/branches/${index}`,
        ),
      )
    }
  })
}

function checkStep(
  node: Record<string, unknown>,
  path: string,
  id: string | undefined,
  state: SemanticState,
  issues: ValidationIssue[],
  inputNames: Set<string>,
  configs: Map<string, ConfigObject>,
  options: ValidateOptions,
): void {
  const mode = typeof node.mode === "string" ? node.mode : undefined
  const asName = typeof node.as === "string" ? node.as : undefined
  if (mode && !asName) {
    issues.push(semantic("ECP_MANIFEST_INVALID", "mode requires as.", `${path}/mode`, id))
  }
  if (asName && inputNames.has(asName)) {
    issues.push(semantic("ECP_MANIFEST_INVALID", `as ${asName} is already an execution input.`, `${path}/as`, id))
  }
  if (state.inLoop && asName && (mode ?? "create") === "create") {
    issues.push(
      semantic("ECP_COMMIT_CONFLICT", `create mode inside a loop would fail on the next round. Use replace, append, or merge.`, `${path}/mode`, id),
    )
  }
  if (typeof node.config === "string" && !configs.has(node.config)) {
    const names = [...configs.keys()]
    issues.push({
      ...semantic("ECP_CONFIG_UNKNOWN", `Config ${node.config} does not exist.`, `${path}/config`, id),
      suggestions: closeMatches(node.config, names).map((name) => `did you mean '${name}'?`),
    })
  }
  const capability = options.capabilities.find((item) => item.id === node.uses)
  const config = typeof node.config === "string" ? configs.get(node.config) : undefined
  if (config && capability?.configSchema) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    const validator = ajv.compile(capability.configSchema)
    if (!validator(maskSecrets(config.values))) {
      issues.push(semantic("ECP_CONFIG_INVALID", `Config ${config.id} does not match the plugin schema.`, `${path}/config`, id))
    }
  }
}

async function checkScripts(
  value: unknown,
  pointer: string,
  nodeId: string | undefined,
  options: ValidateOptions,
  issues: ValidationIssue[],
): Promise<void> {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      await checkScripts(value[index], `${pointer}/${index}`, nodeId, options, issues)
    }
    return
  }
  if (!isRecord(value)) return
  if (typeof value.$expr === "string") {
    const failure = checkExpression(value.$expr)
    if (failure) issues.push(syntaxIssue("ECP_EXPR_INVALID", `${pointer}/$expr`, failure, nodeId))
  }
  if (isRecord(value.$script)) {
    const script = value.$script
    const source = typeof script.source === "string" ? script.source : undefined
    const scriptPath = typeof script.path === "string" ? script.path : undefined
    if (source !== undefined && scriptPath !== undefined) {
      issues.push(semantic("ECP_SCRIPT_INVALID", "Script must set source or path, not both.", `${pointer}/$script`, nodeId))
    } else if (source === undefined && scriptPath === undefined) {
      issues.push(semantic("ECP_SCRIPT_INVALID", "Script must set source or path.", `${pointer}/$script`, nodeId))
    } else if (source !== undefined) {
      const version = typeof script.ecmaVersion === "number" ? script.ecmaVersion : 2020
      const failure = checkScript(source, version)
      if (failure) issues.push(syntaxIssue("ECP_SCRIPT_INVALID", `${pointer}/$script/source`, failure, nodeId))
    } else if (scriptPath !== undefined) {
      const absolute = resolvePath(options.executionDir, scriptPath)
      if (!absolute) {
        issues.push(semantic("ECP_SCRIPT_INVALID", `Script path ${scriptPath} is not absolute and the execution has no directory.`, `${pointer}/$script/path`, nodeId))
      } else if (!options.readText) {
        issues.push(semantic("ECP_SCRIPT_INVALID", `Script file ${scriptPath} cannot be read.`, `${pointer}/$script/path`, nodeId))
      } else {
        try {
          const text = await options.readText(absolute)
          const failure = checkScript(text, typeof script.ecmaVersion === "number" ? script.ecmaVersion : 2020)
          if (failure) issues.push(syntaxIssue("ECP_SCRIPT_INVALID", `${pointer}/$script/path`, failure, nodeId))
        } catch {
          issues.push(semantic("ECP_SCRIPT_INVALID", `Script file ${scriptPath} was not found.`, `${pointer}/$script/path`, nodeId))
        }
      }
    }
    if (script.params !== undefined) await checkScripts(script.params, `${pointer}/$script/params`, nodeId, options, issues)
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "$script" || key === "$expr") continue
    await checkScripts(child, `${pointer}/${key}`, nodeId, options, issues)
  }
}

function validateRunInput(manifest: unknown, input: Record<string, unknown>): ValidationIssue[] {
  if (!isManifest(manifest) || !manifest.execution?.accepts) return []
  const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: true })
  const validator = ajv.compile(manifest.execution.accepts)
  validator(input)
  return ((validator.errors ?? []) as AjvError[]).map((error) => ({
    code: "ECP_INPUT_INVALID" as const,
    severity: "error" as const,
    message: `Run input does not match execution.accepts. ${error.message ?? "Invalid input."}`,
    path: `/input${ajvPointer(error) === "/" ? "" : ajvPointer(error)}`,
  }))
}

function finish(issues: ValidationIssue[], manifestHash: string, schemaHash: string): ValidationResult {
  const errors = issues.filter((item) => item.severity === "error").sort(byPath)
  const warnings = issues.filter((item) => item.severity === "warning").sort(byPath)
  return { valid: errors.length === 0, issues: [...errors, ...warnings], manifestHash, schemaHash }
}

function byPath(left: ValidationIssue, right: ValidationIssue): number {
  const a = left.path.split("/")
  const b = right.path.split("/")
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    if (a[index] === undefined) return -1
    if (b[index] === undefined) return 1
    const leftNumber = /^\d+$/.test(a[index] ?? "") ? Number(a[index]) : undefined
    const rightNumber = /^\d+$/.test(b[index] ?? "") ? Number(b[index]) : undefined
    if (leftNumber !== undefined && rightNumber !== undefined && leftNumber !== rightNumber) return leftNumber - rightNumber
    if (a[index] !== b[index]) return (a[index] ?? "") < (b[index] ?? "") ? -1 : 1
  }
  return 0
}

function markerValue(manifest: unknown, pointer: string): boolean {
  const candidates = [pointer, pointer.split("/").slice(0, -1).join("/")]
  return candidates.some((candidate) => {
    const value = readPointer(manifest, candidate || "/")
    return isRecord(value) && ("$ref" in value || "$expr" in value || "$state" in value || "$script" in value || "$secret" in value || "$env" in value)
  })
}

function ajvPointer(error: AjvError): string {
  const extra = error.params.missingProperty ?? error.params.additionalProperty
  const base = error.instancePath ?? ""
  if (typeof extra === "string") return `${base}/${extra}` || "/"
  return base === "" ? "/" : base
}

function readPointer(value: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return value
  let current = value
  for (const raw of pointer.split("/").slice(1)) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~")
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function resolvePath(directory: string | undefined, filePath: string): string | undefined {
  if (filePath.startsWith("/") || filePath.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(filePath)) return filePath
  if (!directory) return undefined
  const separator = directory.includes("\\") ? "\\" : "/"
  return `${directory.replace(/[\\/]$/, "")}${separator}${filePath}`
}

/**
 * Stand-in for `$secret` / `$env` when validating config values against a plugin schema.
 * Must be a non-empty string so `minLength` / `.min(1)` schemas still pass.
 */
const SECRET_PLACEHOLDER = "*"

function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => maskSecrets(item))
  if (!isRecord(value)) return value
  if (typeof value.$secret === "string" || typeof value.$env === "string") return SECRET_PLACEHOLDER
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, maskSecrets(child)]))
}

function schemaProperties(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema) || !isRecord(schema.properties)) return undefined
  return schema.properties
}

function recordProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined
}

function trim(value: unknown, max: number): unknown {
  const text = JSON.stringify(value)
  if (text === undefined || text.length <= max) return value
  return text.slice(0, max)
}

function semantic(code: ValidationIssue["code"], message: string, path: string, nodeId?: string): ValidationIssue {
  return { code, severity: "error", message, path, nodeId }
}

function isManifest(value: unknown): value is ExecutionManifest {
  return isRecord(value) && value.schema === EXECUTION_SCHEMA && Array.isArray(value.steps)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
