import { Args, Command } from "@oclif/core";

import { EXTENSION_SOURCE_TYPES, type ExtensionSourceType } from "@executioncontrolprotocol/spec";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import { ensureSecurityAreaObjects } from "../../../../../lib/config-wiring-ops.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

/**
 * Append a value to security.plugins.allowSourceTypes (builtin, npm, git, or local).
 */
export default class ConfigSecurityPluginsAllowSourceTypeAdd extends Command {
  static summary = "Add an extension source type to security.plugins.allowSourceTypes";

  static args = {
    type: Args.string({
      required: true,
      description: "One of: builtin, npm, git, local",
    }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityPluginsAllowSourceTypeAdd);
    const t = args.type.trim() as ExtensionSourceType;
    if (!(EXTENSION_SOURCE_TYPES as readonly string[]).includes(t)) {
      this.error(
        `Invalid source type "${t}". Expected one of: ${[...EXTENSION_SOURCE_TYPES].join(", ")}.`,
        { exit: 1 },
      );
    }

    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    ensureSecurityAreaObjects(config);
    const sec = touchSecurity(config);
    sec.plugins ??= {};
    sec.plugins.allowSourceTypes = addUnique(sec.plugins.allowSourceTypes, t) as ExtensionSourceType[];

    persistConfig(path, config);
    this.log(
      `Updated security.plugins.allowSourceTypes (${path}): ${sec.plugins.allowSourceTypes?.join(", ") ?? ""}`,
    );
  }
}
