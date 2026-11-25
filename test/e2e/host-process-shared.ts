import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

/**
 * @category Test
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * @category Test
 */
export function killPidOnly(pid: number): void {
  if (!isPidAlive(pid)) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" })
  } else {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // already gone
    }
  }
}

/**
 * @category Test
 */
export async function readProcessCommandLine(pid: number): Promise<string> {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ],
      { encoding: "utf8", windowsHide: true },
    )
    return result.stdout?.trim() ?? ""
  }
  try {
    return readFileSync(`/proc/${pid}/cmdline`, "utf8")
  } catch {
    return ""
  }
}

/**
 * @category Test
 */
export async function readProcessCreationTimeMs(pid: number): Promise<number> {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `[DateTimeOffset]::Parse((Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CreationDate).ToUnixTimeMilliseconds()`,
      ],
      { encoding: "utf8", windowsHide: true },
    )
    const value = Number(result.stdout?.trim())
    return Number.isFinite(value) ? value : Date.now()
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
    const close = stat.lastIndexOf(")")
    const rest = stat.slice(close + 2)
    const startTicks = Number(rest.split(" ")[19])
    const hz = 100
    const uptime = Number(readFileSync("/proc/uptime", "utf8").split(" ")[0])
    const bootMs = Date.now() - uptime * 1000
    return Math.round(bootMs + (startTicks / hz) * 1000)
  } catch {
    return Date.now()
  }
}