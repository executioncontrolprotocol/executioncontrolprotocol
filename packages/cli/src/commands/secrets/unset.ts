import { Args, Command, Flags } from "@oclif/core"
import { withSecrets } from "../../lib/secrets.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp secrets unset`
 * @category CLI
 */
export default class SecretsUnset extends Command {
  static override description = "Delete a secret from the OS keychain."

  static override args = {
    key: Args.string({ required: true }),
  }

  static override flags = {
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(SecretsUnset)
    const existed = await withSecrets(async (secrets) => secrets.delete(args.key))
    if (!existed) {
      if (flags.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: false, error: { code: "ECP_NOT_FOUND", message: `Secret ${args.key} was not found.` } })}\n`,
        )
      } else this.error(`Secret ${args.key} was not found.`, { exit: 2 })
      exitWith(2)
    }
    if (flags.json) process.stdout.write(`${JSON.stringify({ key: args.key, unset: true })}\n`)
    else this.log(`unset ${args.key}`)
    exitWith(0)
  }
}
