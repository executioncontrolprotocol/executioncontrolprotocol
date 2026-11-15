import { ECP_INPUT_INVALID, EcpError } from "@executioncontrolprotocol/core/types"

/**
 * True when `host` is a loopback address (`127.0.0.0/8`, `::1`, `localhost`).
 * @category MCP
 */
export function isLoopbackAddress(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return isLoopbackAddress(normalized.slice(1, -1))
  }
  if (normalized === "localhost" || normalized === "::1") return true
  return /^127(?:\.\d{1,3}){3}$/.test(normalized)
}

/**
 * Reject a non-loopback HTTP bind unless `--allow-remote` was passed.
 * @category MCP
 */
export function assertHttpBind(host: string, allowRemote: boolean): void {
  if (isLoopbackAddress(host) || allowRemote) return
  throw new EcpError(
    ECP_INPUT_INVALID,
    `Binding ${host} requires --allow-remote`,
    {
      suggestions: [
        "Keep the default 127.0.0.1 bind",
        "Pass --allow-remote only on a trusted network",
      ],
    }
  )
}
