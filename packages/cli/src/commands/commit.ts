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
  static override description =
    "Create, update, or delete stored executions and configs; use execute --validate before committing risky edits."

  static override examples = [
    {
      description: "Creates a stored execution from a JSON file referenced with @path.",
      command: "<%= config.bin %> commit --type execution --action create --id demo --object @./demo.ecp.json",
    },
  ]

  static override flags = {
    type: Flags.string({
      required: true,
      options: ["execution", "config"],
      description: "Object family to change (execution or config).",
    }),
    action: Flags.string({
      required: true,
      options: ["create", "update", "delete"],
      description: "create, update, or delete.",
    }),
    id: Flags.string({ description: "Object id (required for update/delete and optional on create)." }),
    object: Flags.string({ description: "Full object JSON, @file, or - (stdin)." }),
    patch: Flags.string({ description: "JSON Patch array, @file, or - (stdin) for updates." }),
    "if-version": Flags.integer({ description: "Expected objectVersion for optimistic concurrency." }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
    "start-host": Flags.boolean({
      description: "Start the background host if it is not already running.",
      default: false,
    }),
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