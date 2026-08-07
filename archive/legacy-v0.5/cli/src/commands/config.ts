import { Command } from "@oclif/core";
import { OS_PROVIDER_ID } from "../lib/secret-provider-ids.js";

export default class Config extends Command {
  static summary = "Manage ECP system configuration";

  static description = `Inspect and edit system config (project ecp.config.* or global ~/.ecp/).

Wiring (data plane): \`ecp config add|remove|get|update --type tools|models|loggers|endpoints\`.
Policy (allow/deny): \`ecp config security …\` only.
Plugins installs and secrets store ops keep their topics.`;

  static examples = [
    "ecp config init",
    "ecp config init --global",
    "ecp config reset",
    "ecp config reset --global",
    "ecp config get",
    "ecp config get --type tools",
    'ecp config add --type tools fetch --transport-type stdio --stdio-command npx --stdio-arg -y --stdio-arg @modelcontextprotocol/server-fetch',
    "ecp config security models allowed-models add ollama llama3.2:3b",
    `ecp config secrets add --provider ${OS_PROVIDER_ID} --key server/fetch.token --prompt`,
    "ecp config secrets providers doctor",
  ];

  async run(): Promise<void> {
    await this.parse(Config);
    this.log(
      [
        "Usage: ecp config <subcommand>",
        "",
        "  init              Write best-practices default if missing",
        "  reset             Remove config file(s) (local, --global, or --config)",
        "  path              Print config file path",
        "  get               Full config, or slice: --type tools|models|loggers|endpoints [--id for loggers]",
        "  add               Wiring: --type tools|models|loggers|endpoints …",
        "  update            Wiring: --type …",
        "  remove            Wiring: --type …",
        "  security          All allow/deny/default policy (security.*)",
        "  plugins           installs list/add/remove; get",
        `  secrets           Store ops + yaml get/set-default-provider/set-policy`,
        "",
        "Run ecp config --help for flags. Run ecp config security (no args) for policy command list.",
      ].join("\n"),
    );
  }
}
