import { readFile } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import Ajv2020 from "ajv/dist/2020.js"
import addFormatsModule from "ajv-formats"
import {
  PLUGIN_MANIFEST_SCHEMA,
  type PluginManifest,
  type ValidationIssue,
} from "@executioncontrolprotocol/protocol"
import { buildPluginManifest, type PluginDefinition } from "@executioncontrolprotocol/plugin-sdk"
import pluginManifestSchema from "@executioncontrolprotocol/protocol/schemas/plugin-manifest.schema.json" with { type: "json" }

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
const validate = ajv.compile(pluginManifestSchema as object)

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
  /** Manifest used for the registry. */
  manifest: PluginManifest
  /** Parsed definition, when loaded for linked regen or first call. */
  definition?: PluginDefinition
}

/**
 * Load and validate a plugin package. Linked packages regenerate the manifest in memory.
 * @category Plugins
 */
export async function loadPluginPackage(
  root: string,
  source: "user" | "link" | "core",
): Promise<{ ok: true; loaded: LoadedPluginPackage } | { ok: false; issues: ValidationIssue[]; packageName?: string }> {
  let packageJson: { name?: string; version?: string; ecp?: { manifest?: string }; main?: string; exports?: unknown }
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
      const manifest = await buildPluginManifest({
        definition: mod.default,
        packageJson: { name: packageName, version: packageVersion },
        entry: entryRel,
      })
      const issues = validateManifest(manifest, packageVersion)
      if (issues.length > 0) return { ok: false, packageName, issues }
      return {
        ok: true,
        loaded: {
          root,
          packageName,
          packageVersion,
          entryPath,
          manifest,
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
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown
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
        },
      ],
    }
  }

  const issues = validateManifest(raw, packageVersion)
  if (issues.length > 0) return { ok: false, packageName, issues }
  return {
    ok: true,
    loaded: {
      root,
      packageName,
      packageVersion,
      entryPath,
      manifest: raw as PluginManifest,
    },
  }
}

function validateManifest(raw: unknown, packageVersion: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const ok = validate(raw)
  if (!ok) {
    for (const error of validate.errors ?? []) {
      issues.push({
        code: "ECP_PLUGIN_LOAD_FAILED",
        severity: "error",
        message: error.message ?? "Plugin manifest is invalid.",
        path: error.instancePath ?? "",
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
