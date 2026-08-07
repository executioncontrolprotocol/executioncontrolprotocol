import { Command } from "@oclif/core"
import { ECP_SECRET_REF_PROTOCOL_PREFIX } from "@executioncontrolprotocol/secrets"

/** Manage OS keychain secrets. */
export default class ConfigSecrets extends Command {
  static summary = "Manage OS keychain secrets"

  static description = `Store and inspect secret values in the OS keychain (outside config files).

Subcommands:
  add|get|remove|list     CRUD-style commands for OS secrets`

  static examples = [
    "ecp config secrets add server/fetch.token",
    "ecp config secrets add GITHUB_API_KEY --value ghp_xxx",
    "ecp config secrets get server/fetch.token",
    "ecp config secrets list",
  ]

  async run(): Promise<void> {
    await this.parse(ConfigSecrets)
    this.log(
      [
        "Usage: ecp config secrets <subcommand>",
        "",
        "  add KEY   Add or replace a secret (interactive paste; use --value for inline)",
        "  get KEY   Read a secret (default: redacted preview; use --reveal for full value)",
        "  remove KEY  Remove a stored secret",
        "  list      List keys",
        "",
        `Ref ids use the form ${ECP_SECRET_REF_PROTOCOL_PREFIX}<key>.`,
        "Run ecp config secrets <cmd> --help for flags.",
      ].join("\n")
    )
  }
}
