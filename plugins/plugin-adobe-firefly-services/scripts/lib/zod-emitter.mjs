/**
 * OpenAPI → Zod expression helpers (no z.unknown / z.any / untyped z.record).
 */
import { createHash } from "node:crypto"

/**
 * @typedef {object} OpenApiSchema
 * @property {string} [type]
 * @property {string[]} [enum]
 * @property {OpenApiSchema} [items]
 * @property {Record<string, OpenApiSchema>} [properties]
 * @property {string[]} [required]
 * @property {OpenApiSchema[]|OpenApiSchema} [allOf]
 * @property {OpenApiSchema[]} [oneOf]
 * @property {OpenApiSchema[]} [anyOf]
 * @property {boolean|OpenApiSchema} [additionalProperties]
 * @property {boolean} [nullable]
 * @property {string} [$ref]
 * @property {string} [format]
 * @property {number} [minimum]
 * @property {number} [maximum]
 * @property {number} [minLength]
 * @property {number} [maxLength]
 * @property {string} [description]
 * @property {*} [default]
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
 * @param {string} ref
 */
export function refName(ref) {
  const parts = ref.split("/")
  // Keep OpenAPI component name as-is (may contain dots); ZodEmitter resolves.
  return parts[parts.length - 1] || "Ref"
}

/**
 * Schema→Zod converter with named component registry.
 *
 * Every named component is emitted as `z.lazy(() => …)` with a `z.ZodTypeAny`
 * annotation so cyclic OpenAPI graphs type-check regardless of declaration order.
 */
export class ZodEmitter {
  /** @type {Set<string>} */
  #emitting = new Set()
  /** @type {string[]} */
  #errors = []
  /** @type {Map<string, OpenApiSchema>} */
  #componentSchemas
  /** @type {Map<string, string>} safeIdent → original component name */
  #bySafe = new Map()

  /**
   * @param {Map<string, OpenApiSchema>} componentSchemas ref key → schema
   */
  constructor(componentSchemas) {
    this.#componentSchemas = componentSchemas
    for (const name of componentSchemas.keys()) {
      this.#bySafe.set(toSafeIdent(name), name)
    }
  }

  get errors() {
    return this.#errors
  }

  /**
   * Resolve OpenAPI component name from a $ref last segment or safe ident.
   * @param {string} name
   */
  #resolveName(name) {
    if (this.#componentSchemas.has(name)) return name
    const fromSafe = this.#bySafe.get(toSafeIdent(name))
    if (fromSafe) return fromSafe
    const fromExactSafe = this.#bySafe.get(name)
    if (fromExactSafe) return fromExactSafe
    return name
  }

  /**
   * Emit all components first so refs resolve.
   */
  emitAllComponents() {
    for (const name of this.#componentSchemas.keys()) {
      this.ensureComponent(name)
    }
  }

  /**
   * @param {string} name
   */
  ensureComponent(name) {
    const original = this.#resolveName(name)
    const ident = `Schema_${toSafeIdent(original)}`
    if (this.#componentExprs.has(ident)) {
      return ident
    }
    if (this.#emitting.has(original)) {
      // Cycle: leave a placeholder so nested refs can refer to this ident.
      this.#componentExprs.set(ident, "z.object({})")
      return ident
    }
    this.#emitting.add(original)
    // Placeholder before body so mutual refs see the ident.
    this.#componentExprs.set(ident, "z.object({})")
    const schema = this.#componentSchemas.get(original)
    if (!schema) {
      this.#errors.push(`Missing component schema: ${original}`)
      this.#emitting.delete(original)
      return ident
    }
    const expr = this.schemaToZod(schema, original)
    // Always lazy + typed: avoids TDZ / circular inference in TypeScript.
    this.#componentExprs.set(ident, `z.lazy(() => (${expr}))`)
    this.#emitting.delete(original)
    return ident
  }

  /** @type {Map<string, string>} */
  #componentExprs = new Map()

  get componentSource() {
    const lines = []
    for (const [ident, expr] of this.#componentExprs) {
      lines.push(`export const ${ident}: z.ZodTypeAny = ${expr}`)
    }
    return lines.join("\n\n")
  }

