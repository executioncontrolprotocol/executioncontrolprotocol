/**
 * Generate family-prefixed Adobe Firefly Services capabilities + Zod schemas from vendored OpenAPI.
 * Usage: node plugins/plugin-adobe-firefly-services/scripts/generate-capabilities.mjs
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "yaml"
import { SPEC_SOURCES, familyForSpec } from "./fetch-specs.mjs"
import { ZodEmitter, toKebab, toSafeIdent } from "./lib/zod-emitter.mjs"
import {
  acceptSchemaNameForOperation,
  classifyOperation,
  resolveOutputForOperation,
} from "./lib/operation-class.mjs"

const EXT_ID = "@executioncontrolprotocol/adobe-firefly-services"

/** Map OpenAPI operationId → kebab capability suffix (without family prefix). */
const OPERATION_ID_REMAP = {
  firefly_image_v5_generate_async_v4: "generate-images-v5-async",
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const openapiDir = join(root, "openapi")
const generatedDir = join(root, "src", "generated")

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"]

/**
 * @param {string} dir
 * @param {string[]} acc
 */
function walkFiles(dir, acc = []) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return acc
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p, acc)
    else if (/\.(json|ya?ml)$/i.test(name)) acc.push(p)
  }
  return acc
}

/**
 * @param {string} path
 */
function loadSpec(path) {
  const text = readFileSync(path, "utf8")
  return /\.ya?ml$/i.test(path) ? parseYaml(text) : JSON.parse(text)
}

/**
 * Apply path-array overlays onto a document.
 * @param {object} doc
 * @param {{ path: string[], value: object }[]} patches
 */
function applyOverlays(doc, patches) {
  for (const patch of patches) {
    let cur = doc
    const parts = patch.path
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      if (cur[key] == null || typeof cur[key] !== "object") {
        cur[key] = {}
      }
      cur = cur[key]
    }
    cur[parts[parts.length - 1]] = patch.value
  }
}

function loadOverlays() {
  const overlayPath = join(openapiDir, "overlays", "schema-fixes.json")
  try {
    return JSON.parse(readFileSync(overlayPath, "utf8"))
  } catch {
    return {}
  }
}

const RESERVED_INPUT_FIELDS = new Set(["body", "pollIntervalMs", "pollTimeoutMs"])

/**
 * Resolve $ref relative to document components.
 * @param {object} doc
 * @param {string} ref
 */
function resolveRef(doc, ref) {
  if (!ref.startsWith("#/")) throw new Error(`External $ref not supported: ${ref}`)
  const parts = ref.slice(2).split("/")
  let cur = doc
  for (const p of parts) {
    cur = cur?.[p]
  }
  return cur
}

/**
 * @param {string} name
 */
function zodObjectKey(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : JSON.stringify(name)
}

/**
 * @param {string} name
 * @param {string} expr
 * @param {boolean} optional
 */
function emitField(name, expr, optional) {
  return `  ${zodObjectKey(name)}: ${optional ? `${expr}.optional()` : expr}`
}

/**
 * Follow $ref / allOf until object properties are visible.
 * @param {object} doc
 * @param {object} schema
 * @param {Set<string>} [seen]
 * @returns {{ properties: Record<string, object>, required: string[] } | undefined}
 */
function resolveObjectProperties(doc, schema, seen = new Set()) {
  if (!schema || typeof schema !== "object") return undefined

  if (schema.$ref) {
    if (seen.has(schema.$ref)) return undefined
    seen.add(schema.$ref)
    return resolveObjectProperties(doc, resolveRef(doc, schema.$ref), seen)
  }

  if (schema.allOf) {
    const parts = Array.isArray(schema.allOf) ? schema.allOf : [schema.allOf]
    /** @type {Record<string, object>} */
    const properties = {}
    /** @type {string[]} */
    const required = []
    let found = false
    for (const part of parts) {
      const resolved = resolveObjectProperties(doc, part, seen)
      if (!resolved) continue
      found = true
      Object.assign(properties, resolved.properties)
      required.push(...resolved.required)
    }
    if (!found) return undefined
    return { properties, required: [...new Set(required)] }
  }

  if (schema.oneOf || schema.anyOf) return undefined

  if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
    return {
      properties: schema.properties,
      required: Array.isArray(schema.required)
        ? schema.required.filter((k) => typeof k === "string")
        : [],
    }
  }

  if (schema.type === "object") {
    return { properties: {}, required: [] }
  }

  return undefined
}

