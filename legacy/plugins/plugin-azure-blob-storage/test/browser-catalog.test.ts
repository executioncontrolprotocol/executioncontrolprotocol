import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { resolveCapabilityExecution } from "@executioncontrolprotocol/core"
import { azureBlobStorageExtension } from "../src/index.browser.js"

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

describe("azure-blob-storage browser catalog", () => {
  it("does not import the Azure SDK or node:fs in the browser graph", () => {
    const files = [
      "src/index.browser.ts",
      "src/capabilities/upload-mixed.ts",
      "dist/index.browser.js",
    ]
    for (const rel of files) {
      const text = readFileSync(join(pkgRoot, rel), "utf8")
      expect(text, rel).not.toMatch(/from ["']@azure\/storage-blob["']/)
      expect(text, rel).not.toMatch(/from ["']node:fs["']/)
    }
  })

  it("declares mixed upload and host SAS/download", () => {
    const byName = Object.fromEntries(
      azureBlobStorageExtension.capabilities.map((cap) => [
        cap.name,
        resolveCapabilityExecution(cap, azureBlobStorageExtension),
      ]),
    )
    expect(byName.upload).toBe("mixed")
    expect(byName["create-sas-url"]).toBe("host")
    expect(byName.download).toBe("host")
  })
})
