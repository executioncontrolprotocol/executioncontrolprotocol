import { Command, Flags } from "@oclif/core";
import { resolve } from "node:path";

import { parseSystemConfigString, saveSystemConfig } from "@executioncontrolprotocol/runtime";

import { DEFAULT_ECP_SYSTEM_CONFIG_YAML } from "../../lib/default-ecp-config.js";
import { configScopeFlags } from "../../lib/config-flags.js";
import { globalConfigJsonPath, globalConfigYamlPath, loadConfigAtPath } from "../../lib/system-config-cli.js";

export default class ConfigInit extends Command {
  static summary = "Write best-practices default config if missing";

  static description =
    "Creates a new config file with a conservative allow-list (OpenAI + Ollama), model defaults, and extension security. " +
    "Does not overwrite unless --force.";

  static flags = {
    ...configScopeFlags,
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing config at the target path",
      default: false,
    }),
    format: Flags.string({
      description: "Output format for the new file",
      options: ["yaml", "json"] as const,
      default: "yaml",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigInit);
    const global = flags.global as boolean;
    const explicit = flags.config as string | undefined;
    const cwd = process.cwd();

    let target: string;
    if (explicit) {
      target = resolve(explicit);
    } else if (global) {
      target = flags.format === "json" ? globalConfigJsonPath() : globalConfigYamlPath();
    } else {
      target =
        flags.format === "json" ? resolve(cwd, "ecp.config.json") : resolve(cwd, "ecp.config.yaml");
    }

    const parsed = parseSystemConfigString(DEFAULT_ECP_SYSTEM_CONFIG_YAML, "yaml");
    const { exists } = loadConfigAtPath(target);

    if (exists && !flags.force) {
      this.error(
        `Config already exists: ${target}\nUse --force to overwrite, or edit the file directly.`,
        { exit: 1 },
      );
    }

    saveSystemConfig(target, parsed);
    this.log(exists ? `Overwrote ${target}` : `Wrote ${target}`);
  }
}
