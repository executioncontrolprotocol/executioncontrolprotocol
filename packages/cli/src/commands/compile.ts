import { Args, Command, Flags } from "@oclif/core"
import { compileWorkflowSource } from "@executioncontrolprotocol/core/compile"
import { readFile, writeFile } from "node:fs/promises"
import { runWithCommandError } from "../lib/command-helpers.js"

/** Compile a workflow source file to a portable JSON manifest. */
export default class Compile extends Command {
  static summary = "Compile a workflow to JSON"

  static description =
    "Bundle and evaluate a workflow module (.ts or .js), or load .json, and emit the workflow manifest."

  static examples = [
    "<%= config.bin %> <%= command.id %> examples/01-echo/workflow.ts",
    "<%= config.bin %> <%= command.id %> examples/01-echo/workflow.ts -o dist/workflow.json",
  ]

  static flags = {
    ...Command.baseFlags,
    output: Flags.string({
      char: "o",
      description: "Write manifest JSON to this file (stdout if omitted)",
    }),
  }

  static args = {
    "workflow-path": Args.string({
      required: true,
      description: "Workflow file (.ts, .js, or .json)",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Compile)
    await runWithCommandError(this, async () => {
      const input = args["workflow-path"]
      const source = await readFile(input, "utf8")
      const result = await compileWorkflowSource({ source, filename: input })
      if (!result.ok) {
        this.log(JSON.stringify(result, null, 2))
        this.exit(1)
      }
      const json = JSON.stringify(result.manifest, null, 2)
      if (flags.output) await writeFile(flags.output, json, "utf8")
      else this.log(json)
    })
  }
}
