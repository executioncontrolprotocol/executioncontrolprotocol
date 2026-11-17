import { Args, Command, Flags } from "@oclif/core"
import { readStdin } from "../../lib/input.js"
import { withSecrets } from "../../lib/secrets.js"
import { writeEnvelope } from "../../lib/output.js"

/**
 * `ecp secrets set`
 * @category CLI
 */
export default class SecretsSet extends Command {
  static override description =
    "Store a secret in the OS keychain; prefer stdin over --value so the shell history stays clean."

  static override args = {
    key: Args.string({ required: true, description: "Secret key: starts with a letter or digit, then letters, digits, '.', '_', '/' or '-' (max 128); e.g. anthropic/api-key." }),
  }

  static override examples = [
    {
      description: "Reads the value from stdin and stores it under the key.",
      command: "<%= config.bin %> secrets set anthropic/api-key",
    },
  ]

  static override flags = {
    value: Flags.string({ description: "Secret value inline (prefer stdin to avoid shell history)." }),
    json: Flags.boolean({
      description:
        "Print one JSON object on stdout: { ok: true, data } on success, { ok: false, error } on failure (exit code non-zero).",
      default: false,
    }),
  }

  override async run(): Promise<void> {
    const { args, flags } = await this.parse(SecretsSet)
    let value = flags.value
    if (value === undefined) {
      if (!process.stdin.isTTY) value = (await readStdin()).replace(/\r?\n$/, "")
      else value = await promptHidden("value: ")
    }
    if (value === undefined || value === "") {
      writeEnvelope(
        { ok: false, error: { code: "ECP_REQUEST_INVALID", message: "Secret value is required." } },
        {
          json: flags.json,
          human: () => this.error("Secret value is required.", { exit: 2 }),
          exitCode: 2,
        },
      )
    }
    await withSecrets(async (secrets) => {
      await secrets.set(args.key, value!)
    })
    writeEnvelope(
      { ok: true, data: { key: args.key, set: true } },
      {
        json: flags.json,
        human: () => this.log(`set ${args.key}`),
        exitCode: 0,
      },
    )
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