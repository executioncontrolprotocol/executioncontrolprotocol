import { Args, Command, Flags } from "@oclif/core";

import { readJsonFromFile } from "../../lib/config-cli-json.js";
import { configScopeFlags } from "../../lib/config-flags.js";
import {
  buildModelProviderPatchFromFlags,
  buildToolServerEntryFromFlags,
  parseUniqueOptionFlags,
} from "../../lib/config-wiring-cli.js";
import {
  assertPlainObject,
  assertToolServerEntry,
  ensureSecurityAgentEndpointAllowed,
  ensureSecurityLoggerAllowed,
  ensureSecurityModelPolicyFromWiring,
  ensureSecurityToolServerAllowed,
  isWiringType,
  wiringEndpointsMergeConfig,
  wiringEndpointsUpdateUrl,
  wiringLoggersUpdate,
  wiringModelsUpdateProvider,
  wiringToolsUpdate,
} from "../../lib/config-wiring-ops.js";
import { persistConfig, readForMutation } from "../../lib/system-config-cli.js";

function hasModelsCliPayload(flags: Record<string, unknown>): boolean {
  const dm = flags["default-model"] as string | undefined;
  const sm = flags["supported-models"] as string[] | undefined;
  const opt = flags.option as string[] | undefined;
  return Boolean(dm || (sm && sm.length > 0) || (opt && opt.length > 0));
}

function hasEndpointsExtraPayload(flags: { file?: string; option?: string[] }): boolean {
  return Boolean(flags.file || (flags.option && flags.option.length > 0));
}

export default class ConfigUpdate extends Command {
  static summary = "Update wiring: tools.servers, models.providers, loggers.config, or agents.endpoints";

  static description =
    "Merges typed flags or `--file` into wiring. Policy edits use `ecp config security` only.";

  static args = {
    name: Args.string({
      required: false,
      description: "For --type tools|loggers|endpoints: resource name/id",
    }),
  };

