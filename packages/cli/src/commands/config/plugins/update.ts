import { Command } from "@oclif/core";

import {
  pluginInstallConfigArgs,
  pluginInstallConfigFlags,
  runPluginInstallConfigMutation,
} from "../../../lib/plugin-install-config-mutation.js";

/**
 * Update `plugins.installs.<id>` with the same options as `ecp config plugins add` (replaces the entry).
 *
 * @category CLI
 */
export default class ConfigPluginsUpdate extends Command {
  static summary = "Replace plugins.installs.<id> (same flags as add; --upgrade re-fetches existing npm/git source)";

  static args = pluginInstallConfigArgs;

  static flags = pluginInstallConfigFlags;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigPluginsUpdate);
    await runPluginInstallConfigMutation(this, args, flags);
  }
}
