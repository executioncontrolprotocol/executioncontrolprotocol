import { spawnSync } from "node:child_process"
import path from "node:path"
import { pathToFileURL } from "node:url"

/**
 * If host stop did not reap the pair, kill host then supervisor before deleting the home.
 * @param {string} homeDir
 * @param {string} repoRoot
 */
export async function killRegisteredHostPidsBeforeRm(homeDir, repoRoot) {
  const { readHostJson } = await import(pathToFileURL(path.join(repoRoot, "packages/host/dist/index.js")).href)
  const file = readHostJson(homeDir)
  if (!file) return
  if (file.hostPid && isAlive(file.hostPid)) {
    killPid(file.hostPid)
  }
  if (file.supervisorPid && isAlive(file.supervisorPid)) {
    killPid(file.supervisorPid)
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/F", "/PID", String(pid)], { stdio: "ignore", windowsHide: true })
  } else {
    try {
      process.kill(pid, "SIGKILL")
    } catch {
      // already gone
    }
  }
}