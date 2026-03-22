import { Command, Flags } from "@oclif/core";
import { readFileSync } from "node:fs";

import type { PluginSecurityPolicy } from "@executioncontrolprotocol/spec";

import { commandErrorMessage } from "../../../../lib/command-helpers.js";
import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation, touchSecurity } from "../../../../lib/system-config-cli.js";

export default class ConfigSecurityPluginsUpdate extends Command {
  static summary = "Replace security.plugins (PluginSecurityPolicy JSON)";

  static description =
    "Sets allowKinds, allowSourceTypes, allowIds, denyIds, strict, etc. Replaces the whole security.plugins block.";

  static flags = {
    ...configScopeFlags,
    json: Flags.string({
      description: "JSON object (PluginSecurityPolicy)",
    }),
    file: Flags.string({
      description: "Path to a JSON file",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecurityPluginsUpdate);
    if (!flags.json && !flags.file) {
      this.error("Provide --json or --file.", { exit: 1 });
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

    if (!parsed || typeof parsed !== "object") {
      this.error("Security policy must be a JSON object.", { exit: 1 });
    }

    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.plugins = parsed as PluginSecurityPolicy;

    persistConfig(path, config);
    this.log(`Updated security.plugins (${path})`);
  }
}
