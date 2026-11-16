import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import Ajv2020 from "ajv/dist/2020.js"
import addFormatsModule from "ajv-formats"
import {
  PLUGIN_MANIFEST_SCHEMA,
  type PluginManifest,
  type PluginSchemaDocument,
  type ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import {
  buildPluginManifest,
  buildPluginSchemaDocument,
  canonicalJson,
  sha256Hex,
  type PluginDefinition,
} from "@executioncontrolprotocol/plugin-sdk"
import pluginManifestSchema from "@executioncontrolprotocol/protocol/schemas/plugin-manifest.schema.json" with { type: "json" }
import pluginSchemaSchema from "@executioncontrolprotocol/protocol/schemas/plugin-schema.schema.json" with { type: "json" }

interface AjvValidator {
  (data: unknown): boolean
  errors?: Array<{ instancePath?: string; message?: string }> | null
}

interface AjvLike {
  compile(schema: object): AjvValidator
}

const Ajv = Ajv2020 as unknown as new (options?: object) => AjvLike
const addFormats = addFormatsModule as unknown as (ajv: AjvLike) => AjvLike

const ajv = addFormats(new Ajv({ allErrors: true, strict: false }))
const validateManifestDocument = ajv.compile(pluginManifestSchema as object)
const validateSchemaDocument = ajv.compile(pluginSchemaSchema as object)

/** Suggestion attached when schema documents are missing or invalid. */
const REGENERATE_SUGGESTION = "Run ecp-plugin-manifest to regenerate."

/**
 * Result of loading one plugin package.
 * @category Plugins
 */
export interface LoadedPluginPackage {
  /** Absolute package root. */
  root: string
  /** package.json name. */
  packageName: string
  /** package.json version. */
  packageVersion: string
  /** Absolute path to the entry module. */
  entryPath: string
  /** Light manifest used for the registry. */
  manifest: PluginManifest
  /** Per-plugin schema document assembled into capability entries. */
  schemaDocument: PluginSchemaDocument
  /** Parsed definition, when loaded for linked regen or first call. */
  definition?: PluginDefinition
}

/**
 * Load and validate a plugin package. Linked packages regenerate both documents in memory.
 * @category Plugins
 */
export async function loadPluginPackage(
  root: string,
  source: "user" | "link" | "core",
): Promise<{ ok: true; loaded: LoadedPluginPackage } | { ok: false; issues: ValidationIssue[]; packageName?: string }> {
  let packageJson: {
    name?: string
    version?: string
    ecp?: { manifest?: string; schema?: string }
    main?: string
    exports?: unknown
  }
  try {
    packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as typeof packageJson
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "ECP_PLUGIN_LOAD_FAILED",
          severity: "error",
          message: `Plugin package.json is missing under ${root}.`,
          path: "",
        },
      ],
    }
  }

  const packageName = packageJson.name ?? path.basename(root)
  const packageVersion = packageJson.version ?? ""
  const manifestRel = packageJson.ecp?.manifest ?? "./ecp.manifest.json"
  const entryRel = "./dist/index.js"
  const entryPath = path.resolve(root, entryRel)

  if (source === "link") {
    try {
      const mod = (await import(pathToFileURL(entryPath).href)) as { default?: PluginDefinition }
      if (!mod.default) {
        return {
          ok: false,
          packageName,
          issues: [
            {
              code: "ECP_PLUGIN_LOAD_FAILED",
              severity: "error",
              message: `Linked plugin ${packageName} does not default-export a definePlugin definition.`,
              path: "",
            },
          ],
        }
      }
      const schemaDocument = await buildPluginSchemaDocument({
        definition: mod.default,
        packageJson: { name: packageName, version: packageVersion },
      })
      const manifest = await buildPluginManifest({
        definition: mod.default,
        packageJson: { name: packageName, version: packageVersion },
        entry: entryRel,
        schemaDocument,
      })
      const issues = [
        ...validateManifestShape(manifest, packageVersion),
        ...validateSchemaContents(schemaDocument, manifest),
      ]
      if (issues.length > 0) return { ok: false, packageName, issues }
      return {
        ok: true,
        loaded: {
          root,
          packageName,
          packageVersion,
          entryPath,
          manifest,
          schemaDocument,
          definition: mod.default,
        },
      }
    } catch (error) {
      return {
        ok: false,
        packageName,
        issues: [
          {
            code: "ECP_PLUGIN_LOAD_FAILED",
            severity: "error",
            message: error instanceof Error ? error.message : `Failed to load linked plugin ${packageName}.`,
            path: "",
          },
        ],
      }
    }
  }

  const manifestPath = path.resolve(root, manifestRel)
  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown
  } catch {
    return {
      ok: false,
      packageName,
      issues: [
        {
          code: "ECP_PLUGIN_LOAD_FAILED",
          severity: "error",
          message: `ecp.manifest.json is missing for ${packageName} at ${manifestPath}.`,
          path: "",
          suggestions: [REGENERATE_SUGGESTION],
        },
      ],
    }
  }

  const versionIssue = rejectLegacyManifest(rawManifest)
  if (versionIssue) return { ok: false, packageName, issues: [versionIssue] }

  const manifestIssues = validateManifestShape(rawManifest, packageVersion)
  if (manifestIssues.length > 0) {
    return {
      ok: false,
      packageName,
      issues: manifestIssues.map((issue) => ({
        ...issue,
        suggestions: issue.suggestions ?? [REGENERATE_SUGGESTION],
      })),
    }
  }
  const manifest = rawManifest as PluginManifest

  const schemaRel =
    manifest.pluginSchema.path || packageJson.ecp?.schema || "./ecp.schema.json"
  const schemaPath = path.resolve(root, schemaRel)
  let rawSchema: unknown
  try {
    rawSchema = JSON.parse(await readFile(schemaPath, "utf8")) as unknown
  } catch {
    return {
      ok: false,
      packageName,
      issues: [
        {
          code: "ECP_PLUGIN_LOAD_FAILED",
          severity: "error",
          message: `ecp.schema.json is missing for ${packageName} at ${schemaPath}.`,
          path: "",
          suggestions: [REGENERATE_SUGGESTION],
        },
      ],
    }
  }

  const schemaIssues = await validateLoadedSchema(rawSchema, manifest, schemaPath)
  if (schemaIssues.length > 0) return { ok: false, packageName, issues: schemaIssues }

  return {
    ok: true,
    loaded: {
      root,
      packageName,
      packageVersion,
      entryPath,
      manifest,
      schemaDocument: rawSchema as PluginSchemaDocument,
    },
  }
}

