import { Args, Command, Flags } from "@oclif/core"
import { withSecrets } from "../../lib/secrets.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp secrets unset`
 * @category CLI
 */
export default class SecretsUnset extends Command {
  static override description = "Remove a secret from the keychain; exit 2 when the key does not exist."

  static override args = {
    key: Args.string({ required: true, description: "Secret key to delete." }),
  }

  static override examples = [
    {
      description: "Deletes the key when present; missing keys return exit 2 with --json.",
      command: "<%= config.bin %> secrets unset anthropic/api-key",
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
    const { args, flags } = await this.parse(SecretsUnset)
    const existed = await withSecrets(async (secrets) => secrets.delete(args.key))
    if (!existed) {
      writeEnvelope(
        { ok: false, error: { code: "ECP_NOT_FOUND", message: `Secret ${args.key} was not found.` } },
        {
          json: flags.json,
          human: () => this.error(`Secret ${args.key} was not found.`, { exit: 2 }),
          exitCode: 2,
        },
      )
    }
    writeEnvelope(
      { ok: true, data: { key: args.key, unset: true } },
      {
        json: flags.json,
        human: () => this.log(`unset ${args.key}`),
        exitCode: 0,
      },
    )
  }
}