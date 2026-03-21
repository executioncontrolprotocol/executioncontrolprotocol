import { Command, Flags } from "@oclif/core";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Base for commands that support `--environment` (dot.env file path override for the secret broker).
 * Config commands do not extend this class.
 */
export abstract class EcpEnvironmentCommand extends Command {
  static flags = {
    ...Command.baseFlags,
    environment: Flags.string({
      description:
        "Path to a .env file for the dot.env secret provider (overrides secrets.providers.dot.env in config; does not merge into process.env)",
    }),
  };

  /** Absolute path when `--environment` is set; otherwise undefined. */
  protected effectiveDotenvPath?: string;

  /**
   * Call from `run()` immediately after `this.parse(...)`. Oclif does not populate instance flags
   * before parse, so this cannot run in `init()`.
   */
  protected applyEnvironmentFlag(flags: { environment?: string }): void {
    this.effectiveDotenvPath = undefined;
    const raw = flags.environment;
    if (raw) {
      const abs = resolve(process.cwd(), raw);
      if (!existsSync(abs)) {
        this.error(`Environment file not found: ${abs}`, { exit: 1 });
      }
      this.effectiveDotenvPath = abs;
    }
  }
}
