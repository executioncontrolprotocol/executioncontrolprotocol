import { Command, Flags } from "@oclif/core"
import { discoverOps } from "../../lib/host-discovery.js"
import { finishOperation, printPluginsHuman } from "../../lib/output.js"

/**
 * `ecp plugins` — list ECP plugins from the host (not oclif's getPluginsList).
 * @category CLI
 */
export default class PluginsList extends Command {
  static override description =
    "List ECP plugins from the host with manifest status; use retrieve for capability metadata instead."

  static override examples = [
    {
      description: "Prints installed plugins as a table; add --json for the operation envelope.",
      command: "<%= config.bin %> plugins",
    },
  ]

  static override flags = {
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(PluginsList)
    const ops = await discoverOps({})
    try {
      const envelope = await ops.retrieve({ type: "plugin" })
      finishOperation(envelope, {
        json: flags.json,
        human: printPluginsHuman,
      })
    } finally {
      await ops.close()
    }
  }
}