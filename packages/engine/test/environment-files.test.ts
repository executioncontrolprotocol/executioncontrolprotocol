import { describe, expect, it } from "vitest"
import { DEFAULT_FILE_MAX_BYTES_SETTINGS } from "@executioncontrolprotocol/protocol"
import { resolveHostSettings } from "../src/container/environment.js"

describe("resolveHostSettings files", () => {
  it("resolves file caps on the host settings", () => {
    const resolved = resolveHostSettings({
      home: "/tmp/ecp",
      files: { maxBytes: { url: 10 } },
    })
    expect(resolved.files).toEqual({ ...DEFAULT_FILE_MAX_BYTES_SETTINGS, url: 10 })
  })
})