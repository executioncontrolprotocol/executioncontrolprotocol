import {
  EXECUTION_SCHEMA,
  EXECUTION_VERSION,
  firstPartyInstallCommand,
  firstPartyPlugin,
  pluginIdFromCapability,
} from "@executioncontrolprotocol/protocol"
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
import type { JsonSchema } from "../schema/json-schema.js"
import { closeMatches } from "../schema/suggest.js"
import { checkDataFlow } from "./dataflow.js"
import { checkExpression, checkScript, syntaxIssue } from "./expr.js"
import {
  assertScriptPositions,
  collectSecretEnvIssues,
  markerKind,
  validateWithMarkers,
  type MarkerAjvError,
} from "./markers.js"

/**
 * Light-manifest schema fingerprint for {@link HostSchemaSet} `schemaHash`.
 * @category Validation
 */
export interface SchemaFingerprint {
  /** Plugin id. */
  pluginId: string
  /** Plugin package version. */
  version: string
  /** Hash of `ecp.schema.json` from the light manifest. */
  hash: string
}

/**
 * What the validator needs besides the manifest. File reads are injected.
 * @category Validation
 */
export interface ValidateOptions {
  /** Installed capabilities (light rows are fine; schemas load via {@link ValidateOptions.loadPluginSchema}). */
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
   * Loader for a plugin's schema document. Used for raw `accepts` / `returns` and L3.
   */
  loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
  /**
   * Optional fingerprints for `schemaHash` (base + sorted plugin schema hashes).
   * When omitted, hashes fall back to capability plugin id + version only.
   */
  schemaFingerprints?: readonly SchemaFingerprint[]
  /**
   * Optional prebuilt schema set. When set, skips {@link HostSchemaSet.create}
   * (tests and host-lifetime cache).
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
 * Compiled host schema set: one base document validator plus lazy per-capability input validators.
 * @category Validation
 */
export class HostSchemaSet {
  /** Base execution schema (`ecp://host/execution.schema.json`). */
  readonly schema: JsonSchema
  /** Hash of the base schema plus sorted plugin schema fingerprints. */
  readonly schemaHash: string
  /** How many times the base document schema was compiled (always 1 per set). */
  readonly documentCompileCount = 1
  private readonly ajv = new Ajv({ allErrors: true, strict: false, useDefaults: false })
  private readonly inputAjv = new Ajv({ allErrors: true, strict: false, useDefaults: false })
  private readonly documentValidator: ReturnType<AjvLike["compile"]>
  private readonly inputValidators = new Map<string, ReturnType<AjvLike["compile"]>>()
  private readonly outputValidators = new Map<string, ReturnType<AjvLike["compile"]>>()
  private readonly pluginSchemas = new Map<string, PluginSchemaDocument>()
  private readonly addedPluginSchemaIds = new Set<string>()
  private inputCompileCountInternal = 0
  private readonly loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
  private readonly capabilities: readonly CapabilityEntry[]

  private constructor(
    schema: JsonSchema,
    schemaHash: string,
    options: {
      capabilities?: readonly CapabilityEntry[]
      loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
    } = {},
  ) {
    this.schema = schema
    this.schemaHash = schemaHash
    this.capabilities = options.capabilities ?? []
    this.loadPluginSchema = options.loadPluginSchema
    addFormats(this.ajv)
    addFormats(this.inputAjv)
    this.documentValidator = this.ajv.compile(schema)
  }

