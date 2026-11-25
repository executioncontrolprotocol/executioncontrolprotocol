import { Command, Flags } from "@oclif/core"
import { withSecrets } from "../../../lib/secrets.js"
import { printTable, writeEnvelope } from "../../../lib/output.js"

/**
 * `ecp config secrets list`
 * @category CLI
 */
export default class ConfigSecretsList extends Command {
  static override description =
    "List secret key names and sources (never values); use config secrets set before execute steps that reference $secret."

  static override examples = [
    {
      description: "Prints keys and keychain/env source; add --json for the envelope.",
      command: "<%= config.bin %> config secrets list",
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
    const { flags } = await this.parse(ConfigSecretsList)
    const rows = await withSecrets(async (secrets) => secrets.listDetailed())
    writeEnvelope(
      { ok: true, data: { items: rows } },
      {
        json: flags.json,
        human: () => {
          if (rows.length === 0) {
            this.log("No secrets stored.")
            return
          }
          printTable(
            [
              { key: "key", header: "key" },
              { key: "source", header: "source" },
            ],
            rows.map((row) => ({ key: row.key, source: row.source })),
          )
        },
        exitCode: 0,
      },
    )
  }
}