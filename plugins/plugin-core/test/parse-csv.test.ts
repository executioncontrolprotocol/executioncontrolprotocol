import { describe, expect, it } from "vitest"
import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"
import handler from "../src/capabilities/parse-csv.js"
import { parseCsv, parseRecords } from "../src/csv/parse-rfc4180.js"
import plugin from "../src/index.js"

const utf8 = (text: string) => new TextEncoder().encode(text)

function ctx(read: () => Promise<{ bytes: Uint8Array; mediaType?: string }>): HandlerContext {
  return { files: { bytes: read } } as unknown as HandlerContext
}

const file = { kind: "file" as const, path: "variants.csv" }

describe("parseCsv", () => {
  it("reads quoted commas, escaped quotes and line breaks inside quotes", () => {
    const table = parseCsv('title,subtitle\n"Sun, sand","Say ""hi""\nnow"\n')
    expect(table).toEqual({
      columns: ["title", "subtitle"],
      rows: [{ title: "Sun, sand", subtitle: 'Say "hi"\nnow' }],
    })
  })

  it("accepts CRLF, strips a BOM and keeps whitespace and empty fields as they are", () => {
    expect(parseCsv('﻿a,b\r\n x ,\r\n"",y')).toEqual({
      columns: ["a", "b"],
      rows: [
        { a: " x ", b: "" },
        { a: "", b: "y" },
      ],
    })
  })

  it("normalises a CRLF inside quotes to LF", () => {
    expect(parseRecords('"a\r\nb",c')).toEqual([["a\nb", "c"]])
  })

  it("returns string arrays and no columns without a header", () => {
    expect(parseCsv("1,2\n3,4", { header: false })).toEqual({ columns: [], rows: [["1", "2"], ["3", "4"]] })
  })

  it("splits on a tab delimiter", () => {
    expect(parseCsv("a\tb\n1,2\t3", { delimiter: "\t" }).rows).toEqual([{ a: "1,2", b: "3" }])
  })

  it("handles an empty file and a header-only file", () => {
    expect(parseCsv("")).toEqual({ columns: [], rows: [] })
    expect(parseCsv("", { header: false })).toEqual({ columns: [], rows: [] })
    expect(parseCsv("a,b\n")).toEqual({ columns: ["a", "b"], rows: [] })
  })

  it("keeps a trailing empty field", () => {
    expect(parseRecords("a,\n")).toEqual([["a", ""]])
  })

  it("rejects a bad delimiter", () => {
    for (const delimiter of ['"', "\n", "\r", "", ";;"]) {
      expect(() => parseCsv("a", { delimiter })).toThrow(expect.objectContaining({ code: "ECP_INPUT_INVALID" }))
    }
  })

  it("rejects duplicate and empty column names", () => {
    expect(() => parseCsv("a,a\n1,2")).toThrow(/appears twice/)
    expect(() => parseCsv("a,\n1,2")).toThrow(/empty name/)
  })

  it("rejects a ragged record and names it", () => {
    expect(() => parseCsv("a,b\n1,2\n3")).toThrow(/Record 3 has 1 fields; the header has 2/)
  })

  it("rejects an unclosed quote, a quote inside an unquoted field and text after a closing quote", () => {
    expect(() => parseCsv('a\n"open')).toThrow(/not closed/)
    expect(() => parseCsv('a\nx"y')).toThrow(/inside an unquoted field/)
    expect(() => parseCsv('a\n"x"y')).toThrow(/after a closing quote on line 2/)
  })
})

describe("parse-csv handler", () => {
  it("is registered on the core plugin", () => {
    const def = plugin.capabilities["parse-csv"]
    expect(def.summary).toContain("CSV")
    expect(def.contract).toBeUndefined()
  })

  it("lazy-loads its handler", async () => {
    expect((await plugin.capabilities["parse-csv"].handler()).default).toBe(handler)
  })

  it("reads the file through the host and parses it", async () => {
    const seen: unknown[] = []
    const result = await handler(
      { file },
      ctx(async () => {
        seen.push(file)
        return { bytes: utf8("title,background\nHello,beach.jpg\n"), mediaType: "text/csv" }
      }),
    )
    expect(seen).toHaveLength(1)
    expect(result.rows).toEqual([{ title: "Hello", background: "beach.jpg" }])
  })

  it("accepts a file with no or a generic media type", async () => {
    await expect(handler({ file }, ctx(async () => ({ bytes: utf8("a\n1") })))).resolves.toMatchObject({ columns: ["a"] })
    await expect(
      handler({ file, header: false }, ctx(async () => ({ bytes: utf8("a"), mediaType: "application/octet-stream" }))),
    ).resolves.toMatchObject({ rows: [["a"]] })
  })

  it("rejects another media type", async () => {
    await expect(
      handler({ file }, ctx(async () => ({ bytes: utf8("a"), mediaType: "image/png" }))),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID", message: expect.stringContaining("image/png") })
  })

  it("rejects invalid UTF-8 and UTF-16", async () => {
    await expect(
      handler({ file }, ctx(async () => ({ bytes: Uint8Array.from([0x61, 0xff, 0x62]) }))),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID", message: expect.stringContaining("UTF-8") })
    await expect(
      handler({ file }, ctx(async () => ({ bytes: Uint8Array.from([0xff, 0xfe, 0x61, 0x00]) }))),
    ).rejects.toMatchObject({ message: expect.stringContaining("UTF-16") })
  })

  it("rejects a bad delimiter before reading the file", async () => {
    let reads = 0
    await expect(
      handler({ file, delimiter: '"' }, ctx(async () => ((reads += 1), { bytes: utf8("a") }))),
    ).rejects.toMatchObject({ code: "ECP_INPUT_INVALID" })
    expect(reads).toBe(0)
  })

  it("passes the host's size-cap error through", async () => {
    const tooBig = Object.assign(new Error("file exceeds the read cap"), { code: "ECP_INPUT_INVALID" })
    await expect(
      handler({ file }, ctx(async () => {
        throw tooBig
      })),
    ).rejects.toBe(tooBig)
  })
})
