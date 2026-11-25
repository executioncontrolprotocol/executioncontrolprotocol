import { Command, Flags } from "@oclif/core"
import { discoverOps } from "../lib/host-discovery.js"
import { hostUnavailableEnvelope, isHostUnavailableError } from "../lib/host-unavailable.js"
import { parseFilters, parseInclude } from "../lib/input.js"
import { finishOperation, printRetrieveHuman, writeEnvelope } from "../lib/output.js"
import type { RetrieveInput, RetrieveType } from "@executioncontrolprotocol/protocol"

/**
 * `ecp retrieve`
 * @category CLI
 */
export default class Retrieve extends Command {
  static override description =
    "Read capabilities, executions, configs, runs, plugins, formatters, or editor schema files; use execute to run and commit to write."

  static override examples = [
    {
      description: "Lists matching capabilities as a table; add --json for the operation envelope.",
      command: "<%= config.bin %> retrieve --type capability --query echo",
    },
    {
      description: "Prints the root editor schema path (no host auto-start).",
      command: "<%= config.bin %> retrieve --type schema",
    },
    {
      description: "Inlines the root schema JSON when under the size cap.",
      command: "<%= config.bin %> retrieve --type schema --include document",
    },
    {
      description: "Writes a large plugin schema to a file.",
      command: "<%= config.bin %> retrieve --type schema --id @executioncontrolprotocol/adobe-firefly-services --include document --out firefly.schema.json",
    },
  ]

  static override flags = {
    type: Flags.string({
      required: true,
      options: ["capability", "execution", "config", "run", "plugin", "formatter", "schema"],
      description: "What to list or fetch (capability, execution, config, run, plugin, formatter, schema).",
    }),
    id: Flags.string({ description: "Fetch one item by id instead of listing." }),
    query: Flags.string({ description: "Fuzzy search string when listing capabilities or executions." }),
    limit: Flags.integer({ description: "Maximum rows to return (default 10, max 100)." }),
    include: Flags.string({
      description: "Comma-separated extras: run detail (steps, events, manifest, state) or schema document with --type schema.",
    }),
    filter: Flags.string({ multiple: true, description: "Narrow a list with key=value (repeatable): plugin, executionId, status, clientRequestId; e.g. status=failed." }),
    format: Flags.string({ description: "Formatter id when --type formatter." }),
    out: Flags.string({ description: "Write full JSON result to this file and print a one-line summary." }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
    "no-start-host": Flags.boolean({
      description: "Do not start a background host when one is not already running.",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(Retrieve)
    const type = flags.type as RetrieveType
    let ops
    try {
      const discover =
        type === "schema"
          ? { autoStart: false as const, tip: false as const }
          : { autoStart: !flags["no-start-host"] }
      ops = await discoverOps(discover)
    } catch (error) {
      if (isHostUnavailableError(error)) {
        writeEnvelope(hostUnavailableEnvelope(error), {
          json: flags.json,
          human: () => this.error(error.message, { exit: 4 }),
          exitCode: 4,
        })
      }
      throw error
    }
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