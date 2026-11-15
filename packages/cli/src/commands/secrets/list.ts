import { Command, Flags } from "@oclif/core"
import { withSecrets } from "../../lib/secrets.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp secrets list`
 * @category CLI
 */
export default class SecretsList extends Command {
  static override description = "List secret keys and their sources."

  static override flags = {
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(SecretsList)
    const rows = await withSecrets(async (secrets) => secrets.listDetailed())
    if (flags.json) process.stdout.write(`${JSON.stringify({ items: rows })}\n`)
    else {
      for (const row of rows) this.log(`${row.key}  ${row.source}`)
    }
    exitWith(0)
  }
}
