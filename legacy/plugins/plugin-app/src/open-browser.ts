import { spawn } from "node:child_process"

/**
 * Platform command used to open a URL in the default browser.
 * @category App
 */
export function openBrowserCommand(
  platform: NodeJS.Platform,
  url: string
): { command: string; args: string[] } {
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] }
  }
  if (platform === "darwin") {
    return { command: "open", args: [url] }
  }
  return { command: "xdg-open", args: [url] }
}

/**
 * Open `url` in the default browser. Failures are ignored (CI / headless).
 * @category App
 */
export function openBrowser(url: string): void {
  const { command, args } = openBrowserCommand(process.platform, url)
  spawn(command, args, { detached: true, stdio: "ignore" }).unref()
}
