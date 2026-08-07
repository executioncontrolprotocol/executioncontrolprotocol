import { Flags } from "@oclif/core"
import { loadWorkflowFile } from "@executioncontrolprotocol/core/loaders"
import { readJsonFile, runWithCommandError } from "../lib/command-helpers.js"
import { WorkflowEnvCommand } from "../lib/env-module-command.js"

/** Execute a workflow in an environment. */
export default class Run extends WorkflowEnvCommand {
  static summary = "Run a workflow"

  static description =
    "Compile (if needed) and execute a workflow using the runtime and extensions from --env."

  static examples = [
    "<%= config.bin %> <%= command.id %> examples/01-echo/workflow.ts --env examples/01-echo/environment.ts",
    "<%= config.bin %> <%= command.id %> workflow.json --env environment.ts --input input.json",
    "<%= config.bin %> <%= command.id %> workflow.ts --env environment.ts --dry-run",
  ]

  static args = {
    ...WorkflowEnvCommand.args,
  }

  static flags = {
    ...WorkflowEnvCommand.flags,
    input: Flags.string({
      description: "Path to JSON file with workflow input object",
    }),
    "dry-run": Flags.boolean({
      description: "Validate and plan execution without invoking capabilities",
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run)
    let runStatus: string | undefined
    await runWithCommandError(this, async () => {
      const input = flags.input
        ? await readJsonFile<Record<string, unknown>>(flags.input, "--input")
        : undefined
      const ecp = await this.loadEcp(flags)
      const workflow = await loadWorkflowFile(args["workflow-path"])
      const result = await ecp.run(workflow, {
        input,
        dryRun: flags["dry-run"],
      })
      runStatus = result.run.status
      this.log(JSON.stringify(result, null, 2))
    })
    // A successful run is one that completed. Any other terminal status
    // (failed, cancelled, paused) must surface a non-zero exit code so CI
    // and shell callers can trust `ecp run`.
    if (runStatus !== undefined && runStatus !== "completed") {
      this.error(`Workflow run did not complete (status: ${runStatus})`, {
        exit: 1,
      })
    }
  }
}
