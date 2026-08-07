import { describe, expect, it } from "vitest"
import { ECP_CORE_FORMATTER_IDS } from "@executioncontrolprotocol/types"
import { catalogExtension } from "../../src/registry/extension-catalog.js"
import { formatToonExtension } from "@executioncontrolprotocol/format-toon"
import {
  HARNESS_OUTPUT_FORMAT_TYPESCRIPT,
  inferResponseFormatFromFormatter,
  isCoreFormatterId,
  isFormatterRegistered,
  normalizeFormatId,
} from "../../src/harness/format-resolve.js"

describe("format-resolve", () => {
  it("identifies core formatter ids", () => {
    expect(isCoreFormatterId(ECP_CORE_FORMATTER_IDS.JSON)).toBe(true)
    expect(isCoreFormatterId(ECP_CORE_FORMATTER_IDS.FLUENT)).toBe(true)
    expect(isCoreFormatterId("@executioncontrolprotocol/format-toon")).toBe(false)
  })

  it("normalizes format ids", () => {
    expect(normalizeFormatId("format-json")).toBe("@executioncontrolprotocol/format-json")
  })

  it("infers response format hints from formatter ids", () => {
    expect(inferResponseFormatFromFormatter("@executioncontrolprotocol/format-json")).toBe("json")
    expect(inferResponseFormatFromFormatter("@executioncontrolprotocol/format-toon")).toBe("toon")
    expect(inferResponseFormatFromFormatter("@executioncontrolprotocol/format-fluent")).toBe("text")
    expect(inferResponseFormatFromFormatter("@executioncontrolprotocol/unknown-format")).toBe("text")
    expect(inferResponseFormatFromFormatter(HARNESS_OUTPUT_FORMAT_TYPESCRIPT)).toBe("text")
  })

  it("reports formatter registration for core and cataloged extensions", () => {
    expect(isFormatterRegistered("@executioncontrolprotocol/format-json")).toBe(true)
    expect(isFormatterRegistered("@executioncontrolprotocol/format-fluent")).toBe(true)
    expect(isFormatterRegistered("@executioncontrolprotocol/format-unknown")).toBe(false)

    catalogExtension(formatToonExtension)
    expect(isFormatterRegistered("@executioncontrolprotocol/format-toon")).toBe(true)
  })
})
