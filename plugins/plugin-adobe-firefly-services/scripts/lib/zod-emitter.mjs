/**
 * OpenAPI schema -> zod source expressions.
 *
 * Two modes share one family's components:
 * - `input` emits closed objects (`z.strictObject`) so unknown request keys fail validation.
 * - `output` emits open objects (`z.looseObject`) so extra response fields never fail a step.
 *
 * Composite object schemas (`allOf`, and `oneOf` / `anyOf` whose variants are all objects) are
 * flattened into one object. Every nested field then sits under `properties`, which is what
 * binding surfaces and `$ref` / `$script` markers walk. A field required by every variant stays
 * required; the API still validates the exact variant.
 */

import { createHash } from "node:crypto"

const DESCRIPTION_MAX = 300
const REF_OPEN = "\u0001"
const REF_CLOSE = "\u0002"

/**
 * Replace component reference placeholders. `qualifier` is `""` inside the schemas module
 * and `"schemas."` in modules that import it as a namespace.
 * @param {string} expr
 * @param {string} qualifier
 */
export function resolveRefs(expr, qualifier) {
  return expr.replace(/\u0001([A-Za-z0-9_]+)\u0002/g, (_m, ident) => `${qualifier}${ident}`)
}

/**
 * True when an expression references a component.
 * @param {string} expr
 */
export function hasRefs(expr) {
  return expr.includes(REF_OPEN)
}

/**
 * @typedef {Record<string, any>} OpenApiSchema
 */

/**
 * @typedef {object} FlatObject
 * @property {Map<string, OpenApiSchema[]>} properties Field -> candidate schemas (one per variant).
 * @property {Set<string>} required Fields required in the flattened shape.
 * @property {boolean} free Explicit `additionalProperties: true` somewhere in the composition.
 * @property {OpenApiSchema | undefined} catchall Typed `additionalProperties`.
 * @property {Set<string>} inlined Component names inlined into this shape.
 */

/**
 * @param {string} name
 */
export function toSafeIdent(name) {
  let s = name.replace(/[^a-zA-Z0-9_]/g, "_")
  if (/^[0-9]/.test(s)) s = `_${s}`
  if (!s) s = "Schema"
  return s
}

/**
 * @param {string} s
 */
export function toKebab(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
}

/**
 * @param {string} s
 */
