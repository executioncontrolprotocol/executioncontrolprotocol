import { spawn } from "node:child_process"

/**
 * Open a URL in the default browser (best-effort, fire-and-forget).
 * @category CLI
 */
export function openBrowserUrl(url: string): void {
  const platform = process.platform
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref()
    return
  }
  if (platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref()
    return
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref()
}

/** Demo environment preset ids passed via `?env=` on the open URL. @category CLI */
export type DemoOpenEnvPreset = "default" | "extended"

/**
 * Infer the browser demo env preset from the `ecp up --env` path.
 * Paths containing `extended` map to `extended`; everything else (including no env) is `default`.
 * @category CLI
 */
export function demoEnvPresetFromEnvPath(envPath: string | undefined): DemoOpenEnvPreset {
  if (!envPath) return "default"
  return /extended/i.test(envPath.replace(/\\/g, "/")) ? "extended" : "default"
}

/**
 * Build the demo open URL with pairing token (and optional bridge base / env preset).
 * @category CLI
 */
export function buildDemoOpenUrl(
  openUrl: string,
  options: { token: string; bridgeBaseURL?: string; env?: DemoOpenEnvPreset }
): string {
  const url = new URL(openUrl)
  url.searchParams.set("token", options.token)
  if (options.bridgeBaseURL) {
    url.searchParams.set("bridge", options.bridgeBaseURL)
  }
  if (options.env) {
    url.searchParams.set("env", options.env)
  }
  return url.toString()
}

/**
 * Origin (scheme + host + port) for CORS allowlisting from an open URL.
 * @category CLI
 */
export function originFromUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw)
    return url.origin
  } catch {
    return undefined
  }
}
