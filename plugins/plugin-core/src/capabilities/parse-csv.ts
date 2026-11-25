import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import { checkDelimiter, parseCsv, type CsvTable } from "../csv/parse-rfc4180.js"
import { CSV_MEDIA_TYPES, type ParseCsvInput } from "../schemas.js"

function invalid(message: string, details: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code: "ECP_INPUT_INVALID", details })
}

/** Decode UTF-8 strictly; UTF-16 files are rejected with a hint rather than read as garbage. */
function decode(bytes: Uint8Array): string {
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    throw invalid("The CSV file is UTF-16; save it as UTF-8.", { path: "file" })
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw invalid("The CSV file is not valid UTF-8.", { path: "file" })
  }
}

/**
 * parse-csv handler: read the file through the host and parse it (RFC 4180).
 * @category Plugins
 */
export default async function handler(input: ParseCsvInput, ctx: HandlerContext): Promise<CsvTable> {
  const delimiter = checkDelimiter(input.delimiter)
  const read = await ctx.files.bytes(input.file)
  const mediaType = (read.mediaType ?? "").split(";")[0]!.trim().toLowerCase()
  if (mediaType && mediaType !== "application/octet-stream" && !(CSV_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    throw invalid(`file is ${mediaType}; parse-csv reads ${CSV_MEDIA_TYPES.join(", ")}.`, { path: "file" })
  }
  return parseCsv(decode(read.bytes), { delimiter, header: input.header })
}
