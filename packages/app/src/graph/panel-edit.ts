import type {
  ExecutionManifest,
  IfNode,
  JsonValue,
  LoopNode,
  Node,
  ParallelNode,
  ScriptDescriptor,
  ValueMarker,
} from "@executioncontrolprotocol/protocol"
import { STATE_KEY_PATTERN, cloneManifest, freeStateKeyForId, locateNode } from "./manifest-walk.js"
import {
  STRUCTURE_EDIT_STRUCTURE_NOT_FOUND,
  setLoopMode,
  type LoopMode,
  type StructureEditResult,
} from "./structure-edit.js"

export { setLoopMode, type LoopMode }

/** Reason when a binding edit names no input key. @category App */
export const PANEL_EDIT_INPUT_KEY = "An input needs a name"

/** Reason when a `$ref` path is not a `state.<key>[.<path>]` reference. @category App */
export const PANEL_EDIT_REF_PATH = "A reference looks like state.name or state.name.field"

/** Reason when a schema text is not a JSON object. @category App */
export const PANEL_EDIT_SCHEMA_OBJECT = "A schema must be a JSON object"

/** Reason when a state key (`as`, `into`) is not a valid name. @category App */
export const PANEL_EDIT_STATE_KEY = "A name starts with a letter or underscore and holds letters, digits and underscores"

/** Reason when a `parallel` path would hold no nodes. @category App */
export const PANEL_EDIT_PATH_EMPTY = "A path needs at least one node"

/** Reason when a condition's text can't be edited because the script lives in a file. @category App */
export const PANEL_EDIT_SCRIPT_FILE = "The script is in a file; edit the file"

/** Reason when the condition text doesn't match the form being edited. @category App */
export const PANEL_EDIT_CONDITION_FORM = "Switch the condition to that form first"

/** Default condition expression for an `if`. @category App */
export const IF_DEFAULT_EXPRESSION = "true"

/**
 * How an input is supplied in the panel: nothing (the key is removed), a literal, or a `$ref` branch.
 * @category App
 */
export type InputBindingEdit =
  | { kind: "unset" }
  | { kind: "literal"; value: JsonValue }
  | { kind: "ref"; path: string }

/**
 * Form of a condition (`if`) or gather (`end`): none (`end` only), an `expression`, or a `script`.
 * @category App
 */
export type ConditionForm = "none" | "expression" | "script"

/**
 * Outcome of parsing schema text from the panel.
 * @category App
 */
export type SchemaTextResult =
  | { ok: true; schema: Record<string, unknown> | undefined }
  | { ok: false; reason: string }

type StructureType = "if" | "parallel" | "loop"

/**
 * The fields a condition (`if`) or a gather (`end`) keeps its text in.
 * @category App
 */
export interface ConditionHolder {
  /** One-line or multi-line JavaScript expression over `input`. */
  expression?: string
  /** Script body that `return`s; inline `source` or a `path`. */
  script?: ScriptDescriptor
}

interface InputHolder {
  input?: Record<string, JsonValue | ValueMarker>
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Clone the manifest, find a structure of one of `types` (in `steps` or `detached`), and run `mutate` on it. */
function editStructure<N extends Node>(
  manifest: ExecutionManifest,
  id: string,
  types: readonly StructureType[],
  mutate: (node: N, draft: ExecutionManifest) => string | undefined,
): StructureEditResult {
  const next = cloneManifest(manifest)
  const hit = locateNode(next, id)
  if (!hit || !(types as readonly string[]).includes(hit.node.type ?? "step")) {
    return { ok: false, reason: STRUCTURE_EDIT_STRUCTURE_NOT_FOUND }
  }
  const reason = mutate(hit.node as N, next)
  if (reason !== undefined) return { ok: false, reason }
  return { ok: true, manifest: next }
}

function setOptionalText(target: { label?: string }, label: string | undefined): void {
  if (label === undefined || label.trim() === "") delete target.label
  else target.label = label
}

function setOptionalSchema(
  target: { accepts?: Record<string, unknown> } | { returns?: Record<string, unknown> },
  key: "accepts" | "returns",
  schema: Record<string, unknown> | undefined,
): string | undefined {
  if (schema === undefined) {
    delete (target as Record<string, unknown>)[key]
    return undefined
  }
  if (!isPlainObject(schema)) return PANEL_EDIT_SCHEMA_OBJECT
  ;(target as Record<string, unknown>)[key] = schema
  return undefined
}

/**
 * Normalise a reference path to `state.<key>[.<path>]`; `undefined` when it isn't a valid reference.
 * @category App
 */
export function normalizeRefPath(path: string): string | undefined {
  const trimmed = path.trim()
  const full = trimmed.startsWith("state.") ? trimmed : `state.${trimmed}`
  return /^state\.[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_-]+)*$/.test(full) ? full : undefined
}

