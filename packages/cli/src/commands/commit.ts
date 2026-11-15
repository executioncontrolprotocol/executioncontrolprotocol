import { Command, Flags } from "@oclif/core"
import type { CommitAction, CommitInput, CommitType } from "@executioncontrolprotocol/protocol"
import { discoverOps } from "../lib/host-discovery.js"
import { parseJsonFlag } from "../lib/input.js"
import { finishOperation, printCommitHuman } from "../lib/output.js"

/**
 * `ecp commit`
 * @category CLI
 */
export default class Commit extends Command {
  static override description = "Create, update or delete an execution or config."

  static override flags = {
    type: Flags.string({ required: true, options: ["execution", "config"] }),
    action: Flags.string({ required: true, options: ["create", "update", "delete"] }),
    id: Flags.string(),
    object: Flags.string({ description: "JSON, @file, or -." }),
    patch: Flags.string({ description: "JSON Patch, @file, or -." }),
    "if-version": Flags.integer(),
    json: Flags.boolean({ default: false }),
    "start-host": Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(Commit)
    const ops = await discoverOps({ startHost: flags["start-host"] })
    try {
      const input: CommitInput = {
        type: flags.type as CommitType,
        action: flags.action as CommitAction,
        id: flags.id,
        object: await parseJsonFlag(flags.object),
        patch: (await parseJsonFlag(flags.patch)) as CommitInput["patch"],
        ifVersion: flags["if-version"],
      }
      const envelope = await ops.commit(input)
      finishOperation(envelope, { json: flags.json, human: printCommitHuman })
    } finally {
      await ops.close()
    }
  }
}
