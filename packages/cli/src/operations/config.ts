import { access } from "node:fs/promises"
import { z } from "zod"
import { defineOperation, EcpCliError, ECP_INPUT_INVALID, EXIT_USAGE } from "@executioncontrolprotocol/plugin-sdk"
import { openInEditor } from "../lib/editor.js"
import {
  defaultConfigPath,
  existingConfigFile,
  writeConfigTemplate,
} from "../lib/config-file.js"

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function requireConfigDir(configDir: string | undefined): string {
  if (!configDir) {
    throw new EcpCliError(ECP_INPUT_INVALID, "CLI config directory is not set.", {
      exitCode: EXIT_USAGE,
    })
  }
  return configDir
}

/** `ecp config` topic help. @category CLI */
export const configTopicOperation = defineOperation("config")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Manage local CLI configuration",
    description:
      "Host-local settings for this machine, not workflow files. Subcommands: init, edit, secrets. Machine config lives in config.ecp.ts; variables and secrets are stored here.",
    useCases: ["Keep machine-local values out of workflow files"],
  })
  .withHandler(async () =>
    [
      "Usage: ecp config <subcommand>",
      "",
      "  init       Scaffold ~/.ecp/config/config.ecp.ts",
      "  edit       Print the config file path, then open it",
      "  secrets    Store and inspect OS keychain values",
      "",
      "Keep variables and secrets out of workflow files.",
      "Run ecp config <cmd> --help for flags.",
    ].join("\n")
  )
  .build()

/** `ecp config init`. @category CLI */
export const configInitOperation = defineOperation("config:init")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Scaffold the default config file",
    description:
      "Write config.ecp.ts in the global ECP config directory. Refuses if the file already exists.",
    useCases: ["Create a host-wide config file for shared plugin settings"],
    examples: ["ecp config init"],
  })
  .withHandler(async (_input, ctx) => {
    const configDir = requireConfigDir(ctx.config.configDir)
    const existing = await existingConfigFile(configDir)
    if (existing) {
      throw new EcpCliError(ECP_INPUT_INVALID, `Config file already exists: ${existing}`, {
        exitCode: EXIT_USAGE,
        suggestions: ["ecp config edit"],
      })
    }
    const path = defaultConfigPath(configDir)
    await writeConfigTemplate(path)
    return { path }
  })
  .build()

/** `ecp config edit`. @category CLI */
export const configEditOperation = defineOperation("config:edit")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Print and open the default config file",
    description:
      "Resolve the user config file, print its path, scaffold it when missing, then open $VISUAL or $EDITOR.",
    useCases: ["Find and edit host-wide plugin settings"],
    examples: ["ecp config edit"],
  })
  .withHandler(async (_input, ctx) => {
    const configDir = requireConfigDir(ctx.config.configDir)
    const existing = await existingConfigFile(configDir)
    const path = existing ?? defaultConfigPath(configDir)
    if (!(await pathExists(path))) await writeConfigTemplate(path)
    await openInEditor(path)
    return { path }
  })
  .build()
