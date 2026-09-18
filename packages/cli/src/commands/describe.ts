import { Flags } from "@oclif/core"
import type { DescribeQuery } from "@executioncontrolprotocol/types"
import { readJsonFile, runWithCommandError } from "../lib/command-helpers.js"
import { EnvModuleCommand } from "../lib/env-module-command.js"

/** Describe environment capabilities, extensions, and policies. */
export default class Describe extends EnvModuleCommand {
  static summary = "Describe an environment"

  static description =
    "Return a structured catalog of runtime features, extensions, capabilities, and policies for --env. " +
    "Bare describe is a light inventory (id + summary). Pass --capability or --extension for exact-id detail " +
    "(full metadata + JSON Schema I/O)."

  static examples = [
    "<%= config.bin %> <%= command.id %> --env examples/01-echo/environment.ts",
    "<%= config.bin %> <%= command.id %> --env environment.ts --capability @executioncontrolprotocol/test.echo",
    "<%= config.bin %> <%= command.id %> --env environment.ts --extension @executioncontrolprotocol/test",
    "<%= config.bin %> <%= command.id %> --env environment.ts --query query.json",
  ]

  static flags = {
    ...EnvModuleCommand.flags,
    query: Flags.string({
      description: "Path to JSON file with a DescribeQuery filter object",
    }),
    capability: Flags.string({
      description:
        "Exact capability id for detail describe (metadata + JSON Schema). Maps to capabilities.match + mode exact.",
    }),
    extension: Flags.string({
      description:
        "Exact extension id for detail describe (metadata). Maps to extensions.match + mode exact.",
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Describe)
    await runWithCommandError(this, async () => {
      const ecp = await this.loadEcp(flags)
      let query = flags.query
        ? await readJsonFile<DescribeQuery>(flags.query, "--query")
        : undefined
      if (flags.capability || flags.extension) {
        query = {
          ...(query ?? {}),
          ...(flags.capability
            ? {
                capabilities: {
                  ...(query?.capabilities ?? {}),
                  match: flags.capability,
                  mode: "exact" as const,
                },
              }
            : {}),
          ...(flags.extension
            ? {
                extensions: {
                  ...(query?.extensions ?? {}),
                  match: flags.extension,
                  mode: "exact" as const,
                },
              }
            : {}),
        }
      }
      this.log(JSON.stringify(await ecp.describe(query), null, 2))
    })
  }
}
