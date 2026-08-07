import { Flags } from "@oclif/core"
import type { DescribeQuery } from "@executioncontrolprotocol/types"
import { readJsonFile, runWithCommandError } from "../lib/command-helpers.js"
import { EnvModuleCommand } from "../lib/env-module-command.js"

/** Describe environment capabilities, extensions, and policies. */
export default class Describe extends EnvModuleCommand {
  static summary = "Describe an environment"

  static description =
    "Return a structured catalog of runtime features, extensions, capabilities, and policies for --env."

  static examples = [
    "<%= config.bin %> <%= command.id %> --env examples/01-echo/environment.ts",
    "<%= config.bin %> <%= command.id %> --env environment.ts --query query.json",
  ]

  static flags = {
    ...EnvModuleCommand.flags,
    query: Flags.string({
      description: "Path to JSON file with a DescribeQuery filter object",
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Describe)
    await runWithCommandError(this, async () => {
      const ecp = await this.loadEcp(flags)
      const query = flags.query
        ? await readJsonFile<DescribeQuery>(flags.query, "--query")
        : undefined
      this.log(JSON.stringify(await ecp.describe(query), null, 2))
    })
  }
}
