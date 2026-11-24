import { describe, expect, it } from "vitest"
import type { ExecutionItem, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  applyCommitSuccess,
  applyRetrieveItem,
  applyRetrieveRefusal,
  executionUpdateInput,
  interpretCommitResponse,
  isExecutionUpdateRefusal,
  isPlainManifest,
  scriptTextFromRetrieve,
  validationFromIssues,
  VERSION_CONFLICT_NOTE,
} from "../../src/client/document-state.js"

const manifest: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: { id: "demo", label: "Demo" },
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
}

describe("document-state", () => {
  it("path retrieve sets string version, manifest, and validation from issues", () => {
    const item: ExecutionItem = {
      path: "/d/a.ecp.json",
      version: "a".repeat(64),
      manifest,
      issues: [{ code: "ECP_PLUGINS_MISSING", severity: "error", message: "missing", path: "" }],
      warnings: [],
      updatedAt: new Date().toISOString(),
    }
    const mapped = applyRetrieveItem({}, item)
    expect(mapped.version).toHaveLength(64)
    expect(mapped.manifest).toEqual(manifest)
    expect(mapped.validation?.valid).toBe(false)
    expect(mapped.bumpLoad).toBe(true)
  })

  it("id retrieve sets numeric version", () => {
    const item: ExecutionItem = {
      id: "saved",
      version: 3,
      manifest,
      issues: [],
      warnings: [],
      updatedAt: new Date().toISOString(),
    }
    expect(applyRetrieveItem({}, item).version).toBe(3)
  })

  it("successful commit updates validation from issues", () => {
    const patch = applyCommitSuccess(manifest, "b".repeat(64), [])
    expect(patch.validation.valid).toBe(true)
    expect(patch.versionConflictNote).toBeUndefined()
  })

  it("executionUpdateInput for path sends path, string ifVersion, and draft", () => {
    const input = executionUpdateInput({ kind: "path", path: "/d/a.ecp.json" }, manifest, "v".repeat(64))
    expect(input).toMatchObject({
      type: "execution",
      action: "update",
      path: "/d/a.ecp.json",
      ifVersion: "v".repeat(64),
      draft: true,
    })
    expect(input).not.toHaveProperty("id")
  })

  it("executionUpdateInput for id sends id and numeric ifVersion", () => {
    const input = executionUpdateInput({ kind: "id", id: "x" }, manifest, 2)
    expect(input).toMatchObject({
      type: "execution",
      action: "update",
      id: "x",
      ifVersion: 2,
      draft: true,
    })
  })

  it("path update without scripts omits the scripts field", () => {
    const bare = executionUpdateInput({ kind: "path", path: "/d/a.ecp.json" }, manifest, "v".repeat(64))
    expect(bare).not.toHaveProperty("scripts")
    const emptyMap = executionUpdateInput({ kind: "path", path: "/d/a.ecp.json" }, manifest, "v".repeat(64), {})
    expect(emptyMap).not.toHaveProperty("scripts")
  })

  it("applyCommitSuccess with only warnings stays valid", () => {
    const patch = applyCommitSuccess(manifest, 4, [
      { code: "ECP_PLUGINS_MISSING", severity: "warning", message: "w", path: "" },
    ])
    expect(patch.validation.valid).toBe(true)
  })

  it("script save adds scripts on path", () => {
    const input = executionUpdateInput({ kind: "path", path: "/d/a.ecp.json" }, manifest, "v".repeat(64), {
      "helper.js": "ok\n",
    })
    expect(input).toMatchObject({ scripts: { "helper.js": "ok\n" } })
  })

  it("ECP_EXECUTION_LOAD retrieve refusal keeps previous manifest and version", () => {
    const prev = { manifest, version: "old" }
    const next = applyRetrieveRefusal(prev, { code: "ECP_EXECUTION_LOAD", message: "not JSON" })
    expect(next.manifest).toBe(manifest)
    expect(next.version).toBe("old")
    expect(next.loadError?.code).toBe("ECP_EXECUTION_LOAD")
  })

  it("first load refusal leaves manifest undefined", () => {
    const next = applyRetrieveRefusal({}, { code: "ECP_EXECUTION_LOAD", message: "not JSON" })
    expect(next.manifest).toBeUndefined()
  })

  it("ECP_VERSION_CONFLICT does not change manifest in interpret", () => {
    const outcome = interpretCommitResponse({
      ok: false,
      error: { code: "ECP_VERSION_CONFLICT", message: "stale" },
    })
    expect(outcome).toEqual({ ok: false, versionConflict: true })
  })

  it("isExecutionUpdateRefusal distinguishes errors from commit input", () => {
    expect(isExecutionUpdateRefusal({ error: "nope" })).toBe(true)
    expect(isExecutionUpdateRefusal(executionUpdateInput({ kind: "id", id: "x" }, manifest, 1) as never)).toBe(false)
  })

  it("missing version refuses before commit", () => {
    expect(executionUpdateInput({ kind: "path", path: "/a.ecp.json" }, manifest, undefined)).toEqual({
      error: "Stored version is not loaded.",
    })
  })

  it("number on path and string on id refuse", () => {
    expect(executionUpdateInput({ kind: "path", path: "/a.ecp.json" }, manifest, 1)).toEqual({
      error: "Path version is not loaded.",
    })
    expect(executionUpdateInput({ kind: "id", id: "x" }, manifest, "hex")).toEqual({
      error: "Stored version is not loaded.",
    })
  })

  it("scripts on id refuse", () => {
    expect(
      executionUpdateInput({ kind: "id", id: "x" }, manifest, 1, { "a.js": "x" }),
    ).toEqual({
      error: "Script files cannot be saved for stored execution ids.",
    })
  })

  it("non-object manifest can keep conflict note when requested", () => {
    const item = {
      path: "/a.ecp.json",
      version: "c".repeat(64),
      manifest: null as unknown as ExecutionManifest,
      issues: [],
      warnings: [],
      updatedAt: new Date().toISOString(),
    }
    expect(
      applyRetrieveItem({ versionConflictNote: VERSION_CONFLICT_NOTE }, item, { keepConflictNote: true })
        .versionConflictNote,
    ).toBe(VERSION_CONFLICT_NOTE)
  })

  it("non-object manifest in item is a load error and keeps the graph", () => {
    const item = {
      path: "/a.ecp.json",
      version: "c".repeat(64),
      manifest: [] as unknown as ExecutionManifest,
      issues: [],
      warnings: [],
      updatedAt: new Date().toISOString(),
    }
    const mapped = applyRetrieveItem({ manifest, version: "old" }, item)
    expect(mapped.manifest).toBe(manifest)
    expect(mapped.loadError?.code).toBe("ECP_EXECUTION_LOAD")
  })

  it("later successful retrieve clears loadError but can keep conflict note", () => {
    const item: ExecutionItem = {
      path: "/a.ecp.json",
      version: "d".repeat(64),
      manifest,
      issues: [],
      warnings: [],
      updatedAt: new Date().toISOString(),
    }
    const mapped = applyRetrieveItem(
      { loadError: { code: "ECP_EXECUTION_LOAD", message: "x" }, versionConflictNote: VERSION_CONFLICT_NOTE },
      item,
      { keepConflictNote: true },
    )
    expect(mapped.loadError).toBeUndefined()
    expect(mapped.versionConflictNote).toBe(VERSION_CONFLICT_NOTE)
  })

  it("empty issues on draft commit is valid", () => {
    expect(validationFromIssues([]).valid).toBe(true)
  })

  it("isPlainManifest rejects non-objects", () => {
    expect(isPlainManifest(null)).toBe(false)
    expect(isPlainManifest([])).toBe(false)
    expect(isPlainManifest(manifest)).toBe(true)
  })

  it("validationFromIssues sorts by path when severity matches", () => {
    const result = validationFromIssues([
      { code: "ECP_PLUGINS_MISSING", severity: "error", message: "b", path: "/b" },
      { code: "ECP_PLUGINS_MISSING", severity: "error", message: "a", path: "/a" },
    ])
    expect(result.issues[0]?.path).toBe("/a")
  })

  it("validationFromIssues sorts errors before warnings", () => {
    const result = validationFromIssues([
      { code: "ECP_PLUGINS_MISSING", severity: "warning", message: "w", path: "/b" },
      { code: "ECP_PLUGINS_MISSING", severity: "error", message: "e", path: "/a" },
    ])
    expect(result.issues[0]?.severity).toBe("error")
    expect(result.valid).toBe(false)
  })

  it("interpretCommitResponse returns version and issues on success", () => {
    expect(
      interpretCommitResponse({
        ok: true,
        data: { type: "execution", version: "f".repeat(64), issues: [{ code: "ECP_PLUGINS_MISSING", severity: "warning", message: "w", path: "" }] },
      }),
    ).toEqual({
      ok: true,
      version: "f".repeat(64),
      issues: [{ code: "ECP_PLUGINS_MISSING", severity: "warning", message: "w", path: "" }],
    })
  })

  it("interpretCommitResponse maps non-conflict refusals to a message", () => {
    expect(
      interpretCommitResponse({ ok: false, error: { code: "ECP_MANIFEST_INVALID", message: "bad manifest" } }),
    ).toEqual({ ok: false, message: "bad manifest" })
  })

  it("interpretCommitResponse refuses success without version", () => {
    expect(interpretCommitResponse({ ok: true, data: { type: "execution", version: null } })).toMatchObject({
      ok: false,
      message: "Commit succeeded without a version.",
    })
  })

  it("applyRetrieveItem can keep conflict note on a good load", () => {
    const item: ExecutionItem = {
      path: "/a.ecp.json",
      version: "g".repeat(64),
      manifest,
      issues: [],
      warnings: [],
      updatedAt: new Date().toISOString(),
    }
    expect(
      applyRetrieveItem({ versionConflictNote: VERSION_CONFLICT_NOTE }, item, { keepConflictNote: true })
        .versionConflictNote,
    ).toBe(VERSION_CONFLICT_NOTE)
  })

  it("applyRetrieveItem clears conflict note unless asked to keep it", () => {
    const item: ExecutionItem = {
      path: "/a.ecp.json",
      version: "g".repeat(64),
      manifest,
      issues: [],
      warnings: [],
      updatedAt: new Date().toISOString(),
    }
    expect(applyRetrieveItem({ versionConflictNote: VERSION_CONFLICT_NOTE }, item).versionConflictNote).toBeUndefined()
  })

  it("scriptTextFromRetrieve rejects list-shaped retrieve data", () => {
    const result = scriptTextFromRetrieve({ ok: true, data: { type: "run", items: [], total: 0 } }, "a.js")
    expect(result.ok).toBe(false)
  })

  it("scriptTextFromRetrieve returns script text and handles missing key", () => {
    const ok = scriptTextFromRetrieve(
      {
        ok: true,
        data: {
          type: "execution",
          item: {
            path: "/a.ecp.json",
            version: "e".repeat(64),
            manifest,
            issues: [],
            warnings: [],
            updatedAt: new Date().toISOString(),
            scripts: { "banner.js": "const x = 1\n" },
          },
        },
      },
      "banner.js",
    )
    expect(ok).toEqual({ ok: true, text: "const x = 1\n" })
    const miss = scriptTextFromRetrieve(
      {
        ok: true,
        data: {
          type: "execution",
          item: {
            path: "/a.ecp.json",
            version: "e".repeat(64),
            manifest,
            issues: [],
            warnings: [],
            updatedAt: new Date().toISOString(),
            scripts: {},
          },
        },
      },
      "gone.js",
    )
    expect(miss.ok).toBe(false)
    const refused = scriptTextFromRetrieve(
      { ok: false, error: { code: "ECP_NOT_FOUND", message: "Script missing" } },
      "gone.js",
    )
    expect(refused.ok).toBe(false)
  })
})