/**
 * @param {object} doc
 * @param {object} schema
 */
function isJsonContentTypeHeader(doc, schema) {
  let current = schema
  const seen = new Set()
  while (current?.$ref) {
    if (seen.has(current.$ref)) return false
    seen.add(current.$ref)
    current = resolveRef(doc, current.$ref)
  }
  const values = current?.enum
  if (!Array.isArray(values) || values.length !== 1) return false
  return String(values[0]).toLowerCase() === "application/json"
}

/**
 * @param {Set<string>} claimed
 * @param {string} name
 * @param {string} context
 */
function claimInputName(claimed, name, context) {
  if (RESERVED_INPUT_FIELDS.has(name) || claimed.has(name)) {
    throw new Error(`Capability input field collision: ${JSON.stringify(name)} at ${context}`)
  }
  claimed.add(name)
}

/**
 * @param {{ path: string[], query: string[], headers: string[], body: string[] }} parameters
 */
function parametersLiteral(parameters) {
  /** @type {Record<string, string[]>} */
  const obj = {}
  if (parameters.path.length) obj.path = parameters.path
  if (parameters.query.length) obj.query = parameters.query
  if (parameters.headers.length) obj.headers = parameters.headers
  if (parameters.body.length) obj.body = parameters.body
  if (!Object.keys(obj).length) return undefined
  return JSON.stringify(obj)
}

/**
 * @param {object} operation
 * @param {object} doc
 * @param {ZodEmitter} emitter
 * @param {string} context
 * @param {'async-submit' | 'status-cancel' | 'sync'} opClass
 */
function buildInputZod(operation, doc, emitter, context, opClass) {
  /** @type {{ path: string[], query: string[], headers: string[], body: string[] }} */
  const parameters = { path: [], query: [], headers: [], body: [] }
  const claimed = new Set()
  const groups = []

  for (const param of operation.parameters ?? []) {
    const p = param.$ref ? resolveRef(doc, param.$ref) : param
    if (!p?.name || !p.in) continue
    const schema = p.schema ?? { type: "string" }
    if (p.in === "header") {
      const lower = String(p.name).toLowerCase()
      if (lower === "authorization" || lower === "x-api-key") continue
      if (lower === "content-type" && isJsonContentTypeHeader(doc, schema)) continue
    }
    if (p.in !== "path" && p.in !== "query" && p.in !== "header") continue

    claimInputName(claimed, p.name, `${context}.${p.in}.${p.name}`)
    const required = p.in === "path" ? true : Boolean(p.required)
    const expr = emitter.schemaToZod(schema, `${context}.${p.in}.${p.name}`)
    groups.push(emitField(p.name, expr, !required))
    if (p.in === "path") parameters.path.push(p.name)
    else if (p.in === "query") parameters.query.push(p.name)
    else parameters.headers.push(p.name)
  }

  let bodySchema
  if (operation.requestBody) {
    const rb = operation.requestBody.$ref
      ? resolveRef(doc, operation.requestBody.$ref)
      : operation.requestBody
    const content = rb?.content ?? {}
    const json = content["application/json"] ?? content["application/octet-stream"]
    if (json?.schema) bodySchema = json.schema
  }

  let bodySchemaExpr
  if (bodySchema) {
    const objectProps = resolveObjectProperties(doc, bodySchema)
    const bodyExpr = emitter.schemaToZod(bodySchema, `${context}.body`)
    if (objectProps) {
      bodySchemaExpr = bodyExpr
      for (const [name, propSchema] of Object.entries(objectProps.properties)) {
        claimInputName(claimed, name, `${context}.body.${name}`)
        const expr = emitter.schemaToZod(propSchema, `${context}.body.${name}`)
        groups.push(emitField(name, expr, true))
        parameters.body.push(name)
      }
      groups.push(emitField("body", bodyExpr, true))
    } else {
      const requiredBody = operation.requestBody?.required !== false
      groups.push(emitField("body", bodyExpr, !requiredBody))
    }
  }

  if (opClass === "async-submit") {
    groups.push(`  pollIntervalMs: z.number().int().positive().optional()`)
    groups.push(`  pollTimeoutMs: z.number().int().positive().optional()`)
  }

  return {
    zod: groups.length ? `z.object({\n${groups.join(",\n")}\n})` : "z.object({})",
    parameters,
    bodySchemaExpr,
  }
}

