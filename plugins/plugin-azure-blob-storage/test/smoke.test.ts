import { describe, expect, it } from "vitest"
import plugin, {
  azureBlobConfigSchema,
  sasAcceptsSchema,
  uploadAcceptsSchema,
} from "../src/index.js"
import { resolveConfig, resolveContainer } from "../src/config.js"

describe("plugin-azure-blob-storage definition", () => {
  it("exports upload, download and sas with metadata", () => {
    expect(plugin.id).toBe("@executioncontrolprotocol/azure-blob-storage")
    expect(Object.keys(plugin.capabilities)).toEqual(["upload", "download", "sas", "delete"])
    for (const definition of Object.values(plugin.capabilities)) {
      expect(definition.useCases.length).toBeGreaterThan(0)
      expect(definition.projections.length).toBeGreaterThan(0)
    }
  })

  it("loads every handler through its lazy thunk", async () => {
    for (const definition of Object.values(plugin.capabilities)) {
      const mod = await definition.handler()
      expect(typeof mod.default).toBe("function")
    }
    // First import of @azure/storage-blob is slow (seconds), more so under full-suite load (audit F20).
  }, 30_000)
})

describe("config schema", () => {
  it("accepts a connection string or an account name and key", () => {
    expect(azureBlobConfigSchema.safeParse({ connectionString: "UseDevelopmentStorage=true" }).success).toBe(true)
    expect(
      azureBlobConfigSchema.safeParse({ accountName: "acct", accountKey: "a2V5", defaultContainer: "ecp" }).success,
    ).toBe(true)
  })

  it("rejects an empty connection string, a lone account name and an empty default container", () => {
    expect(azureBlobConfigSchema.safeParse({ connectionString: "" }).success).toBe(false)
    expect(azureBlobConfigSchema.safeParse({ accountName: "acct" }).success).toBe(false)
    expect(azureBlobConfigSchema.safeParse({ accountName: "acct", accountKey: "" }).success).toBe(false)
    expect(azureBlobConfigSchema.safeParse({ connectionString: "x", defaultContainer: "" }).success).toBe(false)
    expect(azureBlobConfigSchema.safeParse({}).success).toBe(false)
  })

  it("resolveConfig throws ECP_CONFIG_INVALID with issues", () => {
    expect(() => resolveConfig({ connectionString: "" })).toThrow(
      expect.objectContaining({ code: "ECP_CONFIG_INVALID", details: { issues: expect.any(Array) } }),
    )
    expect(() => resolveConfig(undefined)).toThrow(expect.objectContaining({ code: "ECP_CONFIG_INVALID" }))
  })

  it("resolveContainer prefers the input, falls back to the default, else fails", () => {
    expect(resolveContainer({ connectionString: "x", defaultContainer: "d" }, "in")).toBe("in")
    expect(resolveContainer({ connectionString: "x", defaultContainer: "d" }, undefined)).toBe("d")
    expect(() => resolveContainer({ connectionString: "x" }, undefined)).toThrow(
      expect.objectContaining({ code: "ECP_INPUT_INVALID" }),
    )
  })
})

describe("input schemas", () => {
  it("requires a path on file refs and a valid URL on url refs", () => {
    const missingPath = uploadAcceptsSchema.safeParse({ file: { kind: "file" } })
    expect(missingPath.success).toBe(false)
    expect(missingPath.error?.issues[0]?.path).toEqual(["file", "path"])
    expect(uploadAcceptsSchema.safeParse({ file: { kind: "url", url: "nope" } }).success).toBe(false)
    expect(uploadAcceptsSchema.safeParse({ file: { kind: "buffer", data: "AA==" } }).success).toBe(false)
    expect(uploadAcceptsSchema.safeParse({ file: { kind: "file", path: "/tmp/a.png" }, blobName: "" }).success).toBe(
      false,
    )
    expect(
      uploadAcceptsSchema.safeParse({ file: { kind: "artifact", uri: "ecp://runs/r/artifacts/a.png" } }).success,
    ).toBe(true)
  })

  it("limits SAS permissions to r, a, c, w, d and lifetimes to positive integers", () => {
    expect(sasAcceptsSchema.safeParse({ blobName: "b", permissions: "rw" }).success).toBe(true)
    expect(sasAcceptsSchema.safeParse({ blobName: "b", permissions: "rl" }).success).toBe(false)
    expect(sasAcceptsSchema.safeParse({ blobName: "b", permissions: "" }).success).toBe(false)
    expect(sasAcceptsSchema.safeParse({ blobName: "b", expiresInSeconds: 0 }).success).toBe(false)
    expect(sasAcceptsSchema.safeParse({ blobName: "b", expiresInSeconds: 1.5 }).success).toBe(false)
  })
})
