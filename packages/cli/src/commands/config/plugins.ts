import { Command } from "@oclif/core";

/**
 * Parent topic for `ecp config plugins` (install entries under `plugins.installs`).
 *
 * @category CLI
 */
export default class ConfigPlugins extends Command {
  static summary = "Plugin installs (plugins.installs); policy is ecp config security";

  static description = `Install metadata and listing. Allow/deny for providers and extension policy live under \`ecp config security\`.

Subcommands:
  get              List plugins.installs keys + security.plugins summary
  add|update       Add or replace an install (use \`--install\` with --npm, --git, or --local to fetch materialize; \`update --upgrade\` re-fetches npm/git)
  remove           Remove plugins.installs.<id> (\`--clean\` also deletes local installed files)`;

  async run(): Promise<void> {
    await this.parse(ConfigPlugins);
    this.log(
      [
        "Usage: ecp config plugins <subcommand>",
        "",
        "  get              plugins.installs + security.plugins",
        "  add <id> --npm <spec> [--path <dir>] [--kind tool]   (metadata-only)",
        "  add <id> --install --npm|git|local …               (fetch + hooks + wiring)",
        "  update <id> …                                      (same flags as add)",
        "  update <id> --upgrade                              (re-fetch using stored npm/git source)",
        "  remove <id> [--clean]",
        "",
        "Policy examples:",
        "  ecp config security models allow add ollama",
        "  ecp config security plugins update --file policy.json",
        "",
        "Run ecp config plugins <cmd> --help for flags.",
      ].join("\n"),
    );
  }
}
