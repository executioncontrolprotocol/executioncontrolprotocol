import { loadWorkflowFile } from "@executioncontrolprotocol/core/loaders"
import { runWithCommandError } from "../lib/command-helpers.js"
import { WorkflowEnvCommand } from "../lib/env-module-command.js"

/** Validate a workflow against an environment. */
export default class Validate extends WorkflowEnvCommand {
  static summary = "Validate a workflow manifest"

  static description =
    "Compile (if needed) and validate a workflow against the extensions, runtime, and policies in --env."

  static examples = [
    "<%= config.bin %> <%= command.id %> examples/01-echo/workflow.ts --env examples/01-echo/environment.ts",
  ]

  static args = {
    ...WorkflowEnvCommand.args,
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Validate)
    await runWithCommandError(this, async () => {
      const ecp = await this.loadEcp(flags)
      const workflow = await loadWorkflowFile(args["workflow-path"])
      const result = await ecp.validate(workflow)
      this.log(JSON.stringify(result, null, 2))
      if (!result.valid) this.exit(1)
    })
  }
}
