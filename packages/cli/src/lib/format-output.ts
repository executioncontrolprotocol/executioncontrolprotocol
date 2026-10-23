import type { Ecp } from "@executioncontrolprotocol/core"
import { EcpCliError, ECP_INPUT_INVALID, EXIT_USAGE } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Resolve a `--format` token to a format-extension id.
 * @category CLI
 */
export function formatExtensionId(format: string): string {
  if (format.includes("/")) return format
  if (format.startsWith("format-")) return `@executioncontrolprotocol/${format}`
  return `@executioncontrolprotocol/format-${format}`
}

/**
 * Optionally re-encode `data` through an installed format plugin.
 * @category CLI
 */
export async function applyFormat(ecp: Ecp, data: unknown, format: string | undefined): Promise<unknown> {
  if (!format) return data
  const extensionId = formatExtensionId(format)
  const result = await ecp.encode(data).uses(extensionId).asString().process()
  if (!result.success) {
    const diagnostic = result.diagnostics[0]
    throw new EcpCliError(
      diagnostic?.code ?? ECP_INPUT_INVALID,
      diagnostic?.message ?? `Format ${extensionId} is not installed`,
      {
        suggestions: ["Install the format plugin or omit --format"],
        exitCode: EXIT_USAGE,
      }
    )
  }
  return result.result
}
