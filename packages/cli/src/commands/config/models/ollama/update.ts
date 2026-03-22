import { Args, Command } from "@oclif/core";

import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation } from "../../../../lib/system-config-cli.js";

export default class ConfigModelsOllamaUpdate extends Command {
  static summary = "Update models.providers.ollama.config.baseURL";

  static args = {
    url: Args.string({ required: true, description: "Ollama base URL (e.g. http://localhost:11434)" }),
  };

  static flags = { ...configScopeFlags };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigModelsOllamaUpdate);
    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    config.models ??= {};
    config.models.providers ??= {};
    config.models.providers.ollama ??= {};
    config.models.providers.ollama.config ??= {};
    config.models.providers.ollama.config.baseURL = args.url;

    persistConfig(path, config);
    this.log(`Updated ollama.baseURL = ${args.url} (${path})`);
  }
}
