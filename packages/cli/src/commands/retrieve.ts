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
  static override description =
    "Read capabilities, executions, configs, runs, plugins, or formatters; use execute to run and commit to write."

  static override examples = [
    {
      description: "Lists matching capabilities as a table; add --json for the operation envelope.",
      command: "<%= config.bin %> retrieve --type capability --query echo",
    },
  ]

  static override flags = {
    type: Flags.string({
      required: true,
      options: ["capability", "execution", "config", "run", "plugin", "formatter"],
      description: "What to list or fetch (capability, execution, config, run, plugin, formatter).",
    }),
    id: Flags.string({ description: "Fetch one item by id instead of listing." }),
    query: Flags.string({ description: "Fuzzy search string when listing capabilities or executions." }),
    limit: Flags.integer({ description: "Maximum rows to return (default 10, max 100)." }),
    include: Flags.string({ description: "Comma-separated detail sections for a single capability." }),
    filter: Flags.string({ multiple: true, description: "Narrow a list with key=value (repeatable): plugin, executionId, status, clientRequestId; e.g. status=failed." }),
    format: Flags.string({ description: "Formatter id when --type formatter." }),
    out: Flags.string({ description: "Write full JSON result to this file and print a one-line summary." }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
    "start-host": Flags.boolean({
      description: "Start the background host if it is not already running.",
      default: false,
    }),
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