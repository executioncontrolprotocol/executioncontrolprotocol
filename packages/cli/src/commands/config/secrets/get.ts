import { Args, Command, Flags } from "@oclif/core"
import {
  canonicalSecretKey,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  redactSecret,
} from "@executioncontrolprotocol/secrets"
import { getCliSecretsStore } from "../../../lib/secrets/store.js"

/** Read an OS keychain secret. */
export default class ConfigSecretsGet extends Command {
  static summary = "Read a secret (redacted by default)"

  static args = {
    key: Args.string({
      required: true,
      description: `Lookup key (ref id is ${ECP_SECRET_REF_PROTOCOL_PREFIX}<key>)`,
    }),
  }

  static flags = {
    reveal: Flags.boolean({
      description: "Print full value (writes to stdout — avoid logs)",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecretsGet)
    const store = getCliSecretsStore()
    const available = await store.isAvailable()
    if (!available) {
      this.error("OS keychain is not available on this system.", { exit: 1 })
    }

    const key = canonicalSecretKey(args.key)
    const value = await store.get(key)
    if (value == null) {
      this.error(`No secret for key "${key}".`, { exit: 1 })
    }
    if (flags.reveal) {
      this.warn("Printing full secret to stdout — ensure this is not logged or captured.")
      this.log(value)
    } else {
      this.log(redactSecret(value))
    }
  }
}
