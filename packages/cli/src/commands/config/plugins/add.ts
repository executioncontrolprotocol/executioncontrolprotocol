import { Command } from "@oclif/core";

import {
  pluginInstallConfigArgs,
  pluginInstallConfigFlags,
  runPluginInstallConfigMutation,
} from "../../../lib/plugin-install-config-mutation.js";

/**
 * Add or replace `plugins.installs.<id>`; use `--install` to fetch and materialize under `.ecp/plugins/<id>`.
 *
 * @category CLI
 */
export default class ConfigPluginsAdd extends Command {
  static summary = "Add or replace plugins.installs.<id> (optional real install via --install)";

  static args = pluginInstallConfigArgs;

  static flags = pluginInstallConfigFlags;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigPluginsAdd);
    await runPluginInstallConfigMutation(this, args, flags);
  }
}
