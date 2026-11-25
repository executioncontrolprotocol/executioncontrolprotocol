import { describe, expect, it } from "vitest"
import {
  DEFAULT_FILE_MAX_BYTES_SETTINGS,
  resolveFileMaxBytes,
} from "@executioncontrolprotocol/protocol"

describe("resolveFileMaxBytes", () => {
  it("merges partial host settings over defaults", () => {
    expect(resolveFileMaxBytes({ maxBytes: { bytes: 100, capture: 50 } })).toEqual({
      ...DEFAULT_FILE_MAX_BYTES_SETTINGS,
      bytes: 100,
      capture: 50,
    })
    expect(resolveFileMaxBytes(undefined)).toEqual(DEFAULT_FILE_MAX_BYTES_SETTINGS)
  })

  it("defaults each maxBytes key independently", () => {
    expect(resolveFileMaxBytes({ maxBytes: { stream: 10 } }).stream).toBe(10)
    expect(resolveFileMaxBytes({ maxBytes: { path: 11 } }).path).toBe(11)
    expect(resolveFileMaxBytes({ maxBytes: { url: 12 } }).url).toBe(12)
    expect(resolveFileMaxBytes({ maxBytes: { bytes: 99 } }).bytes).toBe(99)
  })
})