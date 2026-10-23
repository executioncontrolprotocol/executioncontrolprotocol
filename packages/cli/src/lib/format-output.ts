import type { Ecp } from "@executioncontrolprotocol/core"
import { ECP_ENCODING_ERROR_CODES } from "@executioncontrolprotocol/core/types"
import {
  EcpCliError,
  ECP_INPUT_INVALID,
  ECP_PLUGINS_MISSING,
  EXIT_PLUGINS_MISSING,
  EXIT_USAGE,
} from "@executioncontrolprotocol/plugin-sdk"

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
 * Resolve a `--format` token to the first-party plugin package that provides it.
 * @category CLI
 */
export function formatPluginPackage(format: string): string {
  const id = formatExtensionId(format)
  const name = id.replace(/^@[^/]+\//, "")
  return `@executioncontrolprotocol/plugin-${name}`
}

function isMissingFormatError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === ECP_ENCODING_ERROR_CODES.FORMAT_EXTENSION_NOT_FOUND
  )
}

/**
 * Optionally re-encode `data` through an installed format plugin.
 * @category CLI
 */
export async function applyFormat(ecp: Ecp, data: unknown, format: string | undefined): Promise<unknown> {
  if (!format) return data
  const extensionId = formatExtensionId(format)
  try {
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
  } catch (err) {
    if (err instanceof EcpCliError) throw err
    if (isMissingFormatError(err)) {
      const pkg = formatPluginPackage(format)
      const installName = pkg.replace("@executioncontrolprotocol/plugin-", "")
      throw new EcpCliError(ECP_PLUGINS_MISSING, `Plugin ${pkg} is not installed.`, {
        details: { package: pkg },
        suggestions: [`ecp plugins install ${installName}`],
        exitCode: EXIT_PLUGINS_MISSING,
      })
    }
    throw err
  }
}
