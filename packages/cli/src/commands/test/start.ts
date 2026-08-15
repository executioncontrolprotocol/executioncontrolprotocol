import { Flags } from "@oclif/core"
import { loadWorkflowFile } from "@executioncontrolprotocol/core/loaders"
import { readJsonFile, runWithCommandError } from "../../lib/command-helpers.js"
import { writeTestSessionFile } from "../../lib/test-session-io.js"
import { WorkflowEnvCommand } from "../../lib/env-module-command.js"

/** Create a workflow test session file. */
export default class TestStart extends WorkflowEnvCommand {
  static summary = "Start a workflow test session"

  static description =
    "Create an idle test session snapshot for a workflow. Use `ecp test run --to` " +
    "and `ecp test rerun` to drive execution with frozen state."

  static examples = [
    "<%= config.bin %> <%= command.id %> examples/01-echo/workflow.ts --env examples/01-echo/environment.ts -o session.json",
  ]

  static args = {
    ...WorkflowEnvCommand.args,
  }

  static flags = {
    ...WorkflowEnvCommand.flags,
    input: Flags.string({
      description: "Path to JSON file with workflow input object",
    }),
    output: Flags.string({
      char: "o",
      required: true,
      description: "Path to write the test session JSON file",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TestStart)
    await runWithCommandError(this, async () => {
      const input = flags.input
        ? await readJsonFile<Record<string, unknown>>(flags.input, "--input")
        : {}
      const ecp = await this.loadEcp(flags)
      const workflow = await loadWorkflowFile(args["workflow-path"])
      const session = await ecp.test(workflow).with({ input }).start()
      const snap = session.snapshot()
      await writeTestSessionFile(flags.output, snap)
      this.log(JSON.stringify(snap, null, 2))
    })
  }
}