function rejectLegacyManifest(raw: unknown): ValidationIssue | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const version = (raw as { version?: unknown }).version
  if (version === "2.0") return undefined
  return {
    code: "ECP_PLUGIN_LOAD_FAILED",
    severity: "error",
    message:
      "Plugin manifest version 2.0 with ecp.schema.json is required. Run ecp-plugin-manifest to regenerate.",
    path: "/version",
    suggestions: [REGENERATE_SUGGESTION],
  }
}

function validateManifestShape(raw: unknown, packageVersion: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ok = validateManifestDocument(raw)
  if (!ok) {
    for (const error of validateManifestDocument.errors ?? []) {
      issues.push({
        code: "ECP_PLUGIN_LOAD_FAILED",
        severity: "error",
        message: error.message ?? "Plugin manifest is invalid.",
        path: error.instancePath ?? "",
        suggestions: [REGENERATE_SUGGESTION],
      })
    }
    return issues
  }
  const manifest = raw as PluginManifest
  if (manifest.schema !== PLUGIN_MANIFEST_SCHEMA) {
    issues.push({
      code: "ECP_PLUGIN_LOAD_FAILED",
      severity: "error",
      message: `schema must be ${PLUGIN_MANIFEST_SCHEMA}.`,
      path: "/schema",
      suggestions: [REGENERATE_SUGGESTION],
    })
  }
  if (manifest.plugin.version !== packageVersion) {
    issues.push({
      code: "ECP_PLUGIN_LOAD_FAILED",
      severity: "error",
      message: `plugin.version ${manifest.plugin.version} does not match package.json version ${packageVersion}.`,
      path: "/plugin/version",
    })
  }
  return issues
}

async function validateLoadedSchema(
  raw: unknown,
  manifest: PluginManifest,
  schemaPath: string,
): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = []
  const ok = validateSchemaDocument(raw)
  if (!ok) {
    for (const error of validateSchemaDocument.errors ?? []) {
      issues.push({
        code: "ECP_PLUGIN_LOAD_FAILED",
        severity: "error",
        message: error.message ?? `Plugin schema document is invalid at ${schemaPath}.`,
        path: error.instancePath ?? "",
        suggestions: [REGENERATE_SUGGESTION],
      })
    }
    return issues
  }

  const schemaDocument = raw as PluginSchemaDocument
  issues.push(...validateSchemaContents(schemaDocument, manifest))
  if (issues.length > 0) return issues

  const actualHash = await sha256Hex(canonicalJson(schemaDocument))
  if (actualHash !== manifest.pluginSchema.hash) {
    issues.push({
      code: "ECP_PLUGIN_LOAD_FAILED",
      severity: "error",
      message: `ecp.schema.json hash mismatch for ${manifest.plugin.id} at ${schemaPath}.`,
      path: "/pluginSchema/hash",
      suggestions: [REGENERATE_SUGGESTION],
    })
  }
  return issues
}

function validateSchemaContents(
  schemaDocument: PluginSchemaDocument,
  manifest: PluginManifest,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const expectedId = `ecp://plugins/${manifest.plugin.id}/${manifest.plugin.version}/schema.json`
  if (schemaDocument.$id !== expectedId) {
    issues.push({
      code: "ECP_PLUGIN_LOAD_FAILED",
      severity: "error",
      message: `$id must be ${expectedId}.`,
      path: "/$id",
      suggestions: [REGENERATE_SUGGESTION],
    })
  }
  for (const capability of manifest.capabilities) {
    const acceptsKey = `${capability.name}.accepts`
    const returnsKey = `${capability.name}.returns`
    if (!schemaDocument.$defs[acceptsKey]) {
      issues.push({
        code: "ECP_PLUGIN_LOAD_FAILED",
        severity: "error",
        message: `ecp.schema.json is missing $defs.${acceptsKey}.`,
        path: `/$defs/${acceptsKey}`,
        suggestions: [REGENERATE_SUGGESTION],
      })
    }
    if (!schemaDocument.$defs[returnsKey]) {
      issues.push({
        code: "ECP_PLUGIN_LOAD_FAILED",
        severity: "error",
        message: `ecp.schema.json is missing $defs.${returnsKey}.`,
        path: `/$defs/${returnsKey}`,
        suggestions: [REGENERATE_SUGGESTION],
      })
    }
  }
  return issues
}
