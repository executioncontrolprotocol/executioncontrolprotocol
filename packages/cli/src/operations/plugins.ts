import { z } from "zod"
import { resolve } from "node:path"
import {
  buildPlugin,
  checkPlugin,
  defineOperation,
  EcpCliError,
  EXIT_FAILED,
  EXIT_USAGE,
  scaffoldPlugin,
} from "@executioncontrolprotocol/plugin-sdk"

function pluginDir(name: string): string {
  const slug = name.replace(/^@[^/]+\//, "").replace(/^plugin-/, "")
  return resolve(process.cwd(), `plugin-${slug}`)
}

/** `ecp plugins new`. @category CLI */
export const pluginsNewOperation = defineOperation("plugins:new")
  .withInput(z.object({ name: z.string() }))
  .withMetadata({
    summary: "Scaffold an ECP plugin",
    description: "Write src/index.ts and a minimal package.json. Then run ecp plugins build.",
    useCases: ["Start a new first-party or third-party plugin"],
    examples: ["ecp plugins new jsonata"],
    cli: { args: ["name"] },
  })
  .withHandler(async (input) => {
    const name = String(input.name)
    const dir = pluginDir(name)
    await scaffoldPlugin(dir, name)
    return { dir, name }
  })
  .build()

/** `ecp plugins build`. @category CLI */
export const pluginsBuildOperation = defineOperation("plugins:build")
  .withInput(z.object({ dir: z.string().optional() }))
  .withMetadata({
    summary: "Generate oclif files for a plugin",
    description:
      "Write generated package.json fields, dist/oclif.js, and oclif.manifest.json from the compiled definition.",
    useCases: ["Refresh generated CLI files after changing a definition"],
    examples: ["ecp plugins build", "ecp plugins build plugins/plugin-jsonata"],
    cli: { args: ["dir"] },
  })
  .withHandler(async (input) => {
    const dir = resolve(input.dir ? String(input.dir) : process.cwd())
    try {
      return await buildPlugin(dir)
    } catch (err) {
      throw new EcpCliError(
        "ECP_PLUGIN_BUILD",
        err instanceof Error ? err.message : String(err),
        { exitCode: EXIT_FAILED }
      )
    }
  })
  .build()

/** `ecp plugins check`. @category CLI */
export const pluginsCheckOperation = defineOperation("plugins:check")
  .withInput(z.object({ dir: z.string().optional() }))
  .withMetadata({
    summary: "Fail if generated plugin files are stale",
    description: "Compare package.json, dist/oclif.js, and oclif.manifest.json to the compiled definition.",
    useCases: ["CI gate for plugin packages"],
    examples: ["ecp plugins check plugins/plugin-jsonata"],
    cli: { args: ["dir"] },
  })
  .withHandler(async (input) => {
    const dir = resolve(input.dir ? String(input.dir) : process.cwd())
    const report = await checkPlugin(dir)
    if (!report.ok) {
      throw new EcpCliError(
        "ECP_PLUGIN_STALE",
        report.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
        { exitCode: EXIT_USAGE, suggestions: ["Run ecp plugins build"] }
      )
    }
    return report
  })
  .build()
