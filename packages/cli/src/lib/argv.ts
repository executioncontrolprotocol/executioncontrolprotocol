/**
 * True when argv includes `--name`, `--name=…`, or `-x` for a known short flag.
 * @category CLI
 */
export function argvHasFlag(argv: string[], name: string, short?: string): boolean {
  const token = `--${name}`
  if (argv.some((arg) => arg === token || arg.startsWith(`${token}=`))) return true
  if (short && argv.includes(`-${short}`)) return true
  return false
}

/**
 * Value of `--name <value>` or `--name=value` from argv.
 * @category CLI
 */
export function argvFlagValue(argv: string[], name: string): string | undefined {
  const token = `--${name}`
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg) continue
    if (arg === token) return argv[i + 1]
    if (arg.startsWith(`${token}=`)) return arg.slice(token.length + 1)
  }
  return undefined
}
