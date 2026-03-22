import { Args, Command, Flags } from "@oclif/core";
import { readFileSync } from "node:fs";

import { commandErrorMessage } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../lib/system-config-cli.js";

export default class ConfigToolsAdd extends Command {
  static summary = "Add an MCP tool server entry (tools.servers.<name>)";

  static description =
    "Registers a logical server name for Context mounts. Pass the server block as JSON " +
    '(must include a "transport" object). Example: \'{"transport":{"type":"stdio","command":"docker","args":["run","-i","--rm","mcp/fetch"]}}\'';

  static args = {
    name: Args.string({
      required: true,
      description: "Logical server name (matches Context mount server:)",
    }),
  };

  static flags = {
    ...configScopeFlags,
    json: Flags.string({
      description: "JSON object for the tool server entry (e.g. {\"transport\":{...}})",
    }),
    file: Flags.string({
      description: "Path to a JSON file containing the tool server entry",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigToolsAdd);
    if (!flags.json && !flags.file) {
      this.error("Provide --json or --file with the tool server definition.", { exit: 1 });
    }
    if (flags.json && flags.file) {
      this.error("Use only one of --json or --file.", { exit: 1 });
    }

    const raw = flags.file ? readFileSync(flags.file, "utf-8") : String(flags.json);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      this.error(`Invalid JSON: ${commandErrorMessage(e)}`, { exit: 1 });
    }

    if (!parsed || typeof parsed !== "object" || !("transport" in (parsed as object))) {
      this.error('Tool server entry must be a JSON object with a "transport" field.', { exit: 1 });
    }

    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.tools ??= {};
    config.tools.servers ??= {};
    if (config.tools.servers[args.name]) {
      this.error(
        `Tool server "${args.name}" already exists. Use "ecp config tools update" to replace it.`,
        { exit: 1 },
      );
    }

    config.tools.servers[args.name] = parsed as { transport: Record<string, unknown> };

    persistConfig(path, config);
    this.log(`Added tool server "${args.name}" (${path})`);
  }
}
