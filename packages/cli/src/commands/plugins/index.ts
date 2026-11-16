import { Command, Flags } from "@oclif/core"
import type { PluginInfo, RetrieveData } from "@executioncontrolprotocol/protocol"
import { discoverOps } from "../../lib/host-discovery.js"
import { finishOperation } from "../../lib/output.js"

/**
 * `ecp plugins` — list ECP plugins from the host (not oclif's getPluginsList).
 * @category CLI
 */
export default class PluginsList extends Command {
  static override description = "List installed ECP plugins (host view, with manifest status)."

  static override flags = {
    json: Flags.boolean({ default: false }),
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

/**
 * Human table: package, version, source, manifest.
 * @category CLI
 */
function printPluginsHuman(data: unknown): void {
  const body = data as RetrieveData & { items?: PluginInfo[]; total?: number }
  const items = Array.isArray(body.items) ? (body.items as PluginInfo[]) : []
  if (items.length === 0) {
    process.stdout.write("No plugins installed.\n")
    return
  }
  const rows = items.map((item) => ({
    package: item.package,
    version: item.version,
    source: item.source,
    manifest: formatManifest(item),
  }))
  const widths = {
    package: Math.max("package".length, ...rows.map((row) => row.package.length)),
    version: Math.max("version".length, ...rows.map((row) => row.version.length)),
    source: Math.max("source".length, ...rows.map((row) => row.source.length)),
    manifest: Math.max("manifest".length, ...rows.map((row) => row.manifest.length)),
  }
  const line = (row: { package: string; version: string; source: string; manifest: string }): string =>
    `${row.package.padEnd(widths.package)}  ${row.version.padEnd(widths.version)}  ${row.source.padEnd(widths.source)}  ${row.manifest}`
  process.stdout.write(`${line({ package: "package", version: "version", source: "source", manifest: "manifest" })}\n`)
  for (const row of rows) process.stdout.write(`${line(row)}\n`)
}

function formatManifest(item: PluginInfo): string {
  if (item.manifestOk) return "ok"
  const issue = item.issues?.[0]
  if (!issue) return "invalid"
  const message = issue.message.length > 60 ? `${issue.message.slice(0, 57)}...` : issue.message
  return `${issue.code} ${message}`
}
