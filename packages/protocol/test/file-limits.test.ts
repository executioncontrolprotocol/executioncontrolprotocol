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
})