  /**
   * Build a base-only schema set. Capabilities are not inlined into the document schema.
   * @category Validation
   */
  static async create(
    capabilities: readonly CapabilityEntry[],
    options: {
      loadPluginSchema?: (pluginId: string) => Promise<PluginSchemaDocument | undefined>
      schemaFingerprints?: readonly SchemaFingerprint[]
    } = {},
  ): Promise<HostSchemaSet> {
    const schema = structuredClone(baseSchema) as JsonSchema
    schema.$id = HOST_EXECUTION_SCHEMA_ID
    const fingerprints =
      options.schemaFingerprints ??
      uniquePluginFingerprints(capabilities)
    const schemaHash = await sha256Hex(
      canonicalJson({
        base: schema,
        plugins: [...fingerprints]
          .map((item) => ({ id: item.pluginId, version: item.version, hash: item.hash }))
          .sort((left, right) => {
            if (left.id !== right.id) return left.id < right.id ? -1 : 1
            if (left.version !== right.version) return left.version < right.version ? -1 : 1
            return left.hash < right.hash ? -1 : left.hash > right.hash ? 1 : 0
          }),
      }),
    )
    return new HostSchemaSet(schema, schemaHash, {
      capabilities,
      loadPluginSchema: options.loadPluginSchema,
    })
  }

  /** Number of compiled capability input validators (grows on first use). */
  get inputCompileCount(): number {
    return this.inputCompileCountInternal
  }

  /** Plugin schema documents added to Ajv so far. */
  get addedPluginSchemaCount(): number {
    return this.addedPluginSchemaIds.size
  }

  /** Validate a manifest document. */
  validateDocument(manifest: unknown): AjvError[] {
    this.documentValidator(manifest)
    return (this.documentValidator.errors ?? []) as AjvError[]
  }

  /**
   * Validate one resolved capability input (runtime). Compiles once per schema hash and capability.
   * Prefers the plugin schema document when available; falls back to {@link CapabilityEntry.accepts}.
   * @category Validation
   */
  validateInput(capability: CapabilityEntry, input: unknown): AjvError[] {
    const cacheKey = `${this.schemaHash}:runtime:${capability.id}`
    let validator = this.inputValidators.get(cacheKey)
    if (!validator) {
      const accepts = capability.accepts ?? { type: "object" }
      validator = this.inputAjv.compile(accepts)
      this.inputValidators.set(cacheKey, validator)
      this.inputCompileCountInternal += 1
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
        validator = this.inputAjv.compile(capability.accepts ?? { type: "object" })
      }
      this.inputValidators.set(cacheKey, validator)
      this.inputCompileCountInternal += 1
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
    return document?.$defs[`${name}.accepts`] ?? capability.accepts ?? { type: "object" }
  }

  /**
   * Raw returns schema for a capability (from the plugin document when available).
   * @category Validation
   */
  async rawReturns(capability: CapabilityEntry): Promise<Record<string, unknown>> {
    const document = await this.ensurePluginSchema(capability.plugin)
    const name = capabilityName(capability.id)
    return document?.$defs[`${name}.returns`] ?? capability.returns ?? { type: "object" }
  }

  /**
   * Validate one resolved step input against a step-declared accepts schema with marker filtering.
   * @category Validation
   */
  validateStepAccepts(accepts: Record<string, unknown>, input: unknown): AjvError[] {
    const cacheKey = `${this.schemaHash}:step-accepts:${JSON.stringify(accepts)}`
    let validator = this.inputValidators.get(cacheKey)
    if (!validator) {
      validator = this.inputAjv.compile(accepts)
      this.inputValidators.set(cacheKey, validator)
      this.inputCompileCountInternal += 1
    }
    return validateWithMarkers(validator as ((data: unknown) => boolean) & { errors?: MarkerAjvError[] | null }, input) as AjvError[]
  }

