import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { argvHasFlag } from "./argv.js"

/**
 * True when the user passed `--yes` or `ECP_TRUST_THIRD_PARTY=1`.
 * @category CLI
 */
export function wantsYes(argv: string[] = process.argv): boolean {
  return argvHasFlag(argv, "yes") || process.env.ECP_TRUST_THIRD_PARTY === "1"
}

/**
 * Confirm an action: `--yes` wins; otherwise prompt on a TTY.
 * @category CLI
 */
export async function confirm(message: string, argv: string[] = process.argv): Promise<boolean> {
  if (wantsYes(argv)) return true
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false
  const rl = createInterface({ input, output })
  try {
    const answer = (await rl.question(`${message} (y/N) `)).trim().toLowerCase()
    return answer === "y" || answer === "yes"
  } finally {
    rl.close()
  }
}