/**
 * @param {string} family
 * @param {string} operationId
 * @param {string} method
 * @param {string} path
 */
function capabilityOpName(family, operationId, method, path) {
  // Single kebab segment after the package id (capabilityIdSchema: @ns/pkg.name).
  let suffix
  if (operationId) {
    const remapped = OPERATION_ID_REMAP[operationId]
    suffix = remapped ?? toKebab(operationId)
  } else {
    const fromPath = path
      .replace(/^\//, "")
      .replace(/\{([^}]+)\}/g, "by-$1")
      .replace(/\//g, "-")
    suffix = toKebab(`${method}-${fromPath}`)
  }
  return `${family}-${suffix}`
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
}

/**
 * @param {object} doc
 */
function baseUrl(doc) {
  const server = doc.servers?.[0]?.url
  if (!server) return ""
  return server.endsWith("/") ? server : `${server}/`
}

/**
 * @param {string} text
 */
function cleanOpenApiProse(text) {
  if (!text) return ""
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * @param {string} kebab
 */
function humanizeKebab(kebab) {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

/**
 * @param {string} family
 */
function familyLabel(family) {
  return humanizeKebab(family)
}

/**
 * Default plain-text projections from operation id heuristics.
 * @param {string} opName
 * @returns {{ summary: string, description: string }[]}
 */
function deriveProjections(opName) {
  const lower = opName.toLowerCase()
  if (
    lower.includes("status") ||
    lower.includes("job-result") ||
    lower.endsWith("-job") ||
    lower.includes("job-status")
  ) {
    return [
      {
        summary: "Read job status",
        description:
          "Take the job status and identifiers so you know whether to wait, retry, or continue.",
      },
      {
        summary: "Take completed outputs",
        description:
          "When the job succeeded, take output or result URLs and asset references for the next step.",
      },
    ]
  }
  if (
    lower.includes("list") ||
    lower.includes("voices") ||
    lower.includes("avatars") ||
    lower.includes("presets") ||
    lower.includes("models") ||
    lower.includes("tags") ||
    lower.includes("versions") ||
    lower.includes("scripts")
  ) {
    return [
      {
        summary: "Take listed items",
        description:
          "Keep each item id and display name from the list so later steps can select one.",
      },
    ]
  }
  if (
    lower.includes("describe") ||
    lower.includes("manifest") ||
    lower.includes("document-info") ||
    lower.includes("details")
  ) {
    return [
      {
        summary: "Inspect the structured result",
        description:
          "Read the returned document or asset facts you need for authoring, such as names, sizes, and ids.",
      },
    ]
  }
  if (
    lower.includes("generate") ||
    lower.includes("export") ||
    lower.includes("rendition") ||
    lower.includes("render") ||
    lower.includes("create") ||
    lower.includes("fill") ||
    lower.includes("expand") ||
    lower.includes("upload")
  ) {
    return [
      {
        summary: "Take returned assets",
        description:
          "Keep asset URLs or output references from the result for download or the next edit step.",
      },
      {
        summary: "Keep job identifiers",
        description:
          "When a job id is returned, keep it so you can poll status until outputs are ready.",
      },
    ]
  }
  return [
    {
      summary: "Use the operation result",
      description:
        "Take the fields from the response that the next workflow step needs (ids, status, or asset URLs).",
    },
  ]
}

/**
 * Derive agent-facing capability metadata from an OpenAPI operation.
 * @param {object} operation
 * @param {string} family
 * @param {string} opName
 */
function deriveCapabilityMetadata(operation, family, opName) {
  const suffix = opName.startsWith(`${family}-`) ? opName.slice(family.length + 1) : opName
  const summaryRaw = (operation.summary ?? "").trim()
  const summary = summaryRaw || humanizeKebab(suffix)
  const descriptionRaw = cleanOpenApiProse(operation.description ?? "")
  const description = descriptionRaw || summary

  if (!summary.trim()) {
    throw new Error(`Adobe capability ${opName}: summary is required`)
  }
  if (!description.trim()) {
    throw new Error(`Adobe capability ${opName}: description is required`)
  }

  /** @type {string[]} */
  const useCases = []
  for (const tag of operation.tags ?? []) {
    const tagText = String(tag).trim()
    if (tagText) {
      useCases.push(`${familyLabel(family)} ${tagText} tasks that need this operation`)
    }
  }
  if (summaryRaw) {
    const lead = summaryRaw.charAt(0).toLowerCase() + summaryRaw.slice(1)
    useCases.push(`When the workflow goal is to ${lead}`)
  }
  if (!useCases.length) {
    useCases.push(`When you need ${summary.toLowerCase()} through Adobe ${familyLabel(family)}`)
  }

  return {
    summary,
    description,
    useCases: useCases.slice(0, 3),
    projections: deriveProjections(opName),
  }
}

function main() {
  rmSync(generatedDir, { recursive: true, force: true })
  mkdirSync(generatedDir, { recursive: true })

  /** @type {string[]} */
  const allErrors = []
  /** @type {{ family: string, opName: string, exportName: string, importPath: string }[]} */
  const registry = []
  /** @type {Map<string, object[]>} */
  const byFamily = new Map()

  const overlays = loadOverlays()
  const files = walkFiles(openapiDir).filter((f) => !f.includes("overlays"))

  /** @type {Map<string, { rels: string[], docs: object[] }>} */
  const familyDocs = new Map()
  for (const file of files) {
    const rel = relative(openapiDir, file).replace(/\\/g, "/")
    const family = familyForSpec(rel)
    if (family === "content-tagging") continue
    const doc = loadSpec(file)
    if (overlays[rel]) applyOverlays(doc, overlays[rel])
    if (!familyDocs.has(family)) familyDocs.set(family, { rels: [], docs: [] })
    const entry = familyDocs.get(family)
    entry.rels.push(rel)
    entry.docs.push(doc)
  }

  for (const [family, { rels, docs }] of [...familyDocs.entries()].sort()) {
    /** @type {Map<string, object>} */
    const componentMap = new Map()
    for (const doc of docs) {
      for (const [name, schema] of Object.entries(doc.components?.schemas ?? {})) {
        componentMap.set(name, schema)
      }
    }

    const emitter = new ZodEmitter(componentMap)
    for (const name of componentMap.keys()) {
      emitter.ensureComponent(name)
    }

    const familyOps = []
    for (let di = 0; di < docs.length; di++) {
      const doc = docs[di]
      const rel = rels[di]
      const base = baseUrl(doc)

      for (const [path, item] of Object.entries(doc.paths ?? {})) {
        for (const method of HTTP_METHODS) {
          const operation = item[method]
          if (!operation) continue

          const opId = operation.operationId || ""
          const opName = capabilityOpName(family, opId, method, path)
          const exportName = toSafeIdent(opName.replace(/\./g, "_"))
          const context = `${rel}:${method.toUpperCase()} ${path}`
          const responseCodes = Object.keys(operation.responses ?? {})
          const acceptSchemaName = acceptSchemaNameForOperation(operation, doc)
          const opClass = classifyOperation({
            path,
            operationId: opId,
            method: method.toUpperCase(),
            responseCodes,
            acceptSchemaName,
            opName,
          })

          const inputBuilt = buildInputZod(operation, doc, emitter, `${context}.input`, opClass)
          const outputResolved = resolveOutputForOperation(
            opName,
            opClass,
            operation,
            doc,
            (schema, ctx) => emitter.schemaToZod(schema, ctx),
          )

          familyOps.push({
            family,
            opName,
            exportName,
            method: method.toUpperCase(),
            path,
            baseUrl: base,
            inputZod: inputBuilt.zod,
            parameters: inputBuilt.parameters,
            bodySchemaExpr: inputBuilt.bodySchemaExpr,
            outputZod: outputResolved.outputZod,
            opClass,
            materialize: outputResolved.materialize,
            operationId: opId,
            summary: operation.summary ?? "",
            operation,
            rel,
          })
        }
      }
    }

    allErrors.push(...emitter.errors.map((e) => `[${family}] ${e}`))

    const familyDir = join(generatedDir, family)
    mkdirSync(familyDir, { recursive: true })

    const schemasSrc = `/* eslint-disable */\n/** Generated from ${rels.join(", ")} — do not edit. */\nimport { z } from "zod"\n\n${emitter.componentSource}\n`
    writeFileSync(join(familyDir, "schemas.ts"), schemasSrc, "utf8")

    const seen = new Set()
    const uniqueOps = []
    for (const op of familyOps) {
      if (seen.has(op.exportName)) {
        op.exportName = `${op.exportName}_${toSafeIdent(op.path)}`
        op.opName = `${op.opName}-${toKebab(op.path.split("/").filter(Boolean).pop() || "x")}`
      }
      if (seen.has(op.exportName)) continue
      seen.add(op.exportName)
      uniqueOps.push(op)
    }
    byFamily.set(family, uniqueOps)
  }

  for (const [family, ops] of [...byFamily.entries()].sort()) {
    const familyDir = join(generatedDir, family)

    // Shared browser-safe shells: schemas + colocated metadata; host/browser only swap handlers.
    const shellLines = []
    shellLines.push(`/* eslint-disable */`)
    shellLines.push(`/** Generated Adobe ${family} capability shells — do not edit. */`)
    shellLines.push(
      `import { capabilityFor, type CapabilityHandler } from "@executioncontrolprotocol/core"`,
    )
    shellLines.push(`import { z } from "zod"`)
    shellLines.push(`import * as schemas from "./schemas.js"`)
    const needsManifestSchema = ops.some(
      (o) => o.outputZod === "photoshopManifestDocumentSchema",
    )
    if (needsManifestSchema) {
      shellLines.push(
        `import { photoshopManifestDocumentSchema } from "../../runtime/photoshop-manifest.js"`,
      )
    }
    shellLines.push(``)
    shellLines.push(`const EXT_ID = ${JSON.stringify(EXT_ID)}`)
    shellLines.push(``)

    for (const op of ops) {
      const qualify = (expr) =>
        expr.replace(/\bSchema_([A-Za-z0-9_]+)\b/g, "schemas.Schema_$1")
      const inputZod = qualify(op.inputZod)
      const outputZod =
        op.outputZod === "photoshopManifestDocumentSchema"
          ? "photoshopManifestDocumentSchema"
          : qualify(op.outputZod)
      const capabilityMetadata = deriveCapabilityMetadata(op.operation, op.family, op.opName)

      shellLines.push(`/** ${op.summary || op.opName} */`)
      shellLines.push(
        `export function ${op.exportName}(handler: CapabilityHandler) {`,
      )
      shellLines.push(
        `  return capabilityFor(EXT_ID, ${JSON.stringify(op.opName)})`,
      )
      shellLines.push(`    .withInput(${inputZod})`)
      shellLines.push(`    .withOutput(${outputZod})`)
      shellLines.push(`    .withMetadata(${JSON.stringify(capabilityMetadata)})`)
      shellLines.push(`    .withHandler(handler)`)
      shellLines.push(`}`)
      shellLines.push(``)
    }
    writeFileSync(join(familyDir, "shells.ts"), shellLines.join("\n"), "utf8")

    const capLines = []
    capLines.push(`/* eslint-disable */`)
    capLines.push(`/** Generated Adobe ${family} capabilities — do not edit. */`)
    capLines.push(`import * as shells from "./shells.js"`)
    const needsZodInCaps = ops.some(
      (o) => /\bz\./.test(String(o.outputZod)) || /\bz\./.test(String(o.bodySchemaExpr ?? "")),
    )
    if (needsZodInCaps) {
      capLines.push(`import { z } from "zod"`)
    }
    capLines.push(`import * as schemas from "./schemas.js"`)
    capLines.push(`import { invokeAdobeOperation } from "../../runtime/invoke.js"`)
    if (needsManifestSchema) {
      capLines.push(
        `import { photoshopManifestDocumentSchema } from "../../runtime/photoshop-manifest.js"`,
      )
    }
    capLines.push(``)

    for (const op of ops) {
      const qualify = (expr) =>
        expr.replace(/\bSchema_([A-Za-z0-9_]+)\b/g, "schemas.Schema_$1")

      const outputZod =
        op.outputZod === "photoshopManifestDocumentSchema"
          ? "photoshopManifestDocumentSchema"
          : qualify(op.outputZod)

      const asyncMode = op.opClass === "async-submit" ? "submit" : "none"
      const paramLit = parametersLiteral(op.parameters ?? { path: [], query: [], headers: [], body: [] })
      const bodySchema = op.bodySchemaExpr ? qualify(op.bodySchemaExpr) : undefined

      capLines.push(`/** ${op.summary || op.opName} */`)
      capLines.push(
        `export const ${op.exportName} = shells.${op.exportName}(async (input, ctx) => {`,
      )
      capLines.push(`  return invokeAdobeOperation({`)
      capLines.push(`    method: ${JSON.stringify(op.method)},`)
      capLines.push(`    pathTemplate: ${JSON.stringify(op.path)},`)
      capLines.push(`    baseUrl: ${JSON.stringify(op.baseUrl)},`)
      capLines.push(`    input: input as Record<string, unknown>,`)
      if (paramLit) {
        capLines.push(`    parameters: ${paramLit},`)
      }
      if (bodySchema) {
        capLines.push(`    bodySchema: ${bodySchema},`)
      }
      capLines.push(`    ctx,`)
      capLines.push(`    outputSchema: ${outputZod},`)
      capLines.push(`    asyncMode: ${JSON.stringify(asyncMode)},`)
      if (op.materialize) {
        capLines.push(`    materialize: ${JSON.stringify(op.materialize)},`)
      }
      capLines.push(`  })`)
      capLines.push(`})`)
      capLines.push(``)

      registry.push({
        family,
        opName: op.opName,
        exportName: op.exportName,
        opClass: op.opClass,
        importPath: `./${family}/capabilities.js`,
      })
    }

    writeFileSync(join(familyDir, "capabilities.ts"), capLines.join("\n"), "utf8")

    // Browser catalog: same shells; hostHop handlers (no IMS / invoke).
    const browserCapLines = []
    browserCapLines.push(`/* eslint-disable */`)
    browserCapLines.push(`/** Generated Adobe ${family} browser catalog — do not edit. */`)
    browserCapLines.push(`import * as shells from "./shells.js"`)
    browserCapLines.push(`import { HOST_HOP_MESSAGE } from "../../shared.js"`)
    browserCapLines.push(``)
    browserCapLines.push(`async function hostHop(): Promise<never> {`)
    browserCapLines.push(`  throw new Error(HOST_HOP_MESSAGE)`)
    browserCapLines.push(`}`)
    browserCapLines.push(``)

    for (const op of ops) {
      browserCapLines.push(`/** ${op.summary || op.opName} */`)
      browserCapLines.push(
        `export const ${op.exportName} = shells.${op.exportName}(hostHop)`,
      )
      browserCapLines.push(``)
    }
    writeFileSync(join(familyDir, "capabilities.browser.ts"), browserCapLines.join("\n"), "utf8")

    const exportsList = ops.map((o) => o.exportName).join(", ")
    writeFileSync(
      join(familyDir, "index.ts"),
      `/** Generated — do not edit. */\nexport { ${exportsList} } from "./capabilities.js"\n`,
      "utf8",
    )
  }

  const importLines = []
  const arrayItems = []
  const browserImportLines = []
  const browserArrayItems = []
  const seenImport = new Map()
  for (const r of registry) {
    if (!seenImport.has(r.importPath)) {
      seenImport.set(r.importPath, [])
    }
    seenImport.get(r.importPath).push(r.exportName)
  }
  let i = 0
  for (const [path, names] of seenImport) {
    const alias = `fam${i++}`
    importLines.push(`import * as ${alias} from "${path}"`)
    const browserPath = path.replace(/capabilities\.js$/, "capabilities.browser.js")
    browserImportLines.push(`import * as ${alias} from "${browserPath}"`)
    for (const name of names) {
      arrayItems.push(`${alias}.${name}`)
      browserArrayItems.push(`${alias}.${name}`)
    }
  }

  const classCounts = { "async-submit": 0, "status-cancel": 0, sync: 0 }
  for (const ops of byFamily.values()) {
    for (const op of ops) {
      classCounts[op.opClass] = (classCounts[op.opClass] ?? 0) + 1
    }
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    operationCount: registry.length,
    families: [...byFamily.keys()].sort(),
    operationClasses: classCounts,
    operations: registry.map((r) => `${EXT_ID}.${r.opName}`),
    operationClassById: Object.fromEntries(
      registry.map((r) => [`${EXT_ID}.${r.opName}`, r.opClass]),
    ),
    specFiles: Object.keys(SPEC_SOURCES),
  }

  writeFileSync(join(generatedDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf8")

  writeFileSync(
    join(generatedDir, "index.ts"),
    `/** Generated Adobe capability registry — do not edit. */\n${importLines.join("\n")}\n\n/** All generated Adobe capability builders. */\nexport const adobeGeneratedCapabilities = [\n  ${arrayItems.join(",\n  ")},\n] as const\n\nexport const ADOBE_GENERATED_OPERATION_COUNT = ${registry.length} as const\n`,
    "utf8",
  )

  writeFileSync(
    join(generatedDir, "index.browser.ts"),
    `/** Generated Adobe browser capability registry — do not edit. */\n${browserImportLines.join("\n")}\n\n/** All generated Adobe browser catalog capability builders (host hop). */\nexport const adobeGeneratedCapabilities = [\n  ${browserArrayItems.join(",\n  ")},\n] as const\n\nexport const ADOBE_GENERATED_OPERATION_COUNT = ${registry.length} as const\n`,
    "utf8",
  )

  if (allErrors.length) {
    console.error(`Codegen completed with ${allErrors.length} schema error(s):`)
    for (const e of allErrors.slice(0, 50)) console.error(" -", e)
    if (allErrors.length > 50) console.error(` ... and ${allErrors.length - 50} more`)
    writeFileSync(join(generatedDir, "codegen-errors.json"), JSON.stringify(allErrors, null, 2))
    process.exitCode = 1
  } else {
    console.log(
      `Generated ${registry.length} capabilities across ${byFamily.size} families ` +
        `(async-submit=${classCounts["async-submit"]}, status-cancel=${classCounts["status-cancel"]}, sync=${classCounts.sync})`,
    )
  }
}

main()