  /**
   * Validate output against a returns schema. An empty schema object skips validation.
   * @category Validation
   */
  validateOutput(schema: Record<string, unknown>, output: unknown): AjvError[] {
    if (skipsOutputSchemaCheck(schema)) return []
    const cacheKey = `${this.schemaHash}:output:${JSON.stringify(schema)}`
    let validator = this.outputValidators.get(cacheKey)
    if (!validator) {
      validator = this.inputAjv.compile(schema)
      this.outputValidators.set(cacheKey, validator)
    }
    validator(output)
    return (validator.errors ?? []) as AjvError[]
  }
}

/** True when returns validation should accept any JSON value (`{}` on the step). */
function skipsOutputSchemaCheck(schema: Record<string, unknown>): boolean {
  return Object.keys(schema).length === 0
}

/** Ajv keywords that only aggregate sub-schema failures. */
const COMBINATOR_NOISE = new Set(["if", "then", "else", "anyOf", "oneOf", "allOf", "not", "false"])

/**
 * Validate an execution object through L0–L3, and L4 when `input` is set.
 * Uses the base document schema plus per-capability raw accepts with marker filtering.
 * @category Validation
 */
export async function validateExecution(manifest: unknown, options: ValidateOptions): Promise<ValidationResult> {
  const schemas =
    options.schemaSet ??
    (await HostSchemaSet.create(options.capabilities, {
      loadPluginSchema: options.loadPluginSchema,
      schemaFingerprints: options.schemaFingerprints,
    }))
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
  // Schema checks run on a copy with each $secret/$env replaced by null, so a marker can't fail
  // the enclosing value's type union and cascade errors onto its ancestors. Errors at the marker
  // itself are dropped in favour of the dedicated issue; real errors elsewhere still surface.
  const checked = secretEnvPaths.length > 0 ? withoutSecretEnv(manifest) : manifest
  const baseErrors = schemas.validateDocument(checked).filter((error) => {
    const path = ajvPointer(error)
    if (atOrUnderSecretEnv(path) || atOrUnderSecretEnv(error.instancePath)) return false
    return !(COMBINATOR_NOISE.has(error.keyword) && aboveSecretEnv(error.instancePath))
  })
  const structural = mapAjvErrors(baseErrors, manifest, options.capabilities).filter(
    (issue) =>
      !/boolean schema is false/i.test(issue.message) &&
      !atOrUnderSecretEnv(issue.path),
  )
  const unknownUses = checkUnknownUses(manifest, options.capabilities)
  const capabilityInputRaw = isManifest(checked) ? await checkCapabilityInputs(checked, schemas, options.capabilities) : []
  const capabilityInput = capabilityInputRaw.filter((issue) => !atOrUnderSecretEnv(issue.path))
  const enriched = isManifest(manifest)
    ? await enrichCapabilities(options.capabilities, schemas)
    : options.capabilities
  const semantic = await checkSemantics(manifest, { ...options, capabilities: enriched })
  const layerErrors = [...structural, ...unknownUses, ...capabilityInput, ...secretEnv, ...semantic]
  const flow =
    layerErrors.some((item) => item.severity === "error") || !isManifest(manifest)
      ? []
      : checkDataFlow(manifest, enriched)
  const inputIssues = options.input ? validateRunInput(manifest, options.input) : []
  const combined = collapseScriptPositionIssues([...layerErrors, ...flow, ...inputIssues])
  return finish(dedupeIssues(combined), manifestHash, schemas.schemaHash)
}

/** Deep copy with every `$secret` / `$env` marker object replaced by `null`. */
function withoutSecretEnv(value: unknown): unknown {
  const kind = markerKind(value)
  if (kind === "$secret" || kind === "$env") return null
  if (Array.isArray(value)) return value.map(withoutSecretEnv)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withoutSecretEnv(item)]))
  }
  return value
}

function uniquePluginFingerprints(capabilities: readonly CapabilityEntry[]): SchemaFingerprint[] {
  const seen = new Map<string, SchemaFingerprint>()
  for (const capability of capabilities) {
    const key = `${capability.plugin}@${capability.pluginVersion}`
    if (seen.has(key)) continue
    seen.set(key, {
      pluginId: capability.plugin,
      version: capability.pluginVersion,
      hash: capability.pluginVersion,
    })
  }
  return [...seen.values()]
}

async function enrichCapabilities(
  capabilities: readonly CapabilityEntry[],
  schemas: HostSchemaSet,
): Promise<CapabilityEntry[]> {
  const out: CapabilityEntry[] = []
  for (const capability of capabilities) {
    if (capability.accepts && capability.returns) {
      out.push(capability)
      continue
    }
    const document = await schemas.ensurePluginSchema(capability.plugin)
    const name = capabilityName(capability.id)
    const accepts = document?.$defs[`${name}.accepts`] ?? capability.accepts
    const returns = document?.$defs[`${name}.returns`] ?? capability.returns
    const configSchema = document?.$defs.config ?? capability.configSchema
    out.push({
      ...capability,
      ...(accepts ? { accepts } : {}),
      ...(returns ? { returns } : {}),
      ...(configSchema ? { configSchema } : {}),
    })
  }
  return out
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

/**
 * Keep the first issue for each `{ code, path, message, severity }` tuple (F2).
 * @category Validation
 */
export function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  const out: ValidationIssue[] = []
  for (const issue of issues) {
    const key = `${issue.code}|${issue.path}|${issue.message}|${issue.severity}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(issue)
  }
  return out
}

/** When `ECP_SCRIPT_INVALID` is present at a path, drop co-located schema noise (F2). */
function collapseScriptPositionIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const scriptPaths = new Set(issues.filter((issue) => issue.code === "ECP_SCRIPT_INVALID").map((issue) => issue.path))
  if (scriptPaths.size === 0) return issues
  return issues.filter((issue) => !(scriptPaths.has(issue.path) && issue.code !== "ECP_SCRIPT_INVALID"))
}

/**
 * Map Ajv input errors for a resolved step input to validation issues.
 * @category Validation
 */
export function mapCapabilityInputIssues(errors: AjvError[], stepInputPointer: string): ValidationIssue[] {
  return dedupeIssues(
    errors.map((error) => ({
      code: "ECP_INPUT_INVALID" as const,
      severity: "error" as const,
      message: `Input does not match the capability accepts schema. ${error.message ?? "Invalid input."}`,
      path: `${stepInputPointer}${ajvPointer(error) === "/" ? "" : ajvPointer(error)}`,
    })),
  )
}

/**
 * Map Ajv output errors for a step to validation issues.
 * @category Validation
 */
export function mapStepOutputIssues(errors: AjvError[], stepPointer: string): ValidationIssue[] {
  return dedupeIssues(
    errors.map((error) => ({
      code: "ECP_OUTPUT_INVALID" as const,
      severity: "error" as const,
      message: `Output does not match the step returns schema. ${error.message ?? "Invalid output."}`,
      path: `${stepPointer}${ajvPointer(error) === "/" ? "" : ajvPointer(error)}`,
    })),
  )
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
    const install = firstPartyInstallCommand(pluginId)
    const message = firstParty.bundled
      ? `Plugin ${firstParty.short} is bundled with the host and is not loaded.`
      : `Plugin ${firstParty.short} is not installed. ${install ?? ""}`.trim()
    return {
      code: "ECP_PLUGINS_MISSING",
      severity: "error",
      message,
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
          const stepContract = capability.contract === "step"
          const stepAccepts = stepContract && isRecord(node.accepts) ? node.accepts : undefined
          if (stepContract && !stepAccepts) continue
          const accepts = stepAccepts ?? (await schemas.rawAccepts(capability))
          const rawErrors = stepAccepts
            ? schemas.validateStepAccepts(stepAccepts, input)
            : await schemas.validateCapabilityInput(capability, input)
          const acceptsLabel = stepContract ? "step accepts" : "capability accepts"
          for (const error of rawErrors) {
            const relative = ajvPointer(error)
            const fullPath = relative === "/" ? inputPath : `${inputPath}${relative === "" ? "" : relative}`
            issues.push({
              code: "ECP_INPUT_INVALID",
              severity: "error",
              message: `Input does not match the ${acceptsLabel} schema. ${error.message ?? "Invalid input."}`,
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
        const install = firstPartyInstallCommand(pluginId)
        message = firstParty.bundled
          ? `Plugin ${firstParty.short} is bundled with the host and is not loaded.`
          : `Plugin ${firstParty.short} is not installed. ${install ?? ""}`.trim()
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
    if (type === "step") {
      checkStep(node, path, id, state, issues, inputNames, configs, options)
      const capability = options.capabilities.find((item) => item.id === node.uses)
      checkStepContract(node, path, id, capability, issues)
      if (capability?.contract === "step" && capability.code === "script") {
        await checkTransformScript(node.script, `${path}/script`, id, options, issues)
      }
    }
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

function checkStepContract(
  node: Record<string, unknown>,
  path: string,
  id: string | undefined,
  capability: CapabilityEntry | undefined,
  issues: ValidationIssue[],
): void {
  const stepContract = capability?.contract === "step"
  const hasAccepts = node.accepts !== undefined
  const hasReturns = node.returns !== undefined
  const hasScript = node.script !== undefined
  const hasExpression = node.expression !== undefined
  if (stepContract) {
    if (!hasAccepts || !isRecord(node.accepts)) {
      issues.push(semantic("ECP_MANIFEST_INVALID", "Step contract requires accepts.", `${path}/accepts`, id))
    }
    if (!hasReturns || !isRecord(node.returns)) {
      issues.push(semantic("ECP_MANIFEST_INVALID", "Step contract requires returns.", `${path}/returns`, id))
    }
    if (capability?.code === "script" && !hasScript) {
      issues.push(semantic("ECP_SCRIPT_INVALID", "Transform step requires script.", `${path}/script`, id))
    } else if (capability?.code === "script" && hasExpression) {
      issues.push(semantic("ECP_MANIFEST_INVALID", "expression is not allowed when code is script.", `${path}/expression`, id))
    }
    if (capability?.code === "expression" && (typeof node.expression !== "string" || node.expression.length === 0)) {
      issues.push(semantic("ECP_MANIFEST_INVALID", "Transform step requires expression.", `${path}/expression`, id))
    } else if (capability?.code === "expression" && hasScript) {
      issues.push(semantic("ECP_MANIFEST_INVALID", "script is not allowed when code is expression.", `${path}/script`, id))
    }
    if (capability?.code === undefined) {
      issues.push(semantic("ECP_MANIFEST_INVALID", "Step contract capability is missing code.", `${path}/uses`, id))
    }
    return
  }
  if (hasAccepts) {
    issues.push(semantic("ECP_MANIFEST_INVALID", "accepts is only allowed on step-contract capabilities.", `${path}/accepts`, id))
  }
  if (hasReturns) {
    issues.push(semantic("ECP_MANIFEST_INVALID", "returns is only allowed on step-contract capabilities.", `${path}/returns`, id))
  }
  if (hasScript) {
    issues.push(semantic("ECP_MANIFEST_INVALID", "script is only allowed on step-contract capabilities.", `${path}/script`, id))
  }
  if (hasExpression) {
    issues.push(
      semantic("ECP_MANIFEST_INVALID", "expression is only allowed on step-contract capabilities.", `${path}/expression`, id),
    )
  }
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

async function checkTransformScript(
  value: unknown,
  pointer: string,
  nodeId: string | undefined,
  options: ValidateOptions,
  issues: ValidationIssue[],
): Promise<void> {
  if (!isRecord(value) || !isRecord(value.$script)) {
    return
  }
  const script = value.$script
  if (script.lang !== "js") {
    issues.push(semantic("ECP_SCRIPT_INVALID", "Transform script lang must be js.", `${pointer}/$script/lang`, nodeId))
  }
  if (script.params !== undefined) {
    issues.push(semantic("ECP_SCRIPT_INVALID", "Transform script must not set params.", `${pointer}/$script/params`, nodeId))
  }
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
      issues.push(
        semantic(
          "ECP_SCRIPT_INVALID",
          `Script path ${scriptPath} is not absolute and the execution has no directory.`,
          `${pointer}/$script/path`,
          nodeId,
        ),
      )
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
  for (const issue of issues) {
    if (typeof issue.path !== "string") {
      throw new Error(`Validation issue path must be a string (got ${String(issue.path)} for ${issue.code}).`)
    }
  }
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
