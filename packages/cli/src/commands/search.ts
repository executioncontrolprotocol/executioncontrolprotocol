import { Args } from "@oclif/core"
import { runWithCommandError } from "../lib/command-helpers.js"
import { EnvModuleCommand } from "../lib/env-module-command.js"

/** Search environment capabilities by query string. */
export default class Search extends EnvModuleCommand {
  static summary = "Search environment capabilities"

  static description =
    "Fuzzy-match capabilities in --env by id or label. Quote multi-word queries."

  static examples = [
    '<%= config.bin %> <%= command.id %> "echo" --env examples/01-echo/environment.ts',
    "<%= config.bin %> <%= command.id %> slack --env environment.ts",
  ]

  static args = {
    query: Args.string({
      required: true,
      description: "Search query (capability id or label substring)",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Search)
    await runWithCommandError(this, async () => {
      const ecp = await this.loadEcp(flags)
      this.log(JSON.stringify(await ecp.search(args.query), null, 2))
    })
  }
}
