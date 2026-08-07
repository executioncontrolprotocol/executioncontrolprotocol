import { Args, Flags } from "@oclif/core"
import { loadWorkflowFile } from "@executioncontrolprotocol/core/loaders"
import { writeFile } from "node:fs/promises"
import { runWithCommandError } from "../lib/command-helpers.js"
import { EnvModuleCommand } from "../lib/env-module-command.js"
import { formatToExtensionId, parseCliFormat } from "../lib/format-cli.js"

/** Encode a workflow manifest to TOON, Fluent, or JSON. */
export default class Encode extends EnvModuleCommand {
  static summary = "Encode a workflow to another format"

  static description =
    "Load a workflow (.ts, .js, or .json) and encode it using format extensions bound in --env (default: JSON)."

  static examples = [
    "<%= config.bin %> <%= command.id %> workflow.json --format toon --env environment.ts -o workflow.toon",
    "<%= config.bin %> <%= command.id %> workflow.json --format fluent --env environment.ts -o workflow.generated.ts",
  ]

  static flags = {
    ...EnvModuleCommand.flags,
    format: Flags.string({
      description: "Output format: json, toon, or fluent",
      default: "json",
    }),
    output: Flags.string({
      char: "o",
      description: "Write encoded output to this file (stdout if omitted)",
    }),
    compact: Flags.boolean({
      description: "Compact output when supported by the format",
      default: false,
    }),
  }

  static args = {
    "input-path": Args.string({
      required: true,
      description: "Workflow file (.ts, .js, or .json)",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Encode)
    await runWithCommandError(this, async () => {
      const format = parseCliFormat(flags.format)
      const ecp = await this.loadEcp(flags)
      const manifest = await loadWorkflowFile(args["input-path"])

      const extId = formatToExtensionId(format)
      if (!extId) {
        throw new Error(`Unknown format: ${format}`)
      }
      let op = ecp.encode(manifest).uses(extId)
      if (flags.compact) op = op.compact()

      const encoded = await op.process()
      if (!encoded.success) {
        throw new Error(
          encoded.diagnostics.map((d) => d.message).join("; ") || "Encode failed"
        )
      }
      const out =
        typeof encoded.result === "string"
          ? encoded.result
          : JSON.stringify(encoded.result, null, flags.compact ? 0 : 2)

      if (flags.output) await writeFile(flags.output, out, "utf8")
      else this.log(out)
    })
  }
}
