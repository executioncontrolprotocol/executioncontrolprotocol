import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { Command, Flags } from "@oclif/core"
import { discoverOps } from "../lib/host-discovery.js"
import { ecpHome } from "../lib/home.js"
import { exitWith } from "../lib/exit.js"

/**
 * `ecp schema`
 * @category CLI
 */
export default class Schema extends Command {
  static override description =
    "Show the root editor execution JSON Schema path or contents (ensures root and per-plugin editor files are current)."

  static override flags = {
    print: Flags.boolean({ default: false }),
    "start-host": Flags.boolean({ default: false }),
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(Schema)
    const home = ecpHome()
    const schemaPath = path.join(home, "schema", "execution.schema.json")
    const ops = await discoverOps({ startHost: flags["start-host"] })
    try {
      // Touch the host so schema generation / startup has run.
      await ops.retrieve({ type: "plugin", limit: 1 })
    } finally {
      await ops.close()
    }
    if (!existsSync(schemaPath)) {
      this.error(`Schema file missing at ${schemaPath}`, { exit: 1 })
    }
    if (flags.print) {
      const text = readFileSync(schemaPath, "utf8")
      if (flags.json) process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
      else process.stdout.write(text.endsWith("\n") ? text : `${text}\n`)
    } else if (flags.json) {
      process.stdout.write(`${JSON.stringify({ path: schemaPath })}\n`)
    } else {
      process.stdout.write(`${schemaPath}\n`)
    }
    exitWith(0)
  }
}
