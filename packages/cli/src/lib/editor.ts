import { spawn } from "node:child_process"

/**
 * Split an editor command into a binary and args, honoring quoted paths.
 * @category CLI
 */
export function tokenizeCommand(command: string): string[] {
  const matches = command.match(/"[^"]+"|'[^']+'|\S+/g) ?? [command]
  return matches.map((part) => part.replace(/^["']|["']$/g, ""))
}

/**
 * Resolve `$VISUAL`, then `$EDITOR`, then the platform default editor.
 * @category CLI
 */
export function resolveEditor(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): { command: string; args: string[] } {
  const visual = env.VISUAL?.trim()
  const editor = env.EDITOR?.trim()
  const raw = visual || editor
  if (raw) {
    const parts = tokenizeCommand(raw)
    const command = parts[0]
    if (!command) return platformDefaultEditor(platform)
    return { command, args: parts.slice(1) }
  }
  return platformDefaultEditor(platform)
}

function platformDefaultEditor(platform: NodeJS.Platform): { command: string; args: string[] } {
  if (platform === "win32") return { command: "notepad", args: [] }
  if (platform === "darwin") return { command: "open", args: ["-t"] }
  return { command: "xdg-open", args: [] }
}

/**
 * Open `filePath` in the resolved editor and wait for it to exit.
 * @category CLI
 */
export function openInEditor(
  filePath: string,
  options: {
    env?: NodeJS.ProcessEnv
    platform?: NodeJS.Platform
    spawnImpl?: typeof spawn
  } = {}
): Promise<void> {
  const editor = resolveEditor(options.env ?? process.env, options.platform ?? process.platform)
  const spawnImpl = options.spawnImpl ?? spawn
  return new Promise((resolve, reject) => {
    const child = spawnImpl(editor.command, [...editor.args, filePath], {
      stdio: "inherit",
      windowsHide: true,
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0 || code === null) resolve()
      else reject(new Error(`${editor.command} exited ${code}`))
    })
  })
}
