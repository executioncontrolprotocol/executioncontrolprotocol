import { Args, Command, Flags } from "@oclif/core"
import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import {
  canonicalSecretKey,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  secretRefIdFromLogicalKey,
} from "@executioncontrolprotocol/secrets"
import { getCliSecretsStore } from "../../../lib/secrets/store.js"

/** Store an OS keychain secret. */
export default class ConfigSecretsAdd extends Command {
  static summary = "Add or replace a secret in the OS keychain"

  static description =
    "Prompts interactively for the secret value by default. Use --value for non-interactive inline input."

  static examples = [
    "<%= config.bin %> <%= command.id %> server/fetch.token",
    "<%= config.bin %> <%= command.id %> GITHUB_API_KEY --value ghp_xxx",
  ]

  static args = {
    key: Args.string({
      required: true,
      description: `Secret lookup key (ref id is ${ECP_SECRET_REF_PROTOCOL_PREFIX}<key>)`,
    }),
  }

  static flags = {
    value: Flags.string({
      char: "v",
      description: "Secret value inline (non-interactive; avoid in shell history)",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecretsAdd)

    const store = getCliSecretsStore()
    const available = await store.isAvailable()
    if (!available) {
      this.error("OS keychain is not available on this system.", { exit: 1 })
    }

    let value = flags.value
    if (value === undefined) {
      const rl = createInterface({ input, output })
      try {
        value = (await rl.question("Paste secret value: ")).trim()
      } finally {
        rl.close()
      }
      if (!value) {
        this.error("Secret value cannot be empty.", { exit: 1 })
      }
    }

    const key = canonicalSecretKey(args.key)
    await store.set(key, value)
    this.log(`Stored secret "${key}" (${secretRefIdFromLogicalKey(key)}).`)
  }
}
