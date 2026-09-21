/**
 * Generate family-prefixed Adobe Firefly Services capabilities + Zod schemas from vendored OpenAPI.
 * Usage: node packages/adobe-firefly-services/scripts/generate-capabilities.mjs
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
 * @param {object} operation
 * @param {object} doc
 * @param {ZodEmitter} emitter
 * @param {string} context
 * @param {'async-submit' | 'status-cancel' | 'sync'} opClass
 */
function buildInputZod(operation, doc, emitter, context, opClass) {
  const pathProps = {}
  const queryProps = {}
  const headerProps = {}
  const pathReq = []
  const queryReq = []
  const headerReq = []

  for (const param of operation.parameters ?? []) {
    const p = param.$ref ? resolveRef(doc, param.$ref) : param
    if (!p?.name || !p.in) continue
    const schema = p.schema ?? { type: "string" }
    if (p.in === "path") {
      pathProps[p.name] = schema
      pathReq.push(p.name)
    } else if (p.in === "query") {
      queryProps[p.name] = schema
      if (p.required) queryReq.push(p.name)
    } else if (p.in === "header") {
      // skip auth headers — client injects them
      const lower = p.name.toLowerCase()
      if (lower === "authorization" || lower === "x-api-key") continue
      headerProps[p.name] = schema
      if (p.required) headerReq.push(p.name)
    }
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

  const groups = []
  if (Object.keys(pathProps).length) {
    groups.push(
      `  path: ${emitter.schemaToZod({ type: "object", properties: pathProps, required: pathReq, additionalProperties: false }, `${context}.path`)}`,
    )
  }
  if (Object.keys(queryProps).length) {
    groups.push(
      `  query: ${emitter.schemaToZod({ type: "object", properties: queryProps, required: queryReq, additionalProperties: false }, `${context}.query`)}.optional()`,
    )
  }
  if (Object.keys(headerProps).length) {
    groups.push(
      `  headers: ${emitter.schemaToZod({ type: "object", properties: headerProps, required: headerReq, additionalProperties: false }, `${context}.headers`)}.optional()`,
    )
  }
  if (bodySchema) {
    const requiredBody = operation.requestBody?.required !== false
    const bodyExpr = emitter.schemaToZod(bodySchema, `${context}.body`)
    groups.push(`  body: ${requiredBody ? bodyExpr : `${bodyExpr}.optional()`}`)
  }

  // Async submits always poll internally; only interval/timeout remain tunable.
  if (opClass === "async-submit") {
    groups.push(`  pollIntervalMs: z.number().int().positive().optional()`)
    groups.push(`  pollTimeoutMs: z.number().int().positive().optional()`)
  }

  if (!groups.length) return "z.object({})"
  return `z.object({\n${groups.join(",\n")}\n})`
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

  /** @type {string[]} */
  const samplePrompts = []
  if (summaryRaw) {
    samplePrompts.push(summaryRaw)
    samplePrompts.push(`${summaryRaw} with Adobe ${familyLabel(family)}`)
  } else {
    samplePrompts.push(`${summary} via Adobe ${familyLabel(family)}`)
  }

  return {
    summary,
    description,
    useCases: useCases.slice(0, 3),
    samplePrompts: samplePrompts.slice(0, 2),
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

          const inputZod = buildInputZod(operation, doc, emitter, `${context}.input`, opClass)
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
            inputZod,
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
    const needsZodInCaps = ops.some((o) => /\bz\./.test(String(o.outputZod)))
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
      const inputTypeLines = [
        `        path?: Record<string, string | number | boolean>`,
        `        query?: Record<string, string | number | boolean | undefined>`,
        `        headers?: Record<string, string>`,
        `        body?: unknown`,
      ]
      if (op.opClass === "async-submit") {
        inputTypeLines.push(`        pollIntervalMs?: number`)
        inputTypeLines.push(`        pollTimeoutMs?: number`)
      }

      capLines.push(`/** ${op.summary || op.opName} */`)
      capLines.push(
        `export const ${op.exportName} = shells.${op.exportName}(async (input, ctx) => {`,
      )
      capLines.push(`  return invokeAdobeOperation({`)
      capLines.push(`    method: ${JSON.stringify(op.method)},`)
      capLines.push(`    pathTemplate: ${JSON.stringify(op.path)},`)
      capLines.push(`    baseUrl: ${JSON.stringify(op.baseUrl)},`)
      capLines.push(`    input: input as {`)
      for (const line of inputTypeLines) capLines.push(line)
      capLines.push(`    },`)
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
