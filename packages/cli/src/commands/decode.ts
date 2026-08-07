import { Args, Flags } from "@oclif/core"
import { readFile, writeFile } from "node:fs/promises"
import { runWithCommandError } from "../lib/command-helpers.js"
import { EnvModuleCommand } from "../lib/env-module-command.js"
import { formatToExtensionId, parseCliFormat } from "../lib/format-cli.js"

/** Decode TOON or JSON into a workflow manifest. */
export default class Decode extends EnvModuleCommand {
  static summary = "Decode encoded workflow content to JSON manifest"

  static description =
    "Read encoded workflow text and decode using format extensions bound in --env (default: JSON)."

  static examples = [
    "<%= config.bin %> <%= command.id %> workflow.toon --format toon --env environment.ts -o workflow.json",
  ]

  static flags = {
    ...EnvModuleCommand.flags,
    format: Flags.string({
      description: "Input format: json or toon",
      default: "json",
    }),
    output: Flags.string({
      char: "o",
      description: "Write manifest JSON to this file (stdout if omitted)",
    }),
    strict: Flags.boolean({
      description: "Fail when decoded manifest is invalid",
      default: false,
    }),
  }

  static args = {
    "input-path": Args.string({
      required: true,
      description: "Encoded workflow file",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Decode)
    await runWithCommandError(this, async () => {
      const format = parseCliFormat(flags.format)
      if (format === "fluent") {
        throw new Error("Fluent decode is not supported; use ecp compile for Fluent → manifest.")
      }

      const ecp = await this.loadEcp(flags)
      const raw = await readFile(args["input-path"], "utf8")
      const content =
        format === "json" && raw.trimStart().startsWith("{")
          ? JSON.parse(raw)
          : raw

      const extId = formatToExtensionId(format)
      if (!extId) {
        throw new Error(`Unknown format: ${format}`)
      }
      let op = ecp.decode(content).uses(extId)
      if (flags.strict) op = op.strict()
      op = op.to("@executioncontrolprotocol.workflow")

      const decoded = await op.process()
      if (!decoded.success) {
        throw new Error(
          decoded.diagnostics.map((d) => d.message).join("; ") || "Decode failed"
        )
      }
      const json = JSON.stringify(decoded.result, null, 2)

      if (flags.output) await writeFile(flags.output, json, "utf8")
      else this.log(json)
    })
  }
}
