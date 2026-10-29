import { readFile, writeFile } from "node:fs/promises"
import type { RequirementEntry } from "@executioncontrolprotocol/core"
import { collectPackagesFromEnvironmentSource } from "./init/collect-env-packages.js"

/** npm package for the Node host, always present in an environment export. @category CLI */
export const NODE_HOST_PACKAGE = "@executioncontrolprotocol/node"

/** Default name for an exported environment package.json. @category CLI */
export const EXPORTED_PACKAGE_NAME = "ecp-environment"

/**
 * Project requirements plus config-file imports to a Node `package.json`.
 * Unpinned rows use `"*"`. Binding config and secret values are omitted.
 * @category CLI
 */
export function packageJsonFromRequirements(
  requirements: readonly RequirementEntry[] | undefined,
  extraPackages: readonly string[] = []
): {
  name: string
  private: true
  type: "module"
  dependencies: Record<string, string>
} {
  const dependencies: Record<string, string> = {
    [NODE_HOST_PACKAGE]: "*",
  }
  if (requirements) {
    for (const row of requirements) {
      if (!row.package) continue
      dependencies[row.package] = row.range ?? "*"
    }
  }
  for (const pkg of extraPackages) {
    if (!dependencies[pkg]) dependencies[pkg] = "*"
  }
  const sorted = Object.fromEntries(
    Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))
  )
  return {
    name: EXPORTED_PACKAGE_NAME,
    private: true,
    type: "module",
    dependencies: sorted,
  }
}

/**
 * Packages imported by an environment file, plus the Node host.
 * @category CLI
 */
export async function packagesFromEnvironmentFile(envPath: string): Promise<string[]> {
  const source = await readFile(envPath, "utf8")
  return collectPackagesFromEnvironmentSource(source)
}

/**
 * Serialize a package.json document, optionally writing it to `output`.
 * @category CLI
 */
export async function writePackageJsonArtifact(
  document: unknown,
  output: string | undefined
): Promise<unknown> {
  if (!output) return document
  const text = `${JSON.stringify(document, null, 2)}\n`
  await writeFile(output, text, "utf8")
  return undefined
}
