import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { Command, Flags } from "@oclif/core"
import { discoverOps } from "../lib/host-discovery.js"
import { hostUnavailableEnvelope, isHostUnavailableError } from "../lib/host-unavailable.js"
import { ecpHome } from "../lib/home.js"
import { writeEnvelope } from "../lib/output.js"

/**
 * `ecp schema`
 * @category CLI
 */
export default class Schema extends Command {
  static override description =
    "Print the editor execution JSON Schema path or file; use retrieve for capabilities instead."

  static override examples = [
    {
      description: "Prints the schema file path after warming the host; add --print to dump the file.",
      command: "<%= config.bin %> schema --print",
    },
  ]

  static override flags = {
    print: Flags.boolean({
      description: "Print schema file contents (human) or parsed schema in the envelope with --json.",
      default: false,
    }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(Schema)
    const home = ecpHome()
    const schemaPath = path.join(home, "schema", "execution.schema.json")
    let ops
    try {
      ops = await discoverOps({ autoStart: false })
    } catch (error) {
      if (isHostUnavailableError(error)) {
        writeEnvelope(hostUnavailableEnvelope(error), {
          json: flags.json,
          human: () => this.error(error.message, { exit: 4 }),
          exitCode: 4,
        })
      }
      throw error
    }
    try {
      await ops.retrieve({ type: "plugin", limit: 1 })
    } finally {
      await ops.close()
    }
    if (!existsSync(schemaPath)) {
      writeEnvelope(
        { ok: false, error: { code: "ECP_NOT_FOUND", message: `Schema file missing at ${schemaPath}` } },
        {
          json: flags.json,
          human: () => this.error(`Schema file missing at ${schemaPath}`, { exit: 1 }),
          exitCode: 1,
        },
      )
    }
    const text = readFileSync(schemaPath, "utf8")
    if (flags.print) {
      if (flags.json) {
        const schema = JSON.parse(text) as Record<string, unknown>
        writeEnvelope({ ok: true, data: { path: schemaPath, schema } }, { json: true, exitCode: 0 })
      }
      writeEnvelope(
        { ok: true, data: { path: schemaPath } },
        {
          human: () => process.stdout.write(text.endsWith("\n") ? text : `${text}\n`),
          exitCode: 0,
        },
      )
    }
    writeEnvelope(
      { ok: true, data: { path: schemaPath } },
      {
        json: flags.json,
        human: () => process.stdout.write(`${schemaPath}\n`),
        exitCode: 0,
      },
    )
  }
}