import { Flags, Command } from "@oclif/core"
import { runWithCommandError } from "../../lib/command-helpers.js"
import { readTestSessionFile } from "../../lib/test-session-io.js"

/** Print test session status. */
export default class TestStatus extends Command {
  static summary = "Show test session status"

  static description =
    "Print the test session snapshot (status, cursor, state keys, history)."

  static examples = ["<%= config.bin %> <%= command.id %> --session session.json"]

  static flags = {
    ...Command.baseFlags,
    session: Flags.string({
      required: true,
      description: "Path to test session JSON file",
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(TestStatus)
    await runWithCommandError(this, async () => {
      const snap = await readTestSessionFile(flags.session)
      this.log(JSON.stringify(snap, null, 2))
    })
  }
}
