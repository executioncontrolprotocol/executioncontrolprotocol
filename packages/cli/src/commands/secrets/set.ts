import { Args, Command, Flags } from "@oclif/core"
import { readStdin } from "../../lib/input.js"
import { withSecrets } from "../../lib/secrets.js"
import { exitWith } from "../../lib/exit.js"

/**
 * `ecp secrets set`
 * @category CLI
 */
export default class SecretsSet extends Command {
  static override description = "Store a secret in the OS keychain."

  static override args = {
    key: Args.string({ required: true }),
  }

  static override flags = {
    value: Flags.string({ description: "Secret value (prefer stdin to avoid shell history)." }),
    json: Flags.boolean({ default: false }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(SecretsSet)
    let value = flags.value
    if (value === undefined) {
      if (!process.stdin.isTTY) value = (await readStdin()).replace(/\r?\n$/, "")
      else value = await promptHidden("value: ")
    }
    if (value === undefined || value === "") {
      this.error("Secret value is required.", { exit: 2 })
    }
    await withSecrets(async (secrets) => {
      await secrets.set(args.key, value!)
    })
    if (flags.json) process.stdout.write(`${JSON.stringify({ key: args.key, set: true })}\n`)
    else this.log(`set ${args.key}`)
    exitWith(0)
  }
}

async function promptHidden(label: string): Promise<string> {
  const { createInterface } = await import("node:readline")
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    process.stderr.write(label)
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    if (stdin.isTTY) stdin.setRawMode(true)
    let value = ""
    const onData = (chunk: Buffer): void => {
      const text = chunk.toString("utf8")
      if (text === "\n" || text === "\r" || text === "\u0004") {
        if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false)
        stdin.off("data", onData)
        rl.close()
        process.stderr.write("\n")
        resolve(value)
        return
      }
      if (text === "\u0003") {
        process.exit(1)
      }
      if (text === "\u007f" || text === "\b") {
        value = value.slice(0, -1)
        return
      }
      value += text
    }
    stdin.on("data", onData)
  })
}
