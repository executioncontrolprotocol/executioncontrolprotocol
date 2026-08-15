import { Command } from "@oclif/core"

/** Workflow test sessions (run-to / rerun with frozen state). */
export default class TestTopic extends Command {
  static summary = "Test a workflow with a persistent session"

  static description = `Create and drive a test session that freezes workflow state between operations.

Subcommands:
  start   Create a session file from a workflow
  run     Inclusive run-to via --to <step-id>
  rerun   Rerun one step and clear downstream state
  status  Print session status / cursor / history`

  static examples = [
    "<%= config.bin %> test start workflow.ts --env environment.ts -o session.json",
    "<%= config.bin %> test run --to step-b --env environment.ts --session session.json",
    "<%= config.bin %> test rerun step-a --env environment.ts --session session.json",
    "<%= config.bin %> test status --session session.json",
  ]

  async run(): Promise<void> {
    await this.parse(TestTopic)
    this.log(
      [
        "Usage: ecp test <subcommand>",
        "",
        "  start WORKFLOW-PATH  Create a session (-o session.json)",
        "  run --to STEP-ID     Inclusive run through a step",
        "  rerun STEP-ID        Rerun one step; clear downstream",
        "  status               Show session snapshot summary",
        "",
        "Run ecp test <cmd> --help for flags.",
      ].join("\n")
    )
  }
}
