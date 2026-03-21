import { Args, Command, Flags } from "@oclif/core";
import { readFileSync } from "node:fs";

import { commandErrorMessage } from "../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../lib/system-config-cli.js";

export default class ConfigToolsUpdate extends Command {
  static summary = "Update an MCP tool server entry (toolServers.<name>)";

  static description =
    "Replaces the server block for an existing name. Same shape as add (JSON with a \"transport\" object).";

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
    const { args, flags } = await this.parse(ConfigToolsUpdate);
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

    config.toolServers ??= {};
    if (!config.toolServers[args.name]) {
      this.error(`No tool server named "${args.name}". Use "ecp config tools add" first.`, { exit: 1 });
    }

    config.toolServers[args.name] = parsed as { transport: Record<string, unknown> };

    persistConfig(path, config);
    this.log(`Updated tool server "${args.name}" (${path})`);
  }
}