  static flags = {
    ...configScopeFlags,
    type: Flags.string({
      required: true,
      description: "Wiring slice",
      options: ["tools", "models", "loggers", "endpoints"],
    }),
    provider: Flags.string({ description: "Model provider id (required for --type models)" }),
    file: Flags.string({
      description:
        "Path to JSON patch or full body (see --type), or - for stdin; mutually exclusive with structured flags where noted",
    }),
    url: Flags.string({ description: "New A2A URL (--type endpoints)" }),
    "default-model": Flags.string({
      description: "Default model id (--type models; not with --file)",
    }),
    "supported-models": Flags.string({
      description:
        "Supported model id for wiring (repeatable; comma-separated values allowed per occurrence) (--type models)",
      multiple: true,
    }),
    option: Flags.string({
      description:
        "key=value (repeatable); duplicate keys are invalid. Merges into provider config, tool server config, logger body, or endpoint config depending on --type",
      multiple: true,
    }),
    "transport-type": Flags.string({
      description: "stdio or sse (--type tools when not using --file)",
      options: ["stdio", "sse"],
    }),
    "stdio-command": Flags.string({
      description: "stdio transport: executable (--type tools)",
    }),
    "stdio-arg": Flags.string({
      description: "stdio argument (repeatable; comma-separated values allowed per occurrence)",
      multiple: true,
    }),
    "stdio-cwd": Flags.string({
      description: "Working directory for stdio transport",
    }),
    "sse-url": Flags.string({
      description: "sse transport: server URL (--type tools)",
    }),
    "credentials-file": Flags.string({
      description: "JSON file for tools.servers credentials object (optional; --type tools)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigUpdate);
    const t = flags.type as string;
    if (!isWiringType(t)) {
      this.error(`Invalid --type: ${t}`, { exit: 1 });
    }

    const cwd = process.cwd();
    const { path, config } = readForMutation({
      global: flags.global as boolean,
      cwd,
      explicit: flags.config as string | undefined,
    });

    try {
      if (t === "tools") {
        const name = args.name;
        if (!name) this.error("Provide <name> for tool server.", { exit: 1 });
        if (
          flags.file &&
          (flags["transport-type"] ||
            flags["stdio-command"] ||
            (flags["stdio-arg"] as string[] | undefined)?.length ||
            flags["stdio-cwd"] ||
            flags["sse-url"] ||
            flags["credentials-file"] ||
            flags.option?.length)
        ) {
          this.error("Use either --file or structured tool flags, not both.", { exit: 1 });
        }
        if (flags.file) {
          const parsed = readJsonFromFile(flags.file);
          assertToolServerEntry(parsed);
          wiringToolsUpdate(config, name, parsed);
          ensureSecurityToolServerAllowed(config, name);
        } else {
          const tt = flags["transport-type"] as "stdio" | "sse" | undefined;
          if (!tt) {
            this.error("Provide --file or --transport-type stdio|sse with the required fields.", { exit: 1 });
          }
          let creds: unknown | undefined;
          if (flags["credentials-file"]) {
            creds = readJsonFromFile(flags["credentials-file"] as string);
          }
          const entry = buildToolServerEntryFromFlags({
            transportType: tt,
            stdioCommand: flags["stdio-command"] as string | undefined,
            stdioArg: flags["stdio-arg"] as string[] | undefined,
            stdioCwd: flags["stdio-cwd"] as string | undefined,
            sseUrl: flags["sse-url"] as string | undefined,
            optionFlags: flags.option,
            credentialsJson: creds,
          });
          assertToolServerEntry(entry);
          wiringToolsUpdate(config, name, entry as { transport: Record<string, unknown> });
          ensureSecurityToolServerAllowed(config, name);
        }
        this.log(`Updated tool server "${name}" (${path})`);
      } else if (t === "loggers") {
        const id = args.name;
        if (!id) this.error("Provide <id> for logger config.", { exit: 1 });
        if (flags.file && flags.option?.length) {
          this.error("Use either --file or --option, not both.", { exit: 1 });
        }
        if (flags.file) {
          const parsed = readJsonFromFile(flags.file);
          assertPlainObject(parsed);
          wiringLoggersUpdate(config, id, parsed);
          ensureSecurityLoggerAllowed(config, id);
        } else {
          const parsed = parseUniqueOptionFlags(flags.option);
          if (Object.keys(parsed).length === 0) {
            this.error("Provide --file or at least one --option key=value for loggers.", { exit: 1 });
          }
          wiringLoggersUpdate(config, id, parsed as Record<string, unknown>);
          ensureSecurityLoggerAllowed(config, id);
        }
        this.log(`Updated loggers.config.${id} (${path})`);
      } else if (t === "models") {
        const providerId = flags.provider;
        if (!providerId) this.error("Provide --provider for --type models.", { exit: 1 });
        if (flags.file && hasModelsCliPayload(flags)) {
          this.error("Use either --file or model flags (--default-model, --supported-models, --option), not both.", {
            exit: 1,
          });
        }
        if (flags.file) {
          const parsed = readJsonFromFile(flags.file);
          assertPlainObject(parsed);
          wiringModelsUpdateProvider(config, providerId, parsed);
        } else {
          const patch = buildModelProviderPatchFromFlags({
            defaultModel: flags["default-model"] as string | undefined,
            supportedModelsRaw: flags["supported-models"] as string[] | undefined,
            optionFlags: flags.option,
          });
          if (Object.keys(patch).length === 0) {
            this.error(
              "Provide --file or at least one of --default-model, --supported-models, --option for models.",
              { exit: 1 },
            );
          }
          wiringModelsUpdateProvider(config, providerId, patch);
        }
        ensureSecurityModelPolicyFromWiring(config, providerId);
        this.log(`Updated models.providers.${providerId} (${path})`);
      } else if (t === "endpoints") {
        const name = args.name;
        if (!name) this.error("Provide <name> for endpoint.", { exit: 1 });
        const url = flags.url;
        if (!url) this.error("Provide --url to update endpoint.", { exit: 1 });
        if (flags.file && flags.option?.length) {
          this.error("Use either --file or --option for endpoint config, not both.", { exit: 1 });
        }
        wiringEndpointsUpdateUrl(config, name, url);
        ensureSecurityAgentEndpointAllowed(config, name);
        if (hasEndpointsExtraPayload(flags)) {
          if (flags.file) {
            const extra = readJsonFromFile(flags.file);
            assertPlainObject(extra);
            wiringEndpointsMergeConfig(config, name, extra);
          } else {
            const extra = parseUniqueOptionFlags(flags.option);
            wiringEndpointsMergeConfig(config, name, extra as Record<string, unknown>);
          }
        }
        this.log(`Updated agents.endpoints.${name} (${path})`);
      }
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e), { exit: 1 });
    }

    persistConfig(path, config);
  }
}
