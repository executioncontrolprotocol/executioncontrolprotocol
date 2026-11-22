/**
 * Parsed CSV table.
 * @category Plugins
 */
export interface CsvTable {
  /** Header names, or `[]` when `header` is false. */
  columns: string[]
  /** One object per record keyed by column, or string arrays when `header` is false. */
  rows: Array<Record<string, string>> | string[][]
}

/**
 * Parse options.
 * @category Plugins
 */
export interface CsvOptions {
  /** Field separator: one character, not `"`, CR or LF. Default `,`. */
  delimiter?: string
  /** Treat the first record as column names. Default `true`. */
  header?: boolean
}

function invalid(message: string, details: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { code: "ECP_INPUT_INVALID", details })
}

/**
 * Check a delimiter and return it.
 * @category Plugins
 */
export function checkDelimiter(delimiter: string | undefined): string {
  const value = delimiter ?? ","
  if ([...value].length !== 1 || value === '"' || value === "\r" || value === "\n") {
    throw invalid(`delimiter must be one character other than a quote or a line break; got ${JSON.stringify(value)}.`, {
      path: "delimiter",
    })
  }
  return value
}

/**
 * Split CSV text into records (RFC 4180): quoted fields, `""` escapes, delimiters and line breaks inside quotes,
 * CRLF or LF. A line break inside quotes is kept as `\n`. A trailing line break does not add a record.
 * @category Plugins
 */
export function parseRecords(text: string, delimiter = ","): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ""
  let quoted = false
  let fieldStarted = false
  let line = 1
  let index = 0
  const endRecord = () => {
    record.push(field)
    records.push(record)
    record = []
    field = ""
    fieldStarted = false
  }
  while (index < text.length) {
    const char = text[index]!
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        const next = text[index]
        if (next !== undefined && next !== delimiter && next !== "\r" && next !== "\n") {
          throw invalid(`Unexpected character after a closing quote on line ${line}.`, { line })
        }
        continue
      }
      if (char === "\r" && text[index + 1] === "\n") {
        field += "\n"
        index += 2
        line += 1
        continue
      }
      if (char === "\n" || char === "\r") line += 1
      field += char === "\r" ? "\n" : char
      index += 1
      continue
    }
    if (char === '"' && !fieldStarted) {
      quoted = true
      fieldStarted = true
      index += 1
      continue
    }
    if (char === '"') {
      throw invalid(`A quote inside an unquoted field on line ${line}; quote the whole field and write "" for a quote.`, {
        line,
      })
    }
    if (char === delimiter) {
      record.push(field)
      field = ""
      fieldStarted = false
      index += 1
      continue
    }
    if (char === "\r" || char === "\n") {
      endRecord()
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1
      line += 1
      continue
    }
    field += char
    fieldStarted = true
    index += 1
  }
  if (quoted) throw invalid(`A quoted field is not closed (opened before line ${line}).`, { line })
  if (fieldStarted || field !== "" || record.length > 0) endRecord()
  return records
}

/**
 * Parse CSV text into columns and rows. Every field is a string; nothing is trimmed or coerced.
 * @category Plugins
 */
export function parseCsv(text: string, options: CsvOptions = {}): CsvTable {
  const delimiter = checkDelimiter(options.delimiter)
  const body = text.startsWith("﻿") ? text.slice(1) : text
  const records = parseRecords(body, delimiter)
  if (options.header === false) return { columns: [], rows: records }
  if (records.length === 0) return { columns: [], rows: [] }
  const columns = records[0]!
  const seen = new Set<string>()
  columns.forEach((name, column) => {
    if (name === "") throw invalid(`Column ${column + 1} has an empty name.`, { column: column + 1 })
    if (seen.has(name)) throw invalid(`Column name ${JSON.stringify(name)} appears twice.`, { column: column + 1 })
    seen.add(name)
  })
  const rows = records.slice(1).map((record, offset) => {
    if (record.length !== columns.length) {
      throw invalid(`Record ${offset + 2} has ${record.length} fields; the header has ${columns.length}.`, {
        record: offset + 2,
      })
    }
    return Object.fromEntries(columns.map((name, column) => [name, record[column]!]))
  })
  return { columns, rows }
}
