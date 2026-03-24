import { Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import { ensureSecurityAreaObjects } from "../../../../../lib/config-wiring-ops.js";
import {
  persistConfig,
  readForMutation,
  touchSecurity,
} from "../../../../../lib/system-config-cli.js";

/**
 * Set security.plugins.allowThirdParty to false (merge; other plugin policy fields preserved).
 */
export default class ConfigSecurityPluginsThirdPartyDisable extends Command {
  static summary = "Disable third-party plugins (security.plugins.allowThirdParty = false)";

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecurityPluginsThirdPartyDisable);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    ensureSecurityAreaObjects(config);
    const sec = touchSecurity(config);
    sec.plugins ??= {};
    sec.plugins.allowThirdParty = false;

    persistConfig(path, config);
    this.log(`Disabled security.plugins.allowThirdParty (${path})`);
  }
}
