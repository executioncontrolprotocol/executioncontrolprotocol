import { Args, Flags } from "@oclif/core"
import { runWithCommandError } from "../../lib/command-helpers.js"
import { EnvModuleCommand } from "../../lib/env-module-command.js"
import { readTestSessionFile, writeTestSessionFile } from "../../lib/test-session-io.js"

/** Rerun a single step in a test session. */
export default class TestRerun extends EnvModuleCommand {
  static summary = "Rerun one step in a test session"

  static description =
    "Execute a single step against frozen prior state, replace its committed output, " +
    "and clear downstream history and `.as` state keys. Rewrites --session."

  static examples = [
    "<%= config.bin %> <%= command.id %> echo --env examples/01-echo/environment.ts --session session.json",
  ]

  static args = {
    "step-id": Args.string({
      required: true,
      description: "Step id to rerun",
    }),
  }

  static flags = {
    ...EnvModuleCommand.flags,
    session: Flags.string({
      required: true,
      description: "Path to test session JSON file",
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TestRerun)
    await runWithCommandError(this, async () => {
      const snap = await readTestSessionFile(flags.session)
      const ecp = await this.loadEcp(flags)
      const session = await ecp.restoreTestSession(snap)
      const next = await session.rerun(args["step-id"])
      await writeTestSessionFile(flags.session, next)
      this.log(JSON.stringify(next, null, 2))
    })
  }
}