/**
 * Literal input from panel text: valid JSON is parsed (`3`, `true`, `["a"]`), anything else is a string.
 * @category App
 */
export function parseLiteralInput(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue
  } catch {
    return text
  }
}

/**
 * Schema from panel text: empty text removes the schema, otherwise the text must be a JSON object.
 * @category App
 */
export function parseSchemaText(text: string): SchemaTextResult {
  if (text.trim() === "") return { ok: true, schema: undefined }
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isPlainObject(parsed)) return { ok: false, reason: PANEL_EDIT_SCHEMA_OBJECT }
    return { ok: true, schema: parsed }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : PANEL_EDIT_SCHEMA_OBJECT }
  }
}

/** Write one input binding on `holder.input`. Returns a refusal reason, or `undefined`. */
function applyBinding(holder: InputHolder, key: string, binding: InputBindingEdit): string | undefined {
  if (key.trim() === "" || key.startsWith("$")) return PANEL_EDIT_INPUT_KEY
  if (binding.kind === "unset") {
    if (holder.input) delete holder.input[key]
    return undefined
  }
  const input = holder.input ?? {}
  if (binding.kind === "ref") {
    const path = normalizeRefPath(binding.path)
    if (!path) return PANEL_EDIT_REF_PATH
    input[key] = { $ref: path }
  } else {
    input[key] = binding.value
  }
  holder.input = input
  return undefined
}

/** Valid `as` / `into` text, `undefined` for empty (remove), or a refusal reason. */
function checkStateKey(value: string | undefined): { key: string | undefined } | { reason: string } {
  if (value === undefined || value.trim() === "") return { key: undefined }
  return STATE_KEY_PATTERN.test(value) ? { key: value } : { reason: PANEL_EDIT_STATE_KEY }
}

function setScopedAs(node: IfNode | ParallelNode, value: string | undefined): string | undefined {
  const checked = checkStateKey(value)
  if ("reason" in checked) return checked.reason
  if (checked.key === undefined) {
    delete node.as
    return undefined
  }
  node.as = checked.key
  // `as` requires `input`; an empty object keeps the node valid until the user binds an input.
  node.input ??= {}
  return undefined
}

/**
 * Give an `if` or `parallel` an `as` when it has none (a free name derived from its id) and make sure `input` exists,
 * so a node inside can bind its input. Returns the `as`. Mutates `node`.
 * @category App
 */
export function ensureStructureAs(draft: ExecutionManifest, node: IfNode | ParallelNode): string {
  if (node.as) {
    node.input ??= {}
    return node.as
  }
  node.as = freeStateKeyForId(draft, node.id)
  node.input ??= {}
  return node.as
}

function conditionFormOf(holder: ConditionHolder): ConditionForm {
  if (holder.script !== undefined) return "script"
  if (holder.expression !== undefined) return "expression"
  return "none"
}

function expressionAsScript(expression: string): ScriptDescriptor {
  return { lang: "js", source: `return ${expression.trim()}` }
}

/** The expression a script reduces to when it is a single `return <expression>` statement, else `undefined`. */
function scriptAsExpression(script: ScriptDescriptor): string | undefined {
  const source = script.source?.trim()
  if (!source) return undefined
  const match = /^return\s+([\s\S]+?);?$/.exec(source)
  if (!match) return undefined
  const body = match[1]!.trim()
  return body.includes(";") ? undefined : body
}

function convertCondition(holder: ConditionHolder, form: ConditionForm, fallbackExpression: string): void {
  if (form === "none") {
    delete holder.expression
    delete holder.script
    return
  }
  if (form === "script") {
    holder.script = holder.script ?? expressionAsScript(holder.expression ?? fallbackExpression)
    delete holder.expression
    return
  }
  holder.expression = holder.expression ?? (holder.script ? scriptAsExpression(holder.script) : undefined) ?? fallbackExpression
  delete holder.script
}

function setConditionText(holder: ConditionHolder, text: string): string | undefined {
  const form = conditionFormOf(holder)
  if (form === "script") {
    if (holder.script?.path !== undefined) return PANEL_EDIT_SCRIPT_FILE
    holder.script = { ...holder.script, lang: "js", source: text }
    return undefined
  }
  if (form === "expression") {
    holder.expression = text
    return undefined
  }
  return PANEL_EDIT_CONDITION_FORM
}

/**
 * Set or clear the `label` of an `if`, `parallel` or `loop`.
 * @category App
 */
export function setStructureLabel(manifest: ExecutionManifest, structureId: string, label: string | undefined): StructureEditResult {
  return editStructure<IfNode | ParallelNode | LoopNode>(manifest, structureId, ["if", "parallel", "loop"], (node) => {
    setOptionalText(node, label)
    return undefined
  })
}

/**
 * Set or clear an `if`'s `label`.
 * @category App
 */
export function setIfLabel(manifest: ExecutionManifest, ifId: string, label: string | undefined): StructureEditResult {
  return editStructure<IfNode>(manifest, ifId, ["if"], (node) => {
    setOptionalText(node, label)
    return undefined
  })
}

/**
 * Set or clear an `if`'s `accepts` schema (the types of its input ports).
 * @category App
 */
export function setIfAccepts(
  manifest: ExecutionManifest,
  ifId: string,
  accepts: Record<string, unknown> | undefined,
): StructureEditResult {
  return editStructure<IfNode>(manifest, ifId, ["if"], (node) => setOptionalSchema(node, "accepts", accepts))
}

/**
 * Switch an `if` condition between an `expression` and a `script`. The text carries over: an expression becomes
 * `return <expression>`, and a script that is one `return` statement becomes its expression.
 * @category App
 */
export function setIfConditionForm(
  manifest: ExecutionManifest,
  ifId: string,
  form: "expression" | "script",
): StructureEditResult {
  return editStructure<IfNode>(manifest, ifId, ["if"], (node) => {
    convertCondition(node, form, IF_DEFAULT_EXPRESSION)
    return undefined
  })
}

/**
 * Set the text of an `if` condition in its current form: the `expression`, or the inline `script` source.
 * @category App
 */
export function setIfConditionText(manifest: ExecutionManifest, ifId: string, text: string): StructureEditResult {
  return editStructure<IfNode>(manifest, ifId, ["if"], (node) => setConditionText(node, text))
}

/**
 * Set or clear an `if`'s `as` (the scoped alias of its input). Setting it adds an empty `input` when there is none,
 * because `as` requires `input`.
 * @category App
 */
export function setIfAs(manifest: ExecutionManifest, ifId: string, as: string | undefined): StructureEditResult {
  return editStructure<IfNode>(manifest, ifId, ["if"], (node) => setScopedAs(node, as))
}

/**
 * Bind, set or clear one of an `if`'s inputs.
 * @category App
 */
export function setIfInputBinding(
  manifest: ExecutionManifest,
  ifId: string,
  key: string,
  binding: InputBindingEdit,
): StructureEditResult {
  return editStructure<IfNode>(manifest, ifId, ["if"], (node) => applyBinding(node as InputHolder, key, binding))
}

/**
 * Set or clear a `parallel`'s `label`.
 * @category App
 */
export function setParallelLabel(manifest: ExecutionManifest, parallelId: string, label: string | undefined): StructureEditResult {
  return editStructure<ParallelNode>(manifest, parallelId, ["parallel"], (node) => {
    setOptionalText(node, label)
    return undefined
  })
}

/**
 * Set or clear a `parallel`'s `accepts` schema.
 * @category App
 */
export function setParallelAccepts(
  manifest: ExecutionManifest,
  parallelId: string,
  accepts: Record<string, unknown> | undefined,
): StructureEditResult {
  return editStructure<ParallelNode>(manifest, parallelId, ["parallel"], (node) => setOptionalSchema(node, "accepts", accepts))
}

/**
 * Set or clear a `parallel`'s `as`; setting it adds an empty `input` when there is none.
 * @category App
 */
export function setParallelAs(manifest: ExecutionManifest, parallelId: string, as: string | undefined): StructureEditResult {
  return editStructure<ParallelNode>(manifest, parallelId, ["parallel"], (node) => setScopedAs(node, as))
}

/**
 * Bind, set or clear one of a `parallel`'s inputs.
 * @category App
 */
export function setParallelInputBinding(
  manifest: ExecutionManifest,
  parallelId: string,
  key: string,
  binding: InputBindingEdit,
): StructureEditResult {
  return editStructure<ParallelNode>(manifest, parallelId, ["parallel"], (node) => applyBinding(node as InputHolder, key, binding))
}

/**
 * Set or clear a `parallel`'s `maxConcurrency` (a whole number of 1 or more).
 * @category App
 */
export function setParallelMaxConcurrency(
  manifest: ExecutionManifest,
  parallelId: string,
  maxConcurrency: number | undefined,
): StructureEditResult {
  return editStructure<ParallelNode>(manifest, parallelId, ["parallel"], (node) => {
    if (maxConcurrency === undefined) {
      delete node.maxConcurrency
      return undefined
    }
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) return "maxConcurrency is a whole number of 1 or more"
    node.maxConcurrency = maxConcurrency
    return undefined
  })
}

/**
 * Append a path holding `nodes` to a `parallel`. A path needs at least one node.
 * @category App
 */
export function addParallelPath(manifest: ExecutionManifest, parallelId: string, nodes: readonly Node[]): StructureEditResult {
  return editStructure<ParallelNode>(manifest, parallelId, ["parallel"], (node) => {
    if (nodes.length === 0) return PANEL_EDIT_PATH_EMPTY
    node.paths.push(structuredClone([...nodes]))
    return undefined
  })
}

/**
 * Append an empty path to a `parallel` (saveable; validation flags it until a node is added).
 * @category App
 */
export function appendEmptyParallelPath(manifest: ExecutionManifest, parallelId: string): StructureEditResult {
  return editStructure<ParallelNode>(manifest, parallelId, ["parallel"], (node) => {
    node.paths.push([])
    return undefined
  })
}

/**
 * Bind, set or clear a loop's driver input: `items` for `forEach`, `count` for `for`.
 * @category App
 */
export function setLoopDriver(manifest: ExecutionManifest, loopId: string, binding: InputBindingEdit): StructureEditResult {
  return editStructure<LoopNode>(manifest, loopId, ["loop"], (loop) => {
    const mode = loop.mode
    const reason = applyBinding(loop as InputHolder, mode === "forEach" ? "items" : "count", binding)
    if (reason !== undefined) return reason
    // `for` and `forEach` loops require an `input` object, so an unbound driver leaves `input: {}`
    // (validation reports the missing driver; the draft still stores).
    loop.input ??= {}
    return undefined
  })
}

/**
 * Set or clear a loop's `label`.
 * @category App
 */
export function setLoopLabel(manifest: ExecutionManifest, loopId: string, label: string | undefined): StructureEditResult {
  return editStructure<LoopNode>(manifest, loopId, ["loop"], (loop) => {
    setOptionalText(loop, label)
    return undefined
  })
}

/**
 * Form of an `if` condition as written in the manifest.
 * @category App
 */
export function conditionForm(holder: ConditionHolder): ConditionForm {
  return conditionFormOf(holder)
}