export function toCamel(s) {
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const camel = parts
    .map((part, i) => (i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("")
  return toSafeIdent(camel)
}

/**
 * @param {string} ref
 */
export function refName(ref) {
  const parts = ref.split("/")
  return parts[parts.length - 1] || "Ref"
}

/**
 * Plain-text description for zod `.describe()`: tags stripped, whitespace collapsed, capped.
 * @param {unknown} text
 * @param {number} [max]
 */
export function cleanDescription(text, max = DESCRIPTION_MAX) {
  if (typeof text !== "string") return ""
  const plain = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max - 3)
  const sentence = cut.lastIndexOf(". ")
  return sentence > max / 2 ? cut.slice(0, sentence + 1) : `${cut.trimEnd()}...`
}

/**
 * @param {string} name
 */
export function objectKey(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

/**
 * Schema -> zod converter for one family and one mode.
 */
export class ZodEmitter {
  /** @type {Map<string, OpenApiSchema>} */
  #components
  /** @type {Map<string, string>} */
  #bySafe = new Map()
  /** @type {"input" | "output"} */
  #mode
  /** @type {string} */
  #prefix
  /** @type {Map<string, string>} ident -> expression */
  #emitted = new Map()
  /** @type {Set<string>} */
  #emitting = new Set()
  /** @type {Set<string>} Component names currently being inlined by a flatten. */
  #inlining = new Set()
  /** @type {Map<string, string>} Synthetic union ident -> label. */
  #labels = new Map()
  /** @type {string[]} */
  #errors = []

  /**
   * @param {Map<string, OpenApiSchema>} components Component name -> schema.
   * @param {{ mode: "input" | "output" }} options
   */
  constructor(components, options) {
    this.#components = components
    this.#mode = options.mode
    this.#prefix = options.mode === "input" ? "In_" : "Out_"
    for (const name of components.keys()) this.#bySafe.set(toSafeIdent(name), name)
  }

  /** Schema problems found while emitting. */
  get errors() {
    return this.#errors
  }

  /**
   * Every component referenced so far, sorted by ident. Expressions still hold reference
   * placeholders; pass them through {@link resolveRefs}.
   * @returns {[string, string, string][]} ident, doc label, expression
   */
  components() {
    return [...this.#emitted.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([ident, expr]) => [ident, this.#originalByIdent(ident), expr])
  }

  /**
   * @param {string} ident
   */
  #originalByIdent(ident) {
    const label = this.#labels.get(ident)
    if (label) return label
    const safe = ident.slice(this.#prefix.length)
    return `OpenAPI component \`${this.#bySafe.get(safe) ?? safe}\``
  }

  /**
   * @param {string} name
   */
  #resolveName(name) {
    if (this.#components.has(name)) return name
    return this.#bySafe.get(toSafeIdent(name)) ?? name
  }

  /**
   * Ident for a named component, emitting it on first use.
   * @param {string} name
   */
  component(name) {
    const original = this.#resolveName(name)
    const ident = `${this.#prefix}${toSafeIdent(original)}`
    if (this.#emitted.has(ident) || this.#emitting.has(ident)) return ident
    const schema = this.#components.get(original)
    if (!schema) {
      this.#errors.push(`Missing component schema: ${original}`)
      this.#emitted.set(ident, "z.looseObject({})")
      return ident
    }
    this.#emitting.add(ident)
    const wasInlining = this.#inlining.has(original)
    this.#inlining.add(original)
    const expr = this.schemaToZod(schema, original)
    if (!wasInlining) this.#inlining.delete(original)
    this.#emitting.delete(ident)
    const description = cleanDescription(schema.description)
    const lazy = `z.lazy(() => ${expr})`
    this.#emitted.set(ident, description ? `${lazy}.describe(${JSON.stringify(description)})` : lazy)
    return ident
  }

  /**
   * A union of named object components becomes one shared, flattened component. Recursive
   * structures (layer trees) then reference it instead of inlining every variant again.
   * Returns undefined when a variant is not object-shaped.
   * @param {OpenApiSchema[]} variants All `$ref`s.
   * @param {string} context
   */
  #unionComponent(variants, context) {
    const names = [...new Set(variants.map((v) => this.#resolveName(refName(v.$ref))))].sort()
    const ident = `${this.#prefix}OneOf_${names.map(toSafeIdent).join("_or_")}`
    const short =
      ident.length > 80
        ? `${this.#prefix}OneOf_${toSafeIdent(names[0])}_and_${names.length - 1}_more_${createHash("sha256").update(names.join("|")).digest("hex").slice(0, 6)}`
        : ident
    if (this.#emitted.has(short) || this.#emitting.has(short)) return short
    const saved = this.#inlining
    this.#inlining = new Set()
    const flat = this.flattenObject({ oneOf: variants })
    if (!flat) {
      this.#inlining = saved
      return undefined
    }
    this.#labels.set(short, `Union of OpenAPI components ${names.map((n) => `\`${n}\``).join(", ")}`)
    this.#emitting.add(short)
    const expr = this.flatObjectZod(flat, context)
    this.#emitting.delete(short)
    this.#inlining = saved
    this.#emitted.set(short, `z.lazy(() => ${expr})`)
    return short
  }

  /**
   * Flatten an object-shaped schema (`$ref`, `allOf`, object-only `oneOf`/`anyOf`).
   * Returns undefined when the schema is not purely object-shaped.
   * @param {OpenApiSchema | undefined} schema
   * @param {Set<string>} [seen]
   * @returns {FlatObject | undefined}
   */
  flattenObject(schema, seen = new Set()) {
    if (!schema || typeof schema !== "object") return undefined
    if (typeof schema.$ref === "string") {
      const name = this.#resolveName(refName(schema.$ref))
      if (seen.has(name) || this.#inlining.has(name)) return undefined
      const next = new Set(seen)
      next.add(name)
      const sub = this.flattenObject(this.#components.get(name), next)
      if (sub) sub.inlined.add(name)
      return sub
    }
    if (schema.type !== undefined && schema.type !== "object") return undefined
    if (schema.enum !== undefined) return undefined

    const variants = schema.oneOf ?? schema.anyOf
    const hasComposite = Boolean(schema.allOf) || Array.isArray(variants)
    if (!hasComposite && schema.type !== "object" && !schema.properties && schema.additionalProperties === undefined) {
      return undefined
    }

    const own = this.#ownObject(schema)
    /** @type {FlatObject} */
    const flat = {
      properties: new Map(),
      required: new Set(own.required),
      free: own.free,
      catchall: own.catchall,
      inlined: new Set(),
    }
    for (const [key, value] of own.properties) flat.properties.set(key, [...value])

    /**
     * @param {FlatObject} sub
     */
    const absorb = (sub) => {
      for (const [key, value] of sub.properties) addCandidates(flat.properties, key, value)
      for (const name of sub.inlined) flat.inlined.add(name)
      if (sub.free) flat.free = true
      if (sub.catchall && !flat.catchall) flat.catchall = sub.catchall
    }

    if (schema.allOf) {
      const parts = Array.isArray(schema.allOf) ? schema.allOf : [schema.allOf]
      for (const part of parts) {
        const sub = this.flattenObject(part, seen)
        if (!sub) return undefined
        absorb(sub)
        for (const key of sub.required) flat.required.add(key)
      }
    }

    if (Array.isArray(variants) && variants.length > 0) {
      /** @type {FlatObject[]} */
      const subs = []
      for (const variant of variants) {
        const sub = this.flattenObject(variant, seen)
        if (!sub) return undefined
        subs.push(sub)
      }
      for (const sub of subs) absorb(sub)
      for (const key of subs[0].required) {
        if (subs.every((sub) => sub.required.has(key))) flat.required.add(key)
      }
    }

    for (const key of [...flat.required]) {
      if (!flat.properties.has(key)) flat.required.delete(key)
    }
    return flat
  }

  /**
   * Fields declared directly on a schema (not through composition).
   * @param {OpenApiSchema} schema
   */
  #ownObject(schema) {
    /** @type {Map<string, OpenApiSchema[]>} */
    const properties = new Map()
    const props = schema.properties && typeof schema.properties === "object" ? schema.properties : {}
    for (const [key, value] of Object.entries(props)) properties.set(key, [value])
    const required = Array.isArray(schema.required) ? schema.required.filter((k) => typeof k === "string") : []
    const ap = schema.additionalProperties
    return {
      properties,
      required,
      catchall: ap && typeof ap === "object" ? ap : undefined,
      free: ap === true,
    }
  }

  /**
   * One object field: its zod expression (not yet optional) and description.
   * @param {OpenApiSchema[]} candidates
   * @param {string} context
   * @param {unknown} [fallbackDescription]
   */
  fieldZod(candidates, context, fallbackDescription) {
    const schema = mergeCandidates(candidates)
    const expr = this.schemaToZod(schema, context)
    const description = cleanDescription(typeof schema.description === "string" ? schema.description : fallbackDescription)
    return { expr, description }
  }

  /**
   * Emit a flattened object.
   * @param {FlatObject} flat
   * @param {string} context
   */
  flatObjectZod(flat, context) {
    const added = [...flat.inlined].filter((name) => !this.#inlining.has(name))
    for (const name of added) this.#inlining.add(name)
    const entries = []
    for (const [key, candidates] of flat.properties) {
      const field = this.fieldZod(candidates, `${context}.${key}`)
      let expr = field.expr
      if (!flat.required.has(key)) expr = `${expr}.optional()`
      if (field.description) expr = `${expr}.describe(${JSON.stringify(field.description)})`
      entries.push(`  ${objectKey(key)}: ${indentContinuation(expr)}`)
    }
    for (const name of added) this.#inlining.delete(name)
    const body = entries.length ? `{\n${entries.join(",\n")}\n}` : "{}"
    if (flat.catchall) {
      const value = this.schemaToZod(flat.catchall, `${context}.additionalProperties`)
      if (entries.length === 0) return `z.record(z.string(), ${value})`
      return `z.object(${body}).catchall(${value})`
    }
    if (flat.free || entries.length === 0) {
      if (this.#mode === "input" && entries.length > 0) {
        this.#errors.push(
          `Free-form object (additionalProperties:true) at ${context}; add an overlay with a typed schema`,
        )
      }
      return `z.looseObject(${body})`
    }
    return this.#mode === "input" ? `z.strictObject(${body})` : `z.looseObject(${body})`
  }

  /**
   * @param {OpenApiSchema | undefined} schema
   * @param {string} context
   * @returns {string}
   */
  schemaToZod(schema, context) {
    if (!schema || typeof schema !== "object") {
      this.#errors.push(`Empty schema at ${context}`)
      return "z.looseObject({})"
    }

    if (typeof schema.$ref === "string") {
      const name = refName(schema.$ref)
      const ident = this.component(name)
      return this.#emitting.has(ident) ? recursiveStub(name) : `${REF_OPEN}${ident}${REF_CLOSE}`
    }

    const variants = schema.oneOf ?? schema.anyOf
    if (!schema.allOf && Array.isArray(variants) && variants.length > 1 && variants.every((v) => typeof v?.$ref === "string")) {
      const ident = this.#unionComponent(variants, context)
      if (ident && this.#emitting.has(ident)) return this.#nullable(schema, recursiveStub(this.#labels.get(ident) ?? ident))
      if (ident) return this.#nullable(schema, `${REF_OPEN}${ident}${REF_CLOSE}`)
    }
    if (schema.allOf || (Array.isArray(variants) && variants.length > 0)) {
      const flat = this.flattenObject(schema)
      if (flat) return this.#nullable(schema, this.flatObjectZod(flat, context))
      if (schema.allOf) {
        const parts = (Array.isArray(schema.allOf) ? schema.allOf : [schema.allOf]).map((s, i) =>
          this.schemaToZod(s, `${context}.allOf[${i}]`),
        )
        const expr = parts.reduce((acc, part) => `z.intersection(${acc}, ${part})`)
        return this.#nullable(schema, expr)
      }
      const parts = unique(variants.map((s, i) => this.schemaToZod(s, `${context}.variant[${i}]`)))
      return this.#nullable(schema, parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`)
    }

    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      const literals = schema.enum.map((v) => {
        if (typeof v === "string") return JSON.stringify(v)
        if (typeof v === "number" || typeof v === "boolean") return String(v)
        this.#errors.push(`Unsupported enum value at ${context}: ${JSON.stringify(v)}`)
        return JSON.stringify(String(v))
      })
      if (literals.every((l) => l.startsWith('"'))) {
        return this.#nullable(schema, `z.enum([${unique(literals).join(", ")}])`)
      }
      const parts = unique(literals).map((l) => `z.literal(${l})`)
      return this.#nullable(schema, parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`)
    }

    const type = schema.type
    if (Array.isArray(type)) {
      const nonNull = type.filter((t) => t !== "null")
      const parts = nonNull.map((t) => this.schemaToZod({ ...schema, type: t }, `${context}|${t}`))
      let expr = parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`
      if (type.includes("null") || schema.nullable) expr = `${expr}.nullable()`
      return expr
    }

    switch (type) {
      case "null":
        return "z.null()"
      case "string":
        return this.#nullable(schema, stringZod(schema))
      case "integer":
        return this.#nullable(schema, numberZod(schema, true))
      case "number":
        return this.#nullable(schema, numberZod(schema, false))
      case "boolean":
        return this.#nullable(schema, "z.boolean()")
      case "array": {
        let expr = `z.array(${this.schemaToZod(schema.items ?? { type: "string" }, `${context}.items`)})`
        if (schema.minItems !== undefined) expr += `.min(${schema.minItems})`
        if (schema.maxItems !== undefined) expr += `.max(${schema.maxItems})`
        return this.#nullable(schema, expr)
      }
      case "object":
      case undefined: {
        if (type === undefined && !schema.properties && schema.additionalProperties === undefined) {
          this.#errors.push(`Untyped schema at ${context}`)
          return "z.looseObject({})"
        }
        const flat = this.flattenObject(schema)
        if (!flat) return "z.looseObject({})"
        return this.#nullable(schema, this.flatObjectZod(flat, context))
      }
      default:
        this.#errors.push(`Unsupported type '${type}' at ${context}`)
        return "z.looseObject({})"
    }
  }

  /**
   * @param {OpenApiSchema} schema
   * @param {string} expr
   */
  #nullable(schema, expr) {
    return schema.nullable ? `${expr}.nullable()` : expr
  }
}

/**
 * @param {OpenApiSchema} schema
 */
function stringZod(schema) {
  let e = "z.string()"
  if (typeof schema.minLength === "number" && schema.minLength > 0) e += `.min(${schema.minLength})`
  if (typeof schema.maxLength === "number") e += `.max(${schema.maxLength})`
  return e
}

/**
 * @param {OpenApiSchema} schema
 * @param {boolean} int
 */
function numberZod(schema, int) {
  let e = int ? "z.number().int()" : "z.number()"
  if (typeof schema.minimum === "number") e += `.min(${schema.minimum})`
  if (typeof schema.maximum === "number") e += `.max(${schema.maximum})`
  return e
}

/**
 * @param {Map<string, OpenApiSchema[]>} map
 * @param {string} key
 * @param {OpenApiSchema[]} candidates
 */
function addCandidates(map, key, candidates) {
  const list = map.get(key) ?? []
  for (const candidate of candidates) {
    const text = JSON.stringify(candidate)
    if (!list.some((existing) => JSON.stringify(existing) === text)) list.push(candidate)
  }
  map.set(key, list)
}

/**
 * One schema for a field that several variants declare.
 * @param {OpenApiSchema[]} candidates
 * @returns {OpenApiSchema}
 */
function mergeCandidates(candidates) {
  if (candidates.length === 1) return candidates[0]
  const enums = candidates.every((c) => Array.isArray(c.enum) && !c.$ref)
  if (enums) {
    const values = [...new Set(candidates.flatMap((c) => c.enum))]
    const description = candidates.find((c) => typeof c.description === "string")?.description
    return description ? { enum: values, description } : { enum: values }
  }
  return { anyOf: candidates }
}

/**
 * Open object standing in for a recursive reference. JSON Schema exported from a recursive
 * zod schema needs `$defs`, which cannot be embedded in a host execution schema, so recursion
 * stops after one typed level.
 * @param {string} name Component name or union label.
 */
function recursiveStub(name) {
  const label = name.replace(/^Union of OpenAPI components /, "").replace(/`/g, "")
  return `z.looseObject({}).describe(${JSON.stringify(`Nested ${label} (recursive; checked by the API, not here).`)})`
}

/**
 * Indent every line after the first by two spaces (nested object bodies).
 * @param {string} expr
 */
export function indentContinuation(expr) {
  return expr.split("\n").join("\n  ")
}

/**
 * @param {string[]} values
 */
function unique(values) {
  return [...new Set(values)]
}
