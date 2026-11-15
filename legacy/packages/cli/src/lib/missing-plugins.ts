import type { Interfaces } from "@oclif/core"
import {
  isBuiltinRequirementId,
  satisfiesRange,
  type RequirementEntry,
  type RequirementsDocument,
} from "@executioncontrolprotocol/core"
import { listInstalledPlugins, type InstalledPlugin } from "./installed-plugins.js"

/** Why a required plugin is not usable. @category CLI */
export type MissingPluginReason = "missing" | "version"

/** One missing or out-of-range plugin. @category CLI */
export interface MissingPlugin {
  /** Extension or policy id. */
  id: string
  /** npm package to install. */
  package: string
  /** Requested semver range, when pinned. */
  range?: string
  /** Why it is missing. */
  reason: MissingPluginReason
  /** Exact install command. */
  command: string
}

function pluginProvidesId(plugin: InstalledPlugin, id: string): boolean {
  const ecp = plugin.pjson.ecp as { id?: string } | undefined
  if (ecp?.id === id) return true
  const name = plugin.name
  const mapped = name.replace(/\/plugin-/, "/")
  return mapped === id
}

function installCommand(pkg: string, range?: string): string {
  const spec = range ? `${pkg}@${range}` : pkg
  return `ecp plugins install ${spec}`
}

/**
 * Requirements that are not satisfied by currently installed plugins.
 * Built-ins are skipped. Missing `package` rows are skipped (nothing to install).
 * @category CLI
 */
export function findMissingPlugins(
  requirements: RequirementsDocument,
  config: Interfaces.Config
): MissingPlugin[] {
  const installed = listInstalledPlugins(config)
  const missing: MissingPlugin[] = []
  const seen = new Set<string>()
  for (const row of requirements.requirements) {
    if (isBuiltinRequirementId(row.id)) continue
    if (!row.package) continue
    const key = `${row.id}:${row.package}`
    if (seen.has(key)) continue
    seen.add(key)
    const hit = installed.find(
      (plugin) => plugin.name === row.package || pluginProvidesId(plugin, row.id)
    )
    if (!hit) {
      missing.push(toMissing(row, "missing"))
      continue
    }
    if (row.range && hit.version && !satisfiesRange(hit.version, row.range)) {
      missing.push(toMissing(row, "version"))
    }
  }
  return missing
}

function toMissing(row: RequirementEntry, reason: MissingPluginReason): MissingPlugin {
  return {
    id: row.id,
    package: row.package ?? "",
    ...(row.range ? { range: row.range } : {}),
    reason,
    command: installCommand(row.package ?? "", row.range),
  }
}
