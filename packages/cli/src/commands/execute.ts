import { Args, Command, Flags } from "@oclif/core"
import type { ExecuteExecution, ExecuteInput } from "@executioncontrolprotocol/protocol"
import { discoverOps } from "../lib/host-discovery.js"
import { parseJsonFlag, positionalPathOrId } from "../lib/input.js"
import { finishOperation, printExecuteHuman } from "../lib/output.js"

/**
 * `ecp execute`
 * @category CLI
 */
export default class Execute extends Command {
  static override description = "Validate or run an execution."

  static override args = {
    target: Args.string({ description: "Execution path or id." }),
  }

  static override flags = {
    input: Flags.string({ description: "JSON, @file, or -." }),
    validate: Flags.boolean({ default: false }),
    "no-wait": Flags.boolean({ default: false }),
    resume: Flags.string(),
    cancel: Flags.string(),
    out: Flags.string(),
    json: Flags.boolean({ default: false }),
    "start-host": Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(Execute)
    const ops = await discoverOps({ startHost: flags["start-host"] })
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
