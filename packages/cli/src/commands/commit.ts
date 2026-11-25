import { Command, Flags } from "@oclif/core"
import type { CommitAction, CommitInput, CommitType } from "@executioncontrolprotocol/protocol"
import { discoverOps } from "../lib/host-discovery.js"
import { hostUnavailableEnvelope, isHostUnavailableError } from "../lib/host-unavailable.js"
import { writeEnvelope } from "../lib/output.js"
import { parseJsonFlag, resolvePath } from "../lib/input.js"
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
    path: Flags.string({ description: "Update or delete an execution file by absolute or cwd-relative path." }),
    draft: Flags.boolean({ description: "Store despite L2/L3 validation errors when L1 passes.", default: false }),
    object: Flags.string({ description: "Full object JSON, @file, or - (stdin)." }),
    patch: Flags.string({ description: "JSON Patch array, @file, or - (stdin) for updates." }),
    "if-version": Flags.string({ description: "Expected version for optimistic concurrency (integer for ids, string for paths)." }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
    "no-start-host": Flags.boolean({
      description: "Do not start a background host when one is not already running.",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(Commit)
    let ops
    try {
      ops = await discoverOps({ autoStart: !flags["no-start-host"] })
    } catch (error) {
      if (isHostUnavailableError(error)) {
        writeEnvelope(hostUnavailableEnvelope(error), {
          json: flags.json,
          human: () => this.error(error.message, { exit: 4 }),
          exitCode: 4,
        })
      }
      throw error
    }
    try {
      let ifVersion: CommitInput["ifVersion"]
      if (flags["if-version"] !== undefined) {
        if (flags.path) {
          ifVersion = flags["if-version"]
        } else if (/^[1-9]\d*$/.test(flags["if-version"])) {
          ifVersion = Number(flags["if-version"])
        } else {
          this.error("ifVersion for a stored id must be an integer.", { exit: 2 })
        }
      }
      const input: CommitInput = {
        type: flags.type as CommitType,
        action: flags.action as CommitAction,
        id: flags.id,
        path: flags.path ? resolvePath(flags.path) : undefined,
        object: await parseJsonFlag(flags.object),
        patch: (await parseJsonFlag(flags.patch)) as CommitInput["patch"],
        ifVersion,
        draft: flags.draft ? true : undefined,
      }
      const envelope = await ops.commit(input)
      finishOperation(envelope, { json: flags.json, human: printCommitHuman })
    } finally {
      await ops.close()
    }
  }
}