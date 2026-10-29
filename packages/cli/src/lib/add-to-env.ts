const ADD_TO_CONFIG = "--add-to-config"

/** Remembered `--add-to-config` target for the current process. @category CLI */
export type AddToEnvTarget = string | true | undefined

let pendingAddToEnv: AddToEnvTarget

/**
 * True when `value` looks like a filesystem path rather than a plugin name.
 * @category CLI
 */
export function looksLikeEnvPath(value: string): boolean {
  return /[\\/]/.test(value) || /\.(ts|js|mts|cts)$/i.test(value)
}

function isPluginsInstall(argv: string[]): boolean {
  const tokens = argv.slice(2).filter((arg) => arg !== undefined && !arg.startsWith("-"))
  return tokens[0] === "plugins" && tokens[1] === "install"
}

/**
 * Strip `--add-to-config [file]` from `plugins install` argv so oclif does not reject the flag.
 * A bare flag becomes `true` (use the default config file).
 * @category CLI
 */
export function stripAddToEnvFromArgv(argv: string[]): {
  argv: string[]
  addToEnv: AddToEnvTarget
} {
  if (!isPluginsInstall(argv)) return { argv, addToEnv: undefined }
  const next = [...argv]
  for (let i = 0; i < next.length; i += 1) {
    const arg = next[i]
    if (!arg) continue
    if (arg.startsWith(`${ADD_TO_CONFIG}=`)) {
      const value = arg.slice(ADD_TO_CONFIG.length + 1)
      next.splice(i, 1)
      return { argv: next, addToEnv: value.length > 0 ? value : true }
    }
    if (arg === ADD_TO_CONFIG) {
      const value = next[i + 1]
      next.splice(i, 1)
      if (value && !value.startsWith("-") && looksLikeEnvPath(value)) {
        next.splice(i, 1)
        return { argv: next, addToEnv: value }
      }
      return { argv: next, addToEnv: true }
    }
  }
  return { argv: next, addToEnv: undefined }
}

/**
 * Remember the `--add-to-config` target for {@link takePendingAddToEnv}.
 * @category CLI
 */
export function setPendingAddToEnv(value: AddToEnvTarget): void {
  pendingAddToEnv = value
}

/**
 * Consume the remembered `--add-to-config` target. Returns `undefined` when the flag was absent.
 * @category CLI
 */
export function takePendingAddToEnv(): AddToEnvTarget {
  const value = pendingAddToEnv
  pendingAddToEnv = undefined
  return value
}

/**
 * Apply {@link stripAddToEnvFromArgv} and store the target for the postinstall hook.
 * @category CLI
 */
export function prepareArgvForExecute(argv: string[]): string[] {
  const stripped = stripAddToEnvFromArgv(argv)
  if (stripped.addToEnv !== undefined) setPendingAddToEnv(stripped.addToEnv)
  return stripped.argv
}

/**
 * Map an installed plugin package name to an extension id.
 * Prefers `pjson.ecp.id`; otherwise `@scope/plugin-name` → `@scope/name`.
 * @category CLI
 */
export function extensionIdFromPluginPackage(
  name: string,
  pjson?: Record<string, unknown>
): string {
  const ecp = pjson?.ecp as { id?: string } | undefined
  if (ecp?.id) return ecp.id
  return name.replace(/\/plugin-/, "/")
}
