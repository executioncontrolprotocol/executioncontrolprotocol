import { Command, Flags } from "@oclif/core"
import { withSecrets } from "../../lib/secrets.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp secrets list`
 * @category CLI
 */
export default class SecretsList extends Command {
  static override description =
    "List secret key names and sources (never values); use secrets set before execute steps that reference $secret."

  static override examples = [
    {
      description: "Prints keys and keychain/env source; add --json for the envelope.",
      command: "<%= config.bin %> secrets list",
    },
  ]

  static override flags = {
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(SecretsList)
    const rows = await withSecrets(async (secrets) => secrets.listDetailed())
    writeEnvelope(
      { ok: true, data: { items: rows } },
      {
        json: flags.json,
        human: () => {
          for (const row of rows) this.log(`${row.key}  ${row.source}`)
        },
        exitCode: 0,
      },
    )
  }
}