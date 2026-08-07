import { Command } from "@oclif/core";

export default class ConfigSecretsProviders extends Command {
  static summary = "Inspect secret providers";

  async run(): Promise<void> {
    await this.parse(ConfigSecretsProviders);
    this.log(
      ["Usage: ecp config secrets providers <subcommand>", "", "  list    Show providers and availability", "  doctor  Health check each provider", ""].join(
        "\n",
      ),
    );
  }
}
