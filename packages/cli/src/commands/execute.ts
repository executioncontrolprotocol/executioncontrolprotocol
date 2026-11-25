import { Args, Command, Flags } from "@oclif/core"
import type { ExecuteExecution, ExecuteInput } from "@executioncontrolprotocol/protocol"
import { discoverOps } from "../lib/host-discovery.js"
import { hostUnavailableEnvelope, isHostUnavailableError } from "../lib/host-unavailable.js"
import { writeEnvelope } from "../lib/output.js"
import { parseJsonFlag, positionalPathOrId } from "../lib/input.js"
import { finishOperation, printExecuteHuman } from "../lib/output.js"

/**
 * `ecp execute`
 * @category CLI
 */
export default class Execute extends Command {
  static override description =
    "Validate or run an execution file or stored id; use retrieve to inspect and commit to save manifests."

  static override args = {
    target: Args.string({ description: "Path to a .ecp.json file or a stored execution id." }),
  }

  static override examples = [
    {
      description: "Validates the manifest without running steps; exit 0 when validation passes.",
      command: "<%= config.bin %> execute ./flow.ecp.json --validate",
    },
  ]

  static override flags = {
    input: Flags.string({ description: "Run input as JSON text, @file, or - (stdin)." }),
    validate: Flags.boolean({ description: "Validate only; do not start a run.", default: false }),
    "no-wait": Flags.boolean({
      description: "Start the run and return immediately with runId (default waits for completion).",
      default: false,
    }),
    resume: Flags.string({ description: "Resume an interrupted run by run id." }),
    cancel: Flags.string({ description: "Cancel a running run by run id." }),
    out: Flags.string({ description: "Write the full run result JSON to this file." }),
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
    const { args, flags } = await this.parse(Execute)
    let ops
    try {
      ops = await discoverOps({ autoStart: !flags["no-start-host"] })
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
      const input = await buildExecuteInput(args.target, flags)
      const envelope = await ops.execute(input)
      finishOperation(envelope, {
        json: flags.json,
        out: flags.out,
        human: printExecuteHuman,
      })
    } finally {
      await ops.close()
    }
  }
}

async function buildExecuteInput(
  target: string | undefined,
  flags: {
    input?: string
    validate: boolean
    "no-wait": boolean
    resume?: string
    cancel?: string
    out?: string
  },
): Promise<ExecuteInput> {
  if (flags.cancel) return { cancel: flags.cancel }
  if (flags.resume) return { resume: flags.resume }
  if (!target) {
    throw Object.assign(new Error("ECP_REQUEST_INVALID: pass a path/id, --resume, or --cancel."), {
      code: "ECP_REQUEST_INVALID",
    })
  }
  const ref = positionalPathOrId(target)
  const parsedInput = await parseJsonFlag(flags.input)
  const execution: ExecuteExecution = "path" in ref ? { path: ref.path } : { id: ref.id }
  return {
    execution,
    input: parsedInput as Record<string, unknown> | undefined,
    mode: flags.validate ? "validate" : "run",
    wait: !flags["no-wait"],
    output: flags.out ? { path: flags.out } : undefined,
  }
}