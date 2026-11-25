import { describe, expect, it } from "vitest"
import { defaultUploadBlobName } from "../src/blob-name.js"

describe("defaultUploadBlobName", () => {
  it("embeds run id, step id, safe name, 8 hex, and keeps the extension", () => {
    const name = defaultUploadBlobName("run-abc", "upload", {
      kind: "file",
      path: "/tmp/My Banner (1).PSD",
    })
    expect(name).toMatch(/^ecp\/run-abc\/upload\/My-Banner-1-[0-9a-f]{8}\.psd$/)
  })

  it("is unique per call", () => {
    const file = { kind: "file" as const, path: "/tmp/a.png" }
    expect(defaultUploadBlobName("run-1", "s", file)).not.toBe(defaultUploadBlobName("run-1", "s", file))
  })

  it("keeps a nested-call step id to one safe segment", () => {
    const name = defaultUploadBlobName("run-1", "call>@scope/plugin.upload", { kind: "file", path: "/tmp/a.png" })
    expect(name).toMatch(/^ecp\/run-1\/call-scope-plugin\.upload\/a-[0-9a-f]{8}\.png$/)
    expect(name.split("/")).toHaveLength(4)
  })

  it("falls back to upload when the name sanitizes to empty or can't be read", () => {
    for (const file of [
      { kind: "url" as const, url: "https://example.test/" },
      { kind: "file" as const, path: "/tmp/!!!" },
      { kind: "url" as const, url: "not a valid url" },
    ]) {
      expect(defaultUploadBlobName("run-1", "step", file)).toMatch(/^ecp\/run-1\/step\/upload-[0-9a-f]{8}$/)
    }
  })

  it("uses the artifact name, the URI's last segment, or a URL's decoded file name", () => {
    expect(
      defaultUploadBlobName("run-1", "step", {
        kind: "artifact",
        uri: "ecp://runs/run-1/artifacts/x.bin",
        name: "custom.bin",
      }),
    ).toMatch(/\/custom-[0-9a-f]{8}\.bin$/)
    expect(
      defaultUploadBlobName("run-1", "step", { kind: "artifact", uri: "ecp://runs/run-1/artifacts/report.pdf" }),
    ).toMatch(/\/report-[0-9a-f]{8}\.pdf$/)
    expect(
      defaultUploadBlobName("run-1", "step", { kind: "url", url: "https://cdn.test/a/My%20Photo.jpg?sig=1" }),
    ).toMatch(/\/My-Photo-[0-9a-f]{8}\.jpg$/)
  })
})
