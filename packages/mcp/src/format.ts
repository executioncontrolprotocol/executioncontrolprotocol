import type { Ecp } from "@executioncontrolprotocol/core"
import {
  ECP_ENCODING_ERROR_CODES,
  ECP_PLUGINS_MISSING,
  EcpError,
} from "@executioncontrolprotocol/core/types"

/**
 * Resolve a `format` token to a format-extension id.
 * @category MCP
 */
export function formatExtensionId(format: string): string {
  if (format.includes("/")) return format
  if (format.startsWith("format-")) return `@executioncontrolprotocol/${format}`
  return `@executioncontrolprotocol/format-${format}`
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

function isMissingFormat(err: unknown): boolean {
  return errorCode(err) === ECP_ENCODING_ERROR_CODES.FORMAT_EXTENSION_NOT_FOUND
}

/**
 * Optionally re-encode `data` through an installed format plugin (`toon`, …).
 * @category MCP
 */
export async function applyFormat(
  ecp: Ecp,
  data: unknown,
  format: string | undefined
): Promise<unknown> {
  if (!format) return data
  const extensionId = formatExtensionId(format)
  try {
    const result = await ecp.encode(data).uses(extensionId).asString().process()
    if (!result.success) {
      const diagnostic = result.diagnostics[0]
      throw new EcpError(
        diagnostic?.code ?? ECP_PLUGINS_MISSING,
        diagnostic?.message ?? `Format ${extensionId} is not installed`,
        { suggestions: ["Install the format plugin or omit format"] }
      )
    }
    return result.result
  } catch (err) {
    if (isMissingFormat(err)) {
      const name = extensionId.replace(/^@[^/]+\//, "")
      throw new EcpError(
        ECP_PLUGINS_MISSING,
        `Plugin @executioncontrolprotocol/plugin-${name} is not installed.`,
        {
          details: { package: `@executioncontrolprotocol/plugin-${name}` },
          suggestions: [`ecp plugins install ${name}`],
        }
      )
    }
    throw err
  }
}
