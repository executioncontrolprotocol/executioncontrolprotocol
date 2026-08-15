import { Flags } from "@oclif/core"
import { runWithCommandError } from "../../lib/command-helpers.js"
import { EnvModuleCommand } from "../../lib/env-module-command.js"
import { readTestSessionFile, writeTestSessionFile } from "../../lib/test-session-io.js"

/** Inclusive run-to within a test session. */
export default class TestRun extends EnvModuleCommand {
  static summary = "Run a test session through a step"

  static description =
    "Inclusively execute through --to <step-id>, skipping already-completed prior steps " +
    "and freezing state for later reruns. Rewrites --session."

  static examples = [
    "<%= config.bin %> <%= command.id %> --to echo --env examples/01-echo/environment.ts --session session.json",
  ]

  static flags = {
    ...EnvModuleCommand.flags,
    to: Flags.string({
      required: true,
      description: "Inclusive step id to run through",
    }),
    session: Flags.string({
      required: true,
      description: "Path to test session JSON file",
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRun)
    await runWithCommandError(this, async () => {
      const snap = await readTestSessionFile(flags.session)
      const ecp = await this.loadEcp(flags)
      const session = await ecp.restoreTestSession(snap)
      const next = await session.runTo(flags.to)
      await writeTestSessionFile(flags.session, next)
      this.log(JSON.stringify(next, null, 2))
    })
  }
}
