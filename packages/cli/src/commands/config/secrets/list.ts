import { Command } from "@oclif/core"
import { getCliSecretsStore } from "../../../lib/secrets/store.js"

/** List OS keychain secret keys. */
export default class ConfigSecretsList extends Command {
  static summary = "List secret keys in the OS keychain"

  async run(): Promise<void> {
    const store = getCliSecretsStore()
    const available = await store.isAvailable()
    if (!available) {
      this.error("OS keychain is not available on this system.", { exit: 1 })
    }

    const keys = await store.list()
    if (keys.length === 0) {
      this.log("(no entries)")
      return
    }
    for (const key of keys) {
      this.log(`  ${key}`)
    }
  }
}
