import { ECP_CORE_FORMATTER_IDS, ECP_FORMATS } from "@executioncontrolprotocol/types"

/** CLI `--format` values. */
export type CliFormat = "json" | "toon" | "fluent"

const FORMAT_EXTENSION: Record<CliFormat, string> = {
  json: ECP_CORE_FORMATTER_IDS.JSON,
  toon: "@executioncontrolprotocol/format-toon",
  fluent: ECP_CORE_FORMATTER_IDS.FLUENT,
}

/**
 * Map CLI format flag to formatter extension id for `ecp.encode().uses(...)`.
 * @category CLI
 */
export function formatToExtensionId(format: CliFormat): string {
  return FORMAT_EXTENSION[format]
}

/**
 * Parse and validate CLI format flag.
 * @category CLI
 */
export function parseCliFormat(value: string | undefined): CliFormat {
  const f = (value ?? ECP_FORMATS.JSON) as CliFormat
  if (f !== "json" && f !== "toon" && f !== "fluent") {
    throw new Error(`Unknown format "${value}". Use json, toon, or fluent.`)
  }
  return f
}
