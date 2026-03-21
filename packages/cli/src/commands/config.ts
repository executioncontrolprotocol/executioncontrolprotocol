import { Command } from "@oclif/core";
import { OS_PROVIDER_ID } from "../lib/secret-provider-ids.js";

export default class Config extends Command {
  static summary = "Manage ECP system configuration";

  static description = `Inspect and edit system config (project ecp.config.* or global ~/.ecp/).

Subcommands cover plugins, model providers, MCP tool servers, loggers, secrets, and A2A endpoints.
You can also edit the file directly — use "ecp config path" for the resolved path.`;

  static examples = [
    "ecp config init",
    "ecp config init --global",
    "ecp config get",
    "ecp config path --global",
    "ecp config plugins get",
    "ecp config models allow add ollama llama3.2:3b",
    "ecp config tools add fetch --json '{\"transport\":{\"type\":\"stdio\",\"command\":\"docker\",\"args\":[\"run\",\"-i\",\"--rm\",\"mcp/fetch\"]}}'",
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
        "  path              Print config file path",
        "  get               Print merged config (YAML or JSON)",
        "  plugins           CRUD for plugin allow-lists, defaults, security",
        "  models            CRUD for model providers and allowed models",
        "  tools             CRUD for MCP tool servers",
        "  loggers           CRUD for logger policy and per-logger config",
        `  secrets           Store/list secrets (${OS_PROVIDER_ID}, …)`,
        "  endpoints         CRUD for A2A agent endpoint URLs",
        "",
        "Resource commands use verbs: add, get, remove, update (see ecp config <topic> --help).",
        "Run ecp config --help for flags and full help.",
      ].join("\n"),
    );
  }
}
