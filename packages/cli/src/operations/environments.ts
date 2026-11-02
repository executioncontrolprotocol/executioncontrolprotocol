import { z } from "zod"
import { loadWorkflowFile } from "@executioncontrolprotocol/node"
import {
  defineOperation,
  EcpCliError,
  ECP_WORKFLOW_LOAD,
  EXIT_USAGE,
} from "@executioncontrolprotocol/plugin-sdk"
import { EcpError } from "@executioncontrolprotocol/core/types"
import { CONFIG_FLAG_HELP } from "../lib/config-file.js"
import {
  packageJsonFromRequirements,
  packagesFromEnvironmentFile,
  writePackageJsonArtifact,
} from "../lib/export-environment.js"

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
    summary: "Inspect the process environment",
    description:
      "Subcommands: describe, search, invoke, export. The environment is the Node host plus installed plugins. Use --config for machine settings.",
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
      config: z.string().optional().describe(CONFIG_FLAG_HELP),
      format: z.enum(["package-json"]),
      output: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Export an environment to a foreign-runtime manifest",
    description:
      "Project the Node host, an optional --config file, and requirements inferred from a workflow into package.json. Never copies secret values.",
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
    const extra = input.config ? await packagesFromEnvironmentFile(String(input.config)) : []
    const document = packageJsonFromRequirements(requirements, extra)
    return writePackageJsonArtifact(document, input.output ? String(input.output) : undefined)
  })
  .build()
