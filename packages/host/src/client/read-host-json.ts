import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { type HostFile } from "@executioncontrolprotocol/protocol"

/**
 * Read `$ECP_HOME/host.json` when present.
 * @category Host
 */
export function readHostJson(home: string): HostFile | undefined {
  const file = path.join(home, "host.json")
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, "utf8")) as HostFile
}
