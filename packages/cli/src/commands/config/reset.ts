import { Command } from "@oclif/core";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

import { configScopeFlags } from "../../lib/config-flags.js";
import {
  getGlobalSystemConfigCandidatePaths,
  getLocalSystemConfigPaths,
} from "../../lib/system-config-cli.js";

export default class ConfigReset extends Command {
  static summary = "Remove system config file(s) in the current scope";

  static description =
    "Deletes project **ecp.config.yaml** and **ecp.config.json** in the working directory, or all known files under **~/.ecp/** when **--global** is set. " +
    "Use **--config** to remove a single explicit path. Idempotent when nothing exists.";

  static flags = {
    ...configScopeFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigReset);
    const global = flags.global as boolean;
    const explicit = flags.config as string | undefined;
    const cwd = process.cwd();

    const paths: string[] = explicit
      ? [resolve(explicit)]
      : global
        ? getGlobalSystemConfigCandidatePaths()
        : getLocalSystemConfigPaths(cwd);

    const removed: string[] = [];
    for (const p of paths) {
      if (existsSync(p)) {
        unlinkSync(p);
        removed.push(p);
      }
    }

    if (removed.length === 0) {
      const scope = explicit ? explicit : global ? "global (~/.ecp/)" : "project (./ecp.config.*)";
      this.log(`No system config file found for ${scope}.`);
      return;
    }

    for (const p of removed) {
      this.log(`Removed ${p}`);
    }
  }
}
