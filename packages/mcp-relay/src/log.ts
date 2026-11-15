import { appendFileSync, mkdirSync } from "node:fs"
import path from "node:path"

/**
 * Append a line to `$ECP_HOME/logs/relay.log`. Never writes to stdout.
 * @category MCP
 */
export function relayLog(home: string, message: string): void {
  const dir = path.join(home, "logs")
  mkdirSync(dir, { recursive: true })
  const line = `${new Date().toISOString()} ${message}\n`
  appendFileSync(path.join(dir, "relay.log"), line, "utf8")
}
