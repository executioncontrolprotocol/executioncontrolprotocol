import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../../lib/config-flags.js";
import { ensureSecurityAreaObjects } from "../../../../../lib/config-wiring-ops.js";
import {
  addUnique,
  persistConfig,
  readForMutation,
} from "../../../../../lib/system-config-cli.js";

export default class ConfigSecurityModelsAllowedModelsAdd extends Command {
  static summary = "Add a model name to security.models.allowedModels.<provider>";

  static args = {
    provider: Args.string({ required: true, description: "Model provider id" }),
    model: Args.string({ required: true, description: "Model name" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSecurityModelsAllowedModelsAdd);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    ensureSecurityAreaObjects(config);
    const sec = config.security!.models!;
    sec.allowedModels ??= {};
    const prov = args.provider;
    sec.allowedModels[prov] = addUnique(sec.allowedModels[prov], args.model);

    persistConfig(path, config);
    this.log(
      `Updated security.models.allowedModels.${prov} (${path}): ${sec.allowedModels[prov]?.join(", ")}`,
    );
  }
}
