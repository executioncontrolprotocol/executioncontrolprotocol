import { Args, Command } from "@oclif/core"
import { canonicalSecretKey } from "@executioncontrolprotocol/secrets"
import { getCliSecretsStore } from "../../../lib/secrets/store.js"

/** Remove an OS keychain secret. */
export default class ConfigSecretsRemove extends Command {
  static summary = "Remove a stored secret from the OS keychain"

  static args = {
    key: Args.string({
      required: true,
      description: "Lookup key (same form as add)",
    }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(ConfigSecretsRemove)
    const store = getCliSecretsStore()
    const available = await store.isAvailable()
    if (!available) {
      this.error("OS keychain is not available on this system.", { exit: 1 })
    }

    const key = canonicalSecretKey(args.key)
    await store.delete(key)
    this.log(`Removed secret for key "${key}".`)
  }
}