  /**
   * @param {OpenApiSchema|undefined} schema
   * @param {string} context
   * @returns {string}
   */
  schemaToZod(schema, context) {
    if (!schema || typeof schema !== "object") {
      this.#errors.push(`Empty schema at ${context}`)
      return "z.object({})"
    }

    if (schema.$ref) {
      const name = refName(schema.$ref)
      return this.ensureComponent(name)
    }

    if (schema.allOf) {
      const parts = (Array.isArray(schema.allOf) ? schema.allOf : [schema.allOf]).map((s, i) =>
        this.schemaToZod(s, `${context}.allOf[${i}]`),
      )
      if (parts.length === 0) return "z.object({})"
      if (parts.length === 1) return this.maybeNullable(schema, parts[0])
      // merge via intersection chain
      let expr = parts[0]
      for (let i = 1; i < parts.length; i++) {
        expr = `z.intersection(${expr}, ${parts[i]})`
      }
      return this.maybeNullable(schema, expr)
    }

    if (schema.oneOf?.length) {
      const parts = schema.oneOf.map((s, i) => this.schemaToZod(s, `${context}.oneOf[${i}]`))
      const expr = parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`
      return this.maybeNullable(schema, expr)
    }

    if (schema.anyOf?.length) {
      const parts = schema.anyOf.map((s, i) => this.schemaToZod(s, `${context}.anyOf[${i}]`))
      const expr = parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`
      return this.maybeNullable(schema, expr)
    }

    if (schema.enum?.length) {
      const literals = schema.enum.map((v) => {
        if (typeof v === "string") return JSON.stringify(v)
        if (typeof v === "number" || typeof v === "boolean") return String(v)
        this.#errors.push(`Unsupported enum value at ${context}: ${JSON.stringify(v)}`)
        return JSON.stringify(String(v))
      })
      if (literals.every((l) => l.startsWith('"'))) {
        return this.maybeNullable(schema, `z.enum([${literals.join(", ")}])`)
      }
      return this.maybeNullable(
        schema,
        `z.union([${literals.map((l) => `z.literal(${l})`).join(", ")}])`,
      )
    }

    const type = schema.type
    if (Array.isArray(type)) {
      const nonNull = type.filter((t) => t !== "null")
      const parts = nonNull.map((t) =>
        this.schemaToZod({ ...schema, type: t }, `${context}|${t}`),
      )
      let expr = parts.length === 1 ? parts[0] : `z.union([${parts.join(", ")}])`
      if (type.includes("null") || schema.nullable) expr = `${expr}.nullable()`
      return expr
    }

    switch (type) {
      case "null":
        return "z.null()"
      case "string":
        return this.maybeNullable(schema, this.stringZod(schema))
      case "integer":
        return this.maybeNullable(schema, this.numberZod(schema, true))
      case "number":
        return this.maybeNullable(schema, this.numberZod(schema, false))
      case "boolean":
        return this.maybeNullable(schema, "z.boolean()")
      case "array":
        return this.maybeNullable(
          schema,
          `z.array(${this.schemaToZod(schema.items ?? { type: "string" }, `${context}.items`)})`,
        )
      case "object":
        return this.maybeNullable(schema, this.objectZod(schema, context))
      case undefined:
        if (schema.properties || schema.additionalProperties !== undefined) {
          return this.maybeNullable(schema, this.objectZod(schema, context))
        }
        this.#errors.push(`Untyped schema at ${context}`)
        return "z.object({})"
      default:
        this.#errors.push(`Unsupported type '${type}' at ${context}`)
        return "z.object({})"
    }
  }

  /**
   * @param {OpenApiSchema} schema
   */
  stringZod(schema) {
    let e = "z.string()"
    if (schema.minLength !== undefined) e += `.min(${schema.minLength})`
    if (schema.maxLength !== undefined) e += `.max(${schema.maxLength})`
    return e
  }

  /**
   * @param {OpenApiSchema} schema
   * @param {boolean} int
   */
  numberZod(schema, int) {
    let e = int ? "z.number().int()" : "z.number()"
    if (schema.minimum !== undefined) e += `.min(${schema.minimum})`
    if (schema.maximum !== undefined) e += `.max(${schema.maximum})`
    return e
  }

  /**
   * @param {OpenApiSchema} schema
   * @param {string} context
   */
  objectZod(schema, context) {
    const props = schema.properties ?? {}
    const required = new Set(schema.required ?? [])
    const entries = []
    for (const [key, propSchema] of Object.entries(props)) {
      const expr = this.schemaToZod(propSchema, `${context}.${key}`)
      const optional = required.has(key) ? expr : `${expr}.optional()`
      entries.push(`  ${JSON.stringify(key)}: ${optional}`)
    }

    const ap = schema.additionalProperties
    if (ap === false || ap === undefined) {
      if (entries.length === 0) return "z.object({})"
      return `z.object({\n${entries.join(",\n")}\n})`
    }
    if (ap === true) {
      this.#errors.push(
        `Free-form object (additionalProperties:true) at ${context} — add an overlay with a typed schema`,
      )
      // still emit empty object so generation can surface the error; caller fails on errors
      if (entries.length === 0) return "z.object({})"
      return `z.object({\n${entries.join(",\n")}\n})`
    }
    if (typeof ap === "object") {
      const valueExpr = this.schemaToZod(ap, `${context}.additionalProperties`)
      if (valueExpr.includes("z.unknown") || valueExpr.includes("z.any")) {
        this.#errors.push(`Untyped additionalProperties at ${context}`)
      }
      if (entries.length === 0) {
        return `z.record(z.string(), ${valueExpr})`
      }
      return `z.object({\n${entries.join(",\n")}\n}).catchall(${valueExpr})`
    }
    if (entries.length === 0) return "z.object({})"
    return `z.object({\n${entries.join(",\n")}\n})`
  }

  /**
   * @param {OpenApiSchema} schema
   * @param {string} expr
   */
  maybeNullable(schema, expr) {
    return schema.nullable ? `${expr}.nullable()` : expr
  }
}

/**
 * Stable short hash for anonymous schema names.
 * @param {string} s
 */
export function shortHash(s) {
  return createHash("sha1").update(s).digest("hex").slice(0, 8)
}
