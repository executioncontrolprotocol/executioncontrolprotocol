import { Args, Command } from "@oclif/core";

import { EXTENSION_SOURCE_TYPES, type ExtensionSourceType } from "@executioncontrolprotocol/spec";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import { ensureSecurityAreaObjects } from "../../../../../lib/config-wiring-ops.js";
import {
  persistConfig,
  readForMutation,
  removeId,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

/**
 * Remove a value from security.plugins.allowSourceTypes.
 */
export default class ConfigSecurityPluginsAllowSourceTypeRemove extends Command {
  static summary = "Remove an extension source type from security.plugins.allowSourceTypes";

  static args = {
    type: Args.string({
      required: true,
      description: "One of: builtin, npm, git, local",
    }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityPluginsAllowSourceTypeRemove);
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
    sec.plugins.allowSourceTypes = removeId(sec.plugins.allowSourceTypes, t) as ExtensionSourceType[];

    persistConfig(path, config);
    this.log(
      `Updated security.plugins.allowSourceTypes (${path}): ${sec.plugins.allowSourceTypes?.join(", ") ?? "(empty)"}`,
    );
  }
}
