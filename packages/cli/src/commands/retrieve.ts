import { Command, Flags } from "@oclif/core"
import { discoverOps } from "../lib/host-discovery.js"
import { parseFilters, parseInclude } from "../lib/input.js"
import { finishOperation, printRetrieveHuman } from "../lib/output.js"
import type { RetrieveInput, RetrieveType } from "@executioncontrolprotocol/protocol"

/**
 * `ecp retrieve`
 * @category CLI
 */
export default class Retrieve extends Command {
  static override description = "Read capabilities, executions, configs, runs, plugins or formatters."

  static override flags = {
    type: Flags.string({ required: true, options: ["capability", "execution", "config", "run", "plugin", "formatter"] }),
    id: Flags.string(),
    query: Flags.string(),
    limit: Flags.integer(),
    include: Flags.string({ description: "Comma-separated include sections." }),
    filter: Flags.string({ multiple: true, description: "key=value filter (repeatable)." }),
    format: Flags.string(),
    out: Flags.string(),
    json: Flags.boolean({ default: false }),
    "start-host": Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(Retrieve)
    const ops = await discoverOps({ startHost: flags["start-host"] })
    try {
      const input: RetrieveInput = {
        type: flags.type as RetrieveType,
        id: flags.id,
        query: flags.query,
        limit: flags.limit,
        include: parseInclude(flags.include) as RetrieveInput["include"],
        filter: parseFilters(flags.filter) as RetrieveInput["filter"],
        format: flags.format,
        output: flags.out ? { path: flags.out } : undefined,
      }
      const envelope = await ops.retrieve(input)
      finishOperation(envelope, {
        json: flags.json,
        out: flags.out,
        human: printRetrieveHuman,
      })
    } finally {
      await ops.close()
    }
  }
}
