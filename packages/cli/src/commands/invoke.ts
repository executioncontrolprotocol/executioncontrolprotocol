import { Args, Flags } from "@oclif/core"
import type { InvokeResult } from "@executioncontrolprotocol/types"
import { readJsonFile, runWithCommandError } from "../lib/command-helpers.js"
import { EnvModuleCommand } from "../lib/env-module-command.js"

/** Invoke a single capability outside a workflow run. */
export default class Invoke extends EnvModuleCommand {
  static summary = "Invoke a capability"

  static description =
    "Call a registered capability by id using the runtime and extensions from --env, " +
    "without running a workflow. Prints an InvokeResult JSON document."

  static examples = [
    "<%= config.bin %> <%= command.id %> @executioncontrolprotocol/test.echo --env examples/01-echo/environment.ts --input input.json",
    "<%= config.bin %> <%= command.id %> @executioncontrolprotocol/harness-browser-nano.evaluate --env environment.ts --input in.json --uses @executioncontrolprotocol/ollama.generate",
  ]

  static args = {
    "capability-id": Args.string({
      required: true,
      description: "Capability id to invoke (e.g. @executioncontrolprotocol/test.echo)",
    }),
  }

  static flags = {
    ...EnvModuleCommand.flags,
    input: Flags.string({
      description: "Path to JSON file with capability input object",
    }),
    uses: Flags.string({
      description: "Optional provider capability override (harness .uses)",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Invoke)
    let result: InvokeResult | undefined
    await runWithCommandError(this, async () => {
      const input = flags.input
        ? await readJsonFile(flags.input, "--input")
        : {}
      const ecp = await this.loadEcp(flags)
      let builder = ecp.invoke(args["capability-id"]).with(input)
      if (flags.uses) builder = builder.uses(flags.uses)
      result = await builder.process()
      this.log(JSON.stringify(result, null, 2))
    })
    if (result !== undefined && !result.success) {
      this.error("Capability invoke did not succeed", { exit: 1 })
    }
  }
}
