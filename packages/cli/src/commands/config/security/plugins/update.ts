import { Command, Flags } from "@oclif/core";

import type { PluginSecurityPolicy } from "@executioncontrolprotocol/spec";
import { EXTENSION_SOURCE_TYPES, PLUGIN_KINDS } from "@executioncontrolprotocol/spec";

import { readJsonFromFile } from "../../../../lib/config-cli-json.js";
import { buildPluginSecurityPolicyFromFlags } from "../../../../lib/config-wiring-cli.js";
import { configScopeFlags } from "../../../../lib/config-flags.js";
import { persistConfig, readForMutation, touchSecurity } from "../../../../lib/system-config-cli.js";

export default class ConfigSecurityPluginsUpdate extends Command {
  static summary = "Replace security.plugins (PluginSecurityPolicy)";

  static description =
    "Sets allowKinds, allowSourceTypes, allowIds, denyIds, strict, etc. Replaces the whole security.plugins block. Use typed flags or --file.";

  static flags = {
    ...configScopeFlags,
    file: Flags.string({
      description: "Path to a JSON file, or - to read JSON from stdin",
    }),
    "allow-kind": Flags.string({
      description: "Plugin kind allow-list entry (repeatable)",
      options: [...PLUGIN_KINDS],
      multiple: true,
    }),
    "allow-source-type": Flags.string({
      description: "Extension source type allow-list entry (repeatable)",
      options: [...EXTENSION_SOURCE_TYPES],
      multiple: true,
    }),
    "allow-id": Flags.string({
      description: "Plugin id allow-list entry (repeatable)",
      multiple: true,
    }),
    "deny-id": Flags.string({
      description: "Plugin id deny-list entry (repeatable)",
      multiple: true,
    }),
    strict: Flags.boolean({
      description: "When true, unknown or disallowed plugin references fail startup",
      allowNo: true,
    }),
    "allow-third-party": Flags.boolean({
      description:
        "Allow vendor / third-party plugins and non-builtin install sources (use --no-allow-third-party to disable)",
      allowNo: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigSecurityPluginsUpdate);

    const allowKind = flags["allow-kind"] as string[] | undefined;
    const allowSourceType = flags["allow-source-type"] as string[] | undefined;
    const allowId = flags["allow-id"] as string[] | undefined;
    const denyId = flags["deny-id"] as string[] | undefined;

    const hasPolicyFlags = Boolean(
      allowKind?.length ||
        allowSourceType?.length ||
        allowId?.length ||
        denyId?.length ||
        flags.strict !== undefined,
    );

    if (!flags.file && !hasPolicyFlags) {
      this.error(
        "Provide --file or at least one policy flag (--allow-kind, --allow-source-type, --allow-third-party, ...).",
        {
          exit: 1,
        },
      );
    }
    if (flags.file && hasPolicyFlags) {
      this.error("Use either --file or policy flags, not both.", { exit: 1 });
    }

    let parsed: PluginSecurityPolicy;
    try {
      if (flags.file) {
        const raw = readJsonFromFile(flags.file);
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          this.error("Security policy must be a JSON object.", { exit: 1 });
        }
        parsed = raw as PluginSecurityPolicy;
      } else {
        parsed = buildPluginSecurityPolicyFromFlags({
          allowKind,
          allowSourceType,
          allowId,
          denyId,
          strict: flags.strict,
          allowThirdParty: flags["allow-third-party"] as boolean | undefined,
        });
      }
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e), { exit: 1 });
    }

    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    const sec = touchSecurity(config);
    sec.plugins = parsed;

    persistConfig(path, config);
    this.log(`Updated security.plugins (${path})`);
  }
}
