import { access } from "node:fs/promises"
import { z } from "zod"
import { loadWorkflowFile } from "@executioncontrolprotocol/node"
import {
  defineOperation,
  EcpCliError,
  ECP_INPUT_INVALID,
  ECP_WORKFLOW_LOAD,
  EXIT_USAGE,
} from "@executioncontrolprotocol/plugin-sdk"
import { EcpError } from "@executioncontrolprotocol/core/types"
import { openInEditor } from "../lib/editor.js"
import {
  defaultEnvironmentPath,
  existingEnvironmentFile,
  writeEnvironmentTemplate,
} from "../lib/environment-file.js"
import {
  packageJsonFromRequirements,
  packagesFromEnvironmentFile,
  writePackageJsonArtifact,
} from "../lib/export-environment.js"

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

function asLoadError(err: unknown): never {
  if (err instanceof EcpCliError) throw err
  if (err instanceof EcpError) {
    throw new EcpCliError(err.code, err.message, {
      path: err.path,
      suggestions: err.suggestions,
      exitCode: err.code === ECP_WORKFLOW_LOAD ? EXIT_USAGE : 1,
      details: err.details,
    })
  }
  throw err
}

/** `ecp environments` topic help. @category CLI */
export const environmentsTopicOperation = defineOperation("environments")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Inspect and author the process environment",
    description:
      "Subcommands: describe, search, invoke, export, init, edit. Omit --env to use the process host or ~/.ecp/config/environment.ecp.ts.",
    useCases: ["Describe installed capabilities"],
  })
  .withHandler(async () =>
    [
      "Usage: ecp environments <subcommand>",
      "",
      "  describe [id]        Catalog of extensions, capabilities, and policies",
      "  search QUERY         Rank installed capabilities for an intent",
      "  invoke CAPABILITY    Call one capability without a workflow",
      "  export               Project the environment to package.json",
      "  init                 Scaffold ~/.ecp/config/environment.ecp.ts",
      "  edit                 Print the environment file path, then open it",
      "",
      "Run ecp environments <cmd> --help for flags.",
    ].join("\n")
  )
  .build()

/** `ecp environments export`. @category CLI */
export const environmentsExportOperation = defineOperation("environments:export")
  .withInput(
    z.object({
      "workflow-path": z.string().optional(),
      env: z.string().optional(),
      format: z.enum(["package-json"]),
      output: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Export an environment to a foreign-runtime manifest",
    description:
      "Project the Node host, an optional --env file, and requirements inferred from a workflow into package.json. Never copies secret values.",
    useCases: ["Generate package.json dependencies from a workflow and environment"],
    examples: [
      "ecp environments export --format package-json",
      "ecp environments export brief.ecp.ts --format package-json --output package.json",
    ],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input) => {
    let requirements
    if (input["workflow-path"]) {
      try {
        const loaded = await loadWorkflowFile(String(input["workflow-path"]))
        requirements = loaded.requirements.requirements
      } catch (err) {
        asLoadError(err)
      }
    }
    const extra = input.env ? await packagesFromEnvironmentFile(String(input.env)) : []
    const document = packageJsonFromRequirements(requirements, extra)
    return writePackageJsonArtifact(document, input.output ? String(input.output) : undefined)
  })
  .build()

/** `ecp environments init`. @category CLI */
export const environmentsInitOperation = defineOperation("environments:init")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Scaffold the default environment file",
    description:
      "Write environment.ecp.ts in the global ECP config directory. Refuses if the file already exists.",
    useCases: ["Create a host-wide environment file for shared plugin config"],
    examples: ["ecp environments init"],
  })
  .withHandler(async (_input, ctx) => {
    const configDir = requireConfigDir(ctx.config.configDir)
    const existing = await existingEnvironmentFile(configDir)
    if (existing) {
      throw new EcpCliError(
        ECP_INPUT_INVALID,
        `Environment file already exists: ${existing}`,
        {
          exitCode: EXIT_USAGE,
          suggestions: ["ecp environments edit"],
        }
      )
    }
    const path = defaultEnvironmentPath(configDir)
    await writeEnvironmentTemplate(path)
    return { path }
  })
  .build()

/** `ecp environments edit`. @category CLI */
export const environmentsEditOperation = defineOperation("environments:edit")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Print and open the default environment file",
    description:
      "Resolve the user environment file, print its path, scaffold it when missing, then open $VISUAL or $EDITOR.",
    useCases: ["Find and edit host-wide plugin config"],
    examples: ["ecp environments edit"],
  })
  .withHandler(async (_input, ctx) => {
    const configDir = requireConfigDir(ctx.config.configDir)
    const existing = await existingEnvironmentFile(configDir)
    const path = existing ?? defaultEnvironmentPath(configDir)
    if (!(await pathExists(path))) await writeEnvironmentTemplate(path)
    await openInEditor(path)
    return { path }
  })
  .build()
