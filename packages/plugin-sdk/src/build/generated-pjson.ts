import type { ExtensionDefinition, PolicyDefinition } from "@executioncontrolprotocol/core"
import { isReservedRootName } from "../reserved-names.js"

/**
 * Generated `package.json` fields written by {@link buildPlugin}.
 * @category CLI
 */
export interface GeneratedPackageFields {
  "ecp.extension": string
  exportsOclif: string
  oclif: Record<string, unknown>
  keywords: string[]
  files: string[]
}

function isExtension(def: ExtensionDefinition | PolicyDefinition): def is ExtensionDefinition {
  return "capabilities" in def
}

/**
 * Compute generated package.json fields from a definition.
 * @category CLI
 */
export function generatedPackageFields(
  definition: ExtensionDefinition | PolicyDefinition,
  existingKeywords: string[] = []
): GeneratedPackageFields {
  const topic = definition.name
  if (isReservedRootName(topic)) {
    throw new Error(
      `Plugin topic "${topic}" collides with a reserved CLI root command. Rename the extension.`
    )
  }
  const summary = isExtension(definition)
    ? definition.metadata?.summary ?? definition.name
    : definition.name
  const keywords = [...new Set([...existingKeywords, "ecosystem:ecp-plugin", "oclif-plugin"])]
  return {
    "ecp.extension": "./dist/index.js",
    exportsOclif: "./dist/oclif.js",
    oclif: {
      bin: "ecp",
      dirname: "ecp",
      topicSeparator: " ",
      commands: {
        strategy: "explicit",
        target: "./dist/oclif.js",
        identifier: "COMMANDS",
      },
      topics: {
        [topic]: { description: summary },
      },
    },
    keywords,
    files: ["dist", "oclif.manifest.json", "README.md"],
  }
}

/**
 * Apply generated fields onto a package.json object.
 * @category CLI
 */
export function applyGeneratedFields(
  pkg: Record<string, unknown>,
  fields: GeneratedPackageFields
): Record<string, unknown> {
  const exportsValue =
    pkg.exports && typeof pkg.exports === "object" && !Array.isArray(pkg.exports)
      ? { ...(pkg.exports as Record<string, unknown>) }
      : {}
  exportsValue["./oclif"] = {
    types: "./dist/oclif.d.ts",
    import: fields.exportsOclif,
  }
  const ecp =
    pkg.ecp && typeof pkg.ecp === "object" && !Array.isArray(pkg.ecp)
      ? { ...(pkg.ecp as Record<string, unknown>) }
      : {}
  ecp.extension = fields["ecp.extension"]
  return {
    ...pkg,
    ecp,
    exports: exportsValue,
    oclif: fields.oclif,
    keywords: fields.keywords,
    files: fields.files,
  }
}
