import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import {
  isModelProviderId,
  persistConfig,
  readForMutation,
  removeId,
} from "../../../../lib/system-config-cli.js";

export default class ConfigModelsAllowRemove extends Command {
  static summary = "Remove a model from models.providers.<provider>.allowedModels";

  static args = {
    provider: Args.string({
      required: true,
      description: "Model provider",
      options: ["openai", "ollama"],
    }),
    model: Args.string({ required: true, description: "Model name" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigModelsAllowRemove);
    if (!isModelProviderId(args.provider)) {
      this.error(`Invalid provider: ${args.provider}`, { exit: 1 });
    }
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.models ??= {};
    config.models.providers ??= {};
    const prov = args.provider;
    config.models.providers[prov] ??= {};
    const block = config.models.providers[prov]!;
    block.allowedModels = removeId(block.allowedModels, args.model);

    persistConfig(path, config);
    this.log(`Updated ${prov}.allowedModels (${path}): ${block.allowedModels?.join(", ") ?? "(empty)"}`);
  }
}
