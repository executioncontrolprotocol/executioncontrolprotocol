import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { capabilityIdSchema, resolveCapabilityExecution } from "@executioncontrolprotocol/core"
import {
  adobeFireflyServicesExtension,
  ADOBE_GENERATED_OPERATION_COUNT,
} from "../src/index.browser.js"
import meta from "../src/generated/meta.json"

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("adobe-firefly-services browser catalog", () => {
  it("does not import invoke/IMS in the browser entry source", () => {
    const src = readFileSync(join(pkgRoot, "src/index.browser.ts"), "utf8")
    expect(src).not.toMatch(/runtime\/invoke/)
    expect(src).not.toMatch(/auth\/ims/)
    const dist = readFileSync(join(pkgRoot, "dist/index.browser.js"), "utf8")
    expect(dist).not.toMatch(/invokeAdobeOperation/)
    expect(dist).not.toMatch(/createImsTokenProvider/)
  })

  it("catalogs host execution for all capabilities with valid ids", () => {
    expect(adobeFireflyServicesExtension.supportedRuntimes).toEqual([
      "@executioncontrolprotocol/node",
    ])
    expect(adobeFireflyServicesExtension.capabilities).toHaveLength(ADOBE_GENERATED_OPERATION_COUNT)
    expect(adobeFireflyServicesExtension.capabilities).toHaveLength(meta.operationCount)
    expect(
      adobeFireflyServicesExtension.capabilities.every(
        (cap) => resolveCapabilityExecution(cap, adobeFireflyServicesExtension) === "host",
      ),
    ).toBe(true)
    for (const cap of adobeFireflyServicesExtension.capabilities) {
      expect(capabilityIdSchema.safeParse(cap.id).success, cap.id).toBe(true)
    }
  })
})
