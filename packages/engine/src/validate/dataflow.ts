import type { CapabilityEntry, ExecutionManifest, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { closeMatches } from "../schema/suggest.js"
import { fileAccessBindingIssue, fileAccessValueIssues } from "./file-access.js"

type JsonSchema = Record<string, unknown>

interface Binding {
  schema: JsonSchema
  certainty: "definite" | "maybe"
  producer: string
}

type Env = Map<string, Binding>

interface WalkContext {
  maybe: boolean
  siblings: Set<string>
}

const AVAILABLE_CAP = 50

/**
 * L3 data-flow check. The manifest must already be structurally valid.
 * @category Validation
 */
export function checkDataFlow(manifest: ExecutionManifest, capabilities: readonly CapabilityEntry[]): ValidationIssue[] {
  const byId = new Map(capabilities.map((capability) => [capability.id, capability]))
  const issues: ValidationIssue[] = []
  const env = initialEnv(manifest)
  const after = walkNodes(asNodes(manifest.steps), env, { maybe: false, siblings: new Set() }, issues, byId)
  const returns = manifest.execution?.returns
  const properties = schemaProperties(returns)
  if (properties) {
    for (const name of Object.keys(properties)) {
      const binding = after.get(name)
      const path = `/execution/returns/properties/${name}`
      if (!binding) {
        issues.push(issue("ECP_RETURNS_UNRESOLVED", "error", `Return key ${name} is never produced.`, path))
      } else if (binding.certainty === "maybe") {
        issues.push(issue("ECP_RETURNS_UNRESOLVED", "warning", `Return key ${name} might not be produced.`, path))
      }
    }
  }
  return issues
}

function initialEnv(manifest: ExecutionManifest): Env {
  const env: Env = new Map()
  const accepts = manifest.execution?.accepts
  const properties = schemaProperties(accepts) ?? {}
  const required = new Set(Array.isArray(accepts?.required) ? (accepts.required as string[]) : [])
  for (const [name, schema] of Object.entries(properties)) {
    const definite = required.has(name) || (schema as JsonSchema).default !== undefined
    env.set(name, { schema: schema as JsonSchema, certainty: definite ? "definite" : "maybe", producer: "input" })
  }
  return env
}

function walkNodes(
  nodes: NodeLike[],
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  let current = env
  for (const node of nodes) current = walkNode(node, current, ctx, issues, capabilities)
  return current
}

function walkNode(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  if (node.type === "if") return walkIf(node, env, ctx, issues, capabilities)
  if (node.type === "loop") return walkLoop(node, env, ctx, issues, capabilities)
  if (node.type === "parallel") return walkParallel(node, env, ctx, issues, capabilities)
  return walkStep(node, env, ctx, issues, capabilities)
}

function walkStep(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  const capability = node.uses ? capabilities.get(node.uses) : undefined
  const stepAccepts = isRecord(node.accepts) ? (node.accepts as JsonSchema) : undefined
  const accepts = (capability?.contract === "step" ? stepAccepts : capability?.accepts) as JsonSchema | undefined
  visitValues(node.input, accepts, `${node.path}/input`, (value, schema, pointer) => {
    if (!isRecord(value)) return
    if (typeof value.$ref === "string") {
      checkRef(value, schema, pointer, node.id, env, ctx, issues)
      return
    }
    if (!isMarker(value)) {
      for (const issue of fileAccessValueIssues(value, schema, pointer, node.id)) {
        issues.push(issue)
      }
    }
  })
  if (!node.as) return env
  const mode = node.mode ?? "create"
  const existing = env.get(node.as)
  if (mode === "create" && existing?.certainty === "definite") {
    issues.push(
      issue(
        "ECP_COMMIT_CONFLICT",
        "error",
        `Step ${node.id} creates ${node.as}, which already exists.`,
        `${node.path}/as`,
        node.id,
      ),
    )
  }
  const stepReturns = isRecord(node.returns) ? (node.returns as JsonSchema) : undefined
  const returns =
    (capability?.contract === "step" ? stepReturns : (capability?.returns as JsonSchema | undefined)) ?? {}
  const schema = schemaForMode(mode, existing?.schema, returns)
  const next = cloneEnv(env)
  next.set(node.as, {
    schema,
    certainty: ctx.maybe ? "maybe" : "definite",
    producer: node.id ?? "step",
  })
  return next
}

function walkIf(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  const entry = scopedIfEnv(node, env, issues)
  visitValues(node.input, node.accepts as JsonSchema | undefined, `${node.path}/input`, (value, schema, pointer) => {
    if (isRecord(value) && typeof value.$ref === "string") {
      checkRef(value, schema, pointer, node.id, env, ctx, issues)
    }
  })
  const thenEnv = walkNodes(node.then ?? [], cloneEnv(entry), ctx, issues, capabilities)
  const elseNodes = node.else ?? []
  const elseEnv = elseNodes.length > 0 ? walkNodes(elseNodes, cloneEnv(entry), ctx, issues, capabilities) : undefined
  const sides = elseEnv ? [thenEnv, elseEnv] : [thenEnv]
  const produced = new Set<string>()
  for (const sideEnv of sides) {
    for (const key of changedKeys(env, sideEnv)) produced.add(key)
  }
  if (node.as && !env.has(node.as)) produced.delete(node.as)
  const next = cloneEnv(env)
  for (const key of produced) {
    const infos = sides
      .map((sideEnv) => sideEnv.get(key))
      .filter((binding): binding is Binding => binding !== undefined && binding !== env.get(key))
    const everyDefinite = sides.every((sideEnv) => {
      const binding = sideEnv.get(key)
      return binding !== undefined && binding !== env.get(key) && binding.certainty === "definite"
    })
    const schemas = infos.map((binding) => binding.schema)
    next.set(key, {
      schema: schemas.length <= 1 ? (schemas[0] ?? {}) : { anyOf: schemas },
      certainty: everyDefinite && elseEnv ? "definite" : "maybe",
      producer: infos[0]?.producer ?? node.id ?? "if",
    })
  }
  return next
}

function scopedIfEnv(node: NodeLike, env: Env, issues: ValidationIssue[]): Env {
  if (!node.as) return env
  if (env.get(node.as)) {
    issues.push(
      issue(
        "ECP_COMMIT_CONFLICT",
        "error",
        `Scoped as ${node.as} collides with an existing key.`,
        `${node.path}/as`,
        node.id,
      ),
    )
    return env
  }
  const accepts = isRecord(node.accepts) ? (node.accepts as JsonSchema) : { type: "object" }
  const next = cloneEnv(env)
  next.set(node.as, { schema: accepts, certainty: "definite", producer: node.id ?? "if" })
  return next
}

function walkLoop(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  const mode = loopMode(node)
  if (mode === "forEach") return walkLoopForEach(node, env, ctx, issues, capabilities)
  if (mode === "for") return walkLoopFor(node, env, ctx, issues, capabilities)
  return walkLoopWhile(node, env, ctx, issues, capabilities)
}

function walkLoopWhile(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  const after = walkNodes(node.steps ?? [], cloneEnv(env), ctx, issues, capabilities)
  checkEndInput(node, after, ctx, issues)
  const next = cloneEnv(env)
  for (const key of changedKeys(env, after)) {
    const produced = after.get(key)
    if (!produced) continue
    next.set(key, produced)
  }
  if (node.into) {
    // The body runs at least once, so the last gathered value always exists.
    next.set(node.into, { schema: gatheredSchema(node, after), certainty: ctx.maybe ? "maybe" : "definite", producer: node.id ?? "loop" })
  }
  return next
}

function walkLoopFor(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  visitValues(node.input, { type: "object", properties: { count: { type: "integer", minimum: 0 } } }, `${node.path}/input`, (value, schema, pointer) => {
    if (isRecord(value) && typeof value.$ref === "string") {
      checkRef(value, schema, pointer, node.id, env, ctx, issues)
    }
  })
  const asKey = node.as
  if (!asKey) return env
  if (env.get(asKey)) {
    issues.push(
      issue(
        "ECP_COMMIT_CONFLICT",
        "error",
        `Loop ${node.id} binds ${asKey}, which already exists in the parent scope.`,
        `${node.path}/as`,
        node.id,
      ),
    )
  }
  const bodyEnv = cloneEnv(env)
  bodyEnv.set(asKey, {
    schema: { type: "integer", minimum: 0 },
    certainty: "definite",
    producer: node.id ?? "loop",
  })
  // Inside a round the body runs in order; only after the loop are its writes uncertain (count may be 0).
  const after = walkNodes(node.steps ?? [], bodyEnv, ctx, issues, capabilities)
  checkEndInput(node, after, ctx, issues)
  const next = cloneEnv(env)
  for (const key of changedKeys(env, after)) {
    if (key === asKey) continue
    const before = env.get(key)
    const produced = after.get(key)
    if (!produced || produced === before) continue
    next.set(key, before?.certainty === "definite" ? before : { ...produced, certainty: "maybe" })
  }
  if (node.into) {
    // A count of 0 runs no round and writes nothing.
    next.set(node.into, { schema: gatheredSchema(node, after), certainty: "maybe", producer: node.id ?? "loop" })
  }
  return next
}

function walkLoopForEach(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  const asKey = node.as
  const into = node.into
  if (!asKey || !into) return env
  const asIndex = `${asKey}Index`
  if (env.get(asKey) || env.get(asIndex)) {
    issues.push(
      issue(
        "ECP_COMMIT_CONFLICT",
        "error",
        `Loop ${node.id} binds ${asKey}, which already exists in the parent scope.`,
        `${node.path}/as`,
        node.id,
      ),
    )
  }
  visitValues(node.input, { type: "object", properties: { items: { type: "array" } } }, `${node.path}/input`, (value, _schema, pointer) => {
    if (isRecord(value) && typeof value.$ref === "string") {
      checkRef(value, { type: "array" }, pointer, node.id, env, ctx, issues)
    }
  })
  const itemsMarker = isRecord(node.input) ? (node.input as Record<string, unknown>).items : undefined
  const elementSchema = arrayElementSchema(env, itemsMarker)
  const itemEnv = cloneEnv(env)
  itemEnv.set(asKey, { schema: elementSchema, certainty: "definite", producer: node.id ?? "loop" })
  itemEnv.set(asIndex, { schema: { type: "integer", minimum: 0 }, certainty: "definite", producer: node.id ?? "loop" })
  const afterBody = walkNodes(node.steps ?? [], itemEnv, ctx, issues, capabilities)
  checkEndInput(node, afterBody, ctx, issues)
  const collectBinding = gatheredSchema(node, afterBody)
  const continueMode = node.onError === "continue"
  const intoElement = continueMode ? { anyOf: [collectBinding, { type: "null" }] } : collectBinding
  const intoExisting = env.get(into)
  if (intoExisting?.certainty === "definite") {
    issues.push(
      issue(
        "ECP_COMMIT_CONFLICT",
        "error",
        `Loop ${node.id} creates ${into}, which already exists.`,
        `${node.path}/into`,
        node.id,
      ),
    )
  }
  const errorsKey = `${into}Errors`
  if (continueMode && env.get(errorsKey)?.certainty === "definite") {
    issues.push(
      issue(
        "ECP_COMMIT_CONFLICT",
        "error",
        `Loop ${node.id} creates ${errorsKey}, which already exists.`,
        `${node.path}/into`,
        node.id,
      ),
    )
  }
  const next = cloneEnv(env)
  next.set(into, {
    schema: { type: "array", items: intoElement },
    certainty: "definite",
    producer: node.id ?? "loop",
  })
  if (continueMode) {
    next.set(errorsKey, {
      schema: {
        type: "array",
        items: {
          type: "object",
          required: ["index", "error"],
          properties: {
            index: { type: "integer", minimum: 0 },
            error: { type: "object" },
          },
        },
      },
      certainty: "definite",
      producer: node.id ?? "loop",
    })
  }
  return next
}

/**
 * Check the `$ref`s bound into a loop's `end` against the environment after the body: `repeat` must be boolean,
 * the other inputs must fit `end.accepts` when it is declared.
 */
function checkEndInput(node: NodeLike, bodyEnv: Env, ctx: WalkContext, issues: ValidationIssue[]): void {
  const endInput = isRecord(node.endInput) ? node.endInput : {}
  const accepts = isRecord(node.endAccepts) ? (node.endAccepts as JsonSchema) : undefined
  for (const [key, value] of Object.entries(endInput)) {
    const target: JsonSchema | undefined =
      key === "repeat"
        ? { type: "boolean" }
        : isRecord(accepts?.properties)
          ? ((accepts.properties as Record<string, JsonSchema>)[key] ?? undefined)
          : undefined
    visitValues(value, target, `${node.path}/end/input/${key}`, (inner, schema, pointer) => {
      if (isRecord(inner) && typeof inner.$ref === "string") {
        checkRef(inner, schema, pointer, node.id, bodyEnv, ctx, issues)
      }
    })
  }
}

/** Schema of one gathered value: `end.returns`, else `unknown` for a gather expression / script, else `value`'s type. */
function gatheredSchema(node: NodeLike, bodyEnv: Env): JsonSchema {
  if (isRecord(node.endReturns)) return node.endReturns as JsonSchema
  if (node.endGathers) return {}
  const endInput = isRecord(node.endInput) ? node.endInput : {}
  const value = endInput.value
  if (isRecord(value) && typeof value.$ref === "string") return schemaFromStatePath(bodyEnv, value.$ref)
  return {}
}

function arrayElementSchema(env: Env, itemsMarker: unknown): JsonSchema {
  if (!isRecord(itemsMarker) || typeof itemsMarker.$ref !== "string") return {}
  const parsed = parseRef(itemsMarker.$ref)
  if (!parsed) return {}
  const binding = env.get(parsed.key)
  if (!binding) return {}
  const walked = parsed.rest.length === 0 ? binding.schema : walkSchema(binding.schema, parsed.rest).schema
  if (!walked) return {}
  const items = walked.items
  if (Array.isArray(items)) return { anyOf: items as JsonSchema[] }
  if (items && typeof items === "object" && !Array.isArray(items)) return items as JsonSchema
  return {}
}

function schemaFromRef(env: Env, marker: Record<string, unknown>): JsonSchema {
  const ref = String(marker.$ref)
  const parsed = parseRef(ref)
  if (!parsed) return {}
  const binding = env.get(parsed.key)
  if (!binding) return {}
  if (parsed.rest.length === 0) return binding.schema
  return walkSchema(binding.schema, parsed.rest).schema ?? {}
}

function loopMode(node: NodeLike): "while" | "for" | "forEach" {
  if (node.mode === "for" || node.mode === "forEach") return node.mode
  return "while"
}

function schemaFromStatePath(env: Env, path: string): JsonSchema {
  return schemaFromRef(env, { $ref: path })
}

function walkParallel(
  node: NodeLike,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
  capabilities: Map<string, CapabilityEntry>,
): Env {
  const outer = env
  if (node.as) {
    const accepts = isRecord(node.accepts) ? (node.accepts as JsonSchema) : { type: "object" }
    env = scopedIfEnv({ ...node, as: node.as, accepts } as NodeLike, env, issues)
  }
  const lines = node.paths ?? []
  const previews = lines.map((line) => new Set(collectAs(line)))
  const lineEnvs = lines.map((line, index) => {
    const siblings = new Set<string>()
    previews.forEach((keys, other) => {
      if (other !== index) for (const key of keys) siblings.add(key)
    })
    return walkNodes(line, cloneEnv(env), { ...ctx, siblings }, issues, capabilities)
  })
  const owner = new Map<string, number>()
  lineEnvs.forEach((lineEnv, index) => {
    for (const key of changedKeys(env, lineEnv)) {
      const previous = owner.get(key)
      if (previous !== undefined) {
        issues.push(
          issue(
            "ECP_COMMIT_CONFLICT",
            "error",
            `Parallel lines both write ${key}.`,
            `${node.path}/paths/${index}`,
            node.id,
          ),
        )
      } else {
        owner.set(key, index)
      }
    }
  })
  const next = cloneEnv(outer)
  for (const [key, index] of owner) {
    const binding = lineEnvs[index]?.get(key)
    if (binding) next.set(key, binding)
  }
  return next
}

function checkRef(
  value: Record<string, unknown>,
  target: JsonSchema | undefined,
  pointer: string,
  nodeId: string | undefined,
  env: Env,
  ctx: WalkContext,
  issues: ValidationIssue[],
): void {
  const ref = String(value.$ref)
  const parsed = parseRef(ref)
  if (!parsed) {
    issues.push(issue("ECP_REF_PATH_INVALID", "error", `Ref ${ref} is not a state path.`, `${pointer}/$ref`, nodeId))
    return
  }
  const binding = env.get(parsed.key)
  if (!binding) {
    const sibling = ctx.siblings.has(parsed.key)
    const message = sibling
      ? `${ref} is written by a parallel sibling, which this line cannot see.`
      : `${ref} is not produced before this step.`
    issues.push({
      ...issue("ECP_REF_UNRESOLVED", "error", message, `${pointer}/$ref`, nodeId),
      available: availablePaths(env),
      suggestions: closeMatches(parsed.key, [...env.keys()]).map((key) => `state.${key}`),
    })
    return
  }
  const optional = value.optional === true || Object.prototype.hasOwnProperty.call(value, "fallback")
  if (binding.certainty === "maybe" && !optional) {
    issues.push(
      issue(
        "ECP_REF_MAYBE_MISSING",
        "error",
        `${ref} might be missing. Add "optional": true and a "fallback".`,
        `${pointer}/$ref`,
        nodeId,
        [`add "optional": true and a "fallback"`],
      ),
    )
  }
  if (parsed.rest.length === 0) {
    if (target && !typesFit(binding.schema, target)) {
      issues.push({
        ...issue("ECP_TYPE_MISMATCH", "error", `${ref} does not fit the target schema.`, `${pointer}/$ref`, nodeId),
        expected: trim(target, 2048),
        actual: trim(binding.schema, 1024),
      })
    }
    const accessIssue = fileAccessBindingIssue(binding.schema, undefined, target, `${pointer}/$ref`, nodeId)
    if (accessIssue) issues.push(accessIssue)
    return
  }
  const walked = walkSchema(binding.schema, parsed.rest)
  if (walked.stopped) return
  if (walked.missing) {
    issues.push({
      ...issue("ECP_REF_PATH_INVALID", "error", `${ref} does not match the producer schema.`, `${pointer}/$ref`, nodeId),
      suggestions: (walked.suggestions ?? []).map((name) => `did you mean '${name}'?`),
    })
    return
  }
  if (target && !typesFit(walked.schema, target)) {
    issues.push({
      ...issue("ECP_TYPE_MISMATCH", "error", `${ref} does not fit the target schema.`, `${pointer}/$ref`, nodeId),
      expected: trim(target, 2048),
      actual: trim(walked.schema, 1024),
    })
  }
  const accessIssue = fileAccessBindingIssue(walked.schema, undefined, target, `${pointer}/$ref`, nodeId)
  if (accessIssue) issues.push(accessIssue)
}

function parseRef(ref: string): { key: string; rest: string[] } | undefined {
  if (!ref.startsWith("state.")) return undefined
  const segments = ref.slice("state.".length).split(".")
  const key = segments[0]
  if (!key) return undefined
  return { key, rest: segments.slice(1) }
}

function walkSchema(
  schema: JsonSchema | undefined,
  rest: string[],
): { schema?: JsonSchema; missing?: string; suggestions?: string[]; stopped?: boolean } {
  let current = schema
  for (const segment of rest) {
    if (!current) return { missing: segment }
    const properties = schemaProperties(current)
    const items = current.items
    const unknown = current.type === undefined && properties === undefined && items === undefined
    if (unknown) return { stopped: true, schema: current }
    if (/^\d+$/.test(segment)) {
      if (items && typeof items === "object" && !Array.isArray(items)) {
        current = items as JsonSchema
        continue
      }
      return { missing: segment, suggestions: [] }
    }
    if (properties?.[segment]) {
      current = properties[segment] as JsonSchema
      continue
    }
    const additional = current.additionalProperties
    if (additional && typeof additional === "object" && !Array.isArray(additional)) {
      current = additional as JsonSchema
      continue
    }
    return { missing: segment, suggestions: properties ? closeMatches(segment, Object.keys(properties)) : [] }
  }
  return { schema: current }
}

function typesFit(source: JsonSchema | undefined, target: JsonSchema): boolean {
  const targetTypes = typeSet(target)
  if (!targetTypes) return true
  const sourceTypes = typeSet(source)
  if (!sourceTypes) return true
  for (const from of sourceTypes) {
    for (const to of targetTypes) {
      if (from === to || (from === "integer" && to === "number")) return true
    }
  }
  return false
}

function typeSet(schema: JsonSchema | undefined): Set<string> | undefined {
  const type = schema?.type
  if (typeof type === "string") return new Set([type])
  if (Array.isArray(type) && type.every((item) => typeof item === "string")) return new Set(type)
  return undefined
}

function schemaForMode(mode: string, existing: JsonSchema | undefined, returns: JsonSchema): JsonSchema {
  if (mode === "append") return { type: "array", items: returns }
  if (mode === "merge") {
    return {
      type: "object",
      properties: { ...(schemaProperties(existing) ?? {}), ...(schemaProperties(returns) ?? {}) },
    }
  }
  return returns
}

function availablePaths(env: Env): string[] {
  const paths: string[] = []
  for (const [key, binding] of env) {
    pushPath(paths, `state.${key}`)
    collectProps(binding.schema, `state.${key}`, paths)
    if (paths.length >= AVAILABLE_CAP) break
  }
  return paths.slice(0, AVAILABLE_CAP)
}

function collectProps(schema: JsonSchema, prefix: string, paths: string[]): void {
  const properties = schemaProperties(schema)
  if (!properties) return
  for (const name of Object.keys(properties)) {
    if (paths.length >= AVAILABLE_CAP) return
    const next = `${prefix}.${name}`
    pushPath(paths, next)
    collectProps(properties[name] as JsonSchema, next, paths)
  }
}

function pushPath(paths: string[], path: string): void {
  if (paths.length < AVAILABLE_CAP) paths.push(path)
}

function changedKeys(before: Env, after: Env): string[] {
  const keys: string[] = []
  for (const [key, binding] of after) {
    if (before.get(key) !== binding) keys.push(key)
  }
  return keys
}

function collectAs(nodes: NodeLike[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.as) keys.push(node.as)
    for (const child of node.steps ?? []) keys.push(...collectAs([child]))
    for (const child of node.then ?? []) keys.push(...collectAs([child]))
    for (const child of node.else ?? []) keys.push(...collectAs([child]))
    for (const line of node.paths ?? []) keys.push(...collectAs(line))
  }
  return keys
}

function cloneEnv(env: Env): Env {
  return new Map(env)
}

function schemaProperties(schema: unknown): Record<string, JsonSchema> | undefined {
  if (!isRecord(schema) || !isRecord(schema.properties)) return undefined
  return schema.properties as Record<string, JsonSchema>
}

function visitValues(
  value: unknown,
  schema: JsonSchema | undefined,
  pointer: string,
  visit: (value: unknown, schema: JsonSchema | undefined, pointer: string) => void,
): void {
  visit(value, schema, pointer)
  if (Array.isArray(value)) {
    const items = schema?.items
    const itemSchema = items && typeof items === "object" && !Array.isArray(items) ? (items as JsonSchema) : undefined
    value.forEach((item, index) => visitValues(item, itemSchema, `${pointer}/${index}`, visit))
    return
  }
  if (!isRecord(value)) return
  if (isMarker(value)) {
    const script = value.$script
    const params = isRecord(script) ? script.params : undefined
    if (params !== undefined) visitValues(params, undefined, `${pointer}/$script/params`, visit)
    return
  }
  for (const [key, child] of Object.entries(value)) {
    const properties = schemaProperties(schema)
    const additional = schema?.additionalProperties
    const childSchema =
      properties?.[key] ??
      (additional && typeof additional === "object" && !Array.isArray(additional) ? (additional as JsonSchema) : undefined)
    visitValues(child, childSchema, `${pointer}/${escapePointer(key)}`, visit)
  }
}

function isMarker(value: Record<string, unknown>): boolean {
  return "$ref" in value || "$state" in value || "$script" in value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function escapePointer(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1")
}

function trim(value: unknown, max: number): unknown {
  const text = JSON.stringify(value)
  if (text === undefined || text.length <= max) return value
  return text.slice(0, max)
}

function issue(
  code: ValidationIssue["code"],
  severity: ValidationIssue["severity"],
  message: string,
  path: string,
  nodeId?: string,
  suggestions?: string[],
): ValidationIssue {
  return { code, severity, message, path, nodeId, suggestions }
}

interface NodeLike {
  type?: string
  id?: string
  path: string
  uses?: string
  input?: unknown
  accepts?: unknown
  returns?: unknown
  as?: string
  mode?: string
  steps?: NodeLike[]
  then?: NodeLike[]
  else?: NodeLike[]
  paths?: NodeLike[][]
  endInput?: unknown
  endAccepts?: unknown
  endReturns?: unknown
  endGathers?: boolean
  into?: string
  onError?: string
}

function asNodes(nodes: ExecutionManifest["steps"], prefix = "/steps"): NodeLike[] {
  return nodes.map((node, index) => asNode(node, `${prefix}/${index}`))
}

function asNode(node: ExecutionManifest["steps"][number], path: string): NodeLike {
  const record = node as unknown as Record<string, unknown>
  const type = typeof record.type === "string" ? record.type : "step"
  const base: NodeLike = {
    type,
    id: typeof record.id === "string" ? record.id : undefined,
    path,
    uses: typeof record.uses === "string" ? record.uses : undefined,
    input: record.input,
    accepts: record.accepts,
    returns: record.returns,
    as: typeof record.as === "string" ? record.as : undefined,
    mode: typeof record.mode === "string" ? record.mode : undefined,
  }
  if (type === "if") {
    base.then = Array.isArray(record.then) ? asNodes(record.then as ExecutionManifest["steps"], `${path}/then`) : []
    base.else = Array.isArray(record.else) ? asNodes(record.else as ExecutionManifest["steps"], `${path}/else`) : []
  }
  if (type === "loop" && Array.isArray(record.steps)) {
    base.steps = asNodes(record.steps as ExecutionManifest["steps"], `${path}/steps`)
    base.as = typeof record.as === "string" ? record.as : undefined
    base.into = typeof record.into === "string" ? record.into : undefined
    base.onError = typeof record.onError === "string" ? record.onError : undefined
    const end = isRecord(record.end) ? record.end : undefined
    base.endInput = end?.input
    base.endAccepts = end?.accepts
    base.endReturns = end?.returns
    base.endGathers = typeof end?.expression === "string" || end?.script !== undefined
    base.input = record.input
  }
  if (type === "parallel" && Array.isArray(record.paths)) {
    base.paths = record.paths.map((line, index) =>
      asNodes(line as ExecutionManifest["steps"], `${path}/paths/${index}`),
    )
  }
  if (type === "step") base.steps = undefined
  return base
}
