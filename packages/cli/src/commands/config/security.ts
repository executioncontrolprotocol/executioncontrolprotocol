import { Command } from "@oclif/core";

export default class ConfigSecurity extends Command {
  static summary = "Edit security.* policy (allow/deny/default lists and security.plugins)";

  static description = `All allow/deny style configuration goes under this topic.

Examples:
  ecp config security get
  ecp config security models allow add ollama
  ecp config security models default add openai
  ecp config security models allowed-models add ollama llama3.2
  ecp config security tools allow add fetch
  ecp config security loggers allow add file
  ecp config security plugins update --allow-kind provider --allow-source-type builtin

Wiring (tools.servers, models.providers blobs, loggers.config, agents.endpoints) uses:
  ecp config add|update|remove|get --type …`;

  async run(): Promise<void> {
    await this.parse(ConfigSecurity);
    this.log(
      [
        "Usage: ecp config security <subcommand>",
        "",
        "  get                      Print security.* (YAML or JSON)",
        "",
        "  models allow add|remove <id>           (security.models.allowProviders)",
        "  models default add|remove <id>         (security.models.defaultProviders)",
        "  models allowed-models add|remove <provider> <model>",
        "",
        "  tools allow add|remove <name>          (security.tools.allowServers)",
        "",
        "  loggers allow add|remove <id>",
        "  loggers default add|remove <id>",
        "",
        "  agents allow add|remove <name>",
        "  agents default add|remove <name>",
        "",
        "  executors allow add|remove <id>",
        "  executors default add|remove <id>",
        "",
        "  memory allow add|remove <id>",
        "  memory default set <id>                (security.memory.defaultStore)",
        "",
        "  secrets allow add|remove <id>          (security.secrets.allowProviders)",
        "",
        "  plugins update           Replace security.plugins (JSON)",
        "",
        "Run ecp config security <cmd> --help for flags.",
      ].join("\n"),
    );
  }
}
