import { afterEach, describe, expect, it, vi } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import {
  applyExternalRetrieve,
  applyOwnEchoRetrieve,
  applyStructuralEdit,
  applyRedo,
  applyUndo,
  commitVersionConflict,
  beginInFlightCommit,
  queueTextEdit,
  classifyRetrieve,
  commitRefused,
  commitSucceeded,
  createEditSession,
  formatVersionConflictNote,
  replayPendingOnConflict,
  resolveConflictWithItem,
  scriptsForInFlight,
  shouldPumpCommit,
  shouldWarnBeforeUnload,
  canRedo,
  canUndo,
  beginRetrieve,
  snapshotManifest,
  UNDO_CAP,
} from "../../src/client/edit-session.js"
import {
  AUTOSAVE_TEXT_MS,
  textSchedulerDiscard,
  textSchedulerDue,
  textSchedulerFlush,
  textSchedulerPending,
  textSchedulerSchedule,
} from "../../src/client/text-scheduler.js"

const base: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  execution: { id: "demo", label: "Demo" },
  steps: [{ id: "echo", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
}

describe("edit-session", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("applies two structural edits locally and queues both", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const first = applyStructuralEdit(session, "A", (manifest) => ({
      ok: true,
      manifest: { ...manifest, execution: { ...manifest.execution!, label: "One" } },
    }))
    session = beginInFlightCommit(first.state)
    expect(session.inFlightCount).toBe(1)
    const second = applyStructuralEdit(session, "B", (manifest) => ({
      ok: true,
      manifest: { ...manifest, execution: { ...manifest.execution!, label: "Two" } },
    }))
    expect(second.state.local.execution?.label).toBe("Two")
    expect(second.state.pending).toHaveLength(2)
  })

  it("commit success drops in-flight prefix and records own version", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    session = { ...session, inFlightCount: 1, pending: [{ kind: "edit", label: "A", apply: () => ({ ok: true, manifest: base }) }] }
    session = commitSucceeded(session, "v1", [])
    expect(session.version).toBe("v1")
    expect(session.ownVersions).toContain("v1")
    expect(session.pending).toHaveLength(0)
  })

  it("classifies own echo without replacing local when pending", () => {
    const session = createEditSession({ manifest: base, version: "v1", issues: [] })
    const withPending = {
      ...session,
      ownVersions: ["v1"],
      pending: [{ kind: "edit", label: "A", apply: () => ({ ok: true, manifest: base }) }],
      local: { ...base, execution: { id: "demo", label: "ahead" } },
    }
    const item = { path: "/d.ecp.json", version: "v1", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(withPending, item, { isFirstLoad: false, retrieveGeneration: 2 }).kind).toBe("own-echo")
    const next = applyOwnEchoRetrieve(withPending, item)
    expect(next.local.execution?.label).toBe("ahead")
    expect(next.undo).toHaveLength(0)
  })

  it("external reload clears undo and sets discard note when text pending", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    session = { ...session, undo: [{ manifest: base }] }
    const withUndo = applyUndo(session)
    expect(withUndo).toBeDefined()
    const item = { path: "/d.ecp.json", version: "v9", manifest: base, issues: [], warnings: [], updatedAt: "" }
    const next = applyExternalRetrieve(withUndo!, item, true)
    expect(next.undo).toHaveLength(0)
    expect(next.draftDiscardNote).toMatch(/unsaved edits were discarded/)
  })

  it("conflict replay drops failed edits and restore entries", () => {
    const replay = replayPendingOnConflict(base, [
      { kind: "edit", label: "Good", apply: (manifest) => ({ ok: true, manifest: { ...manifest, execution: { id: "demo", label: "ok" } } }) },
      { kind: "edit", label: "Bad", apply: () => ({ ok: false, reason: "nope" }) },
      { kind: "restore", label: "Undo", manifest: base },
    ])
    expect(replay.dropped).toEqual(["Bad", "Undo"])
    expect(replay.manifest.execution?.label).toBe("ok")
    expect(formatVersionConflictNote(replay.dropped)).toContain("Bad")
  })

  it("conflict replay drops a queued undo and names it", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    session = { ...session, undo: [{ manifest: base }] }
    const undone = applyUndo(session)
    expect(undone?.pending.at(-1)?.kind).toBe("restore")
    const item = {
      path: "/d.ecp.json",
      version: "v9",
      manifest: { ...base, execution: { id: "demo", label: "foreign" } },
      issues: [],
      warnings: [],
      updatedAt: "",
    }
    const next = resolveConflictWithItem(undone!, item)
    expect(next.versionConflictNote).toContain("Undo")
    expect(next.local.execution?.label).toBe("foreign")
    expect(next.pending).toHaveLength(0)
  })

  it("conflict replay re-applies a queued normal edit", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const item = {
      path: "/d.ecp.json",
      version: "v9",
      manifest: { ...base, execution: { id: "demo", label: "foreign" } },
      issues: [],
      warnings: [],
      updatedAt: "",
    }
    const next = resolveConflictWithItem(
      {
        ...session,
        pending: [
          {
            kind: "edit",
            label: "Relabel",
            apply: (manifest) => ({
              ok: true as const,
              manifest: { ...manifest, execution: { id: "demo", label: "replayed" } },
            }),
          },
        ],
      },
      item,
    )
    expect(next.versionConflictNote).toBeUndefined()
    expect(next.local.execution?.label).toBe("replayed")
    expect(next.pending).toHaveLength(1)
  })

  it("undo cap drops oldest snapshot", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    for (let index = 0; index < UNDO_CAP + 1; index += 1) {
      const result = applyStructuralEdit(session, `E${index}`, (manifest) => ({
        ok: true,
        manifest: { ...manifest, execution: { id: "demo", label: String(index) } },
      }))
      session = { ...result.state, pending: [], inFlightCount: 0 }
    }
    expect(session.undo).toHaveLength(UNDO_CAP)
  })

  it("failed structural edit sets structure error without queueing", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const result = applyStructuralEdit(session, "Bad", () => ({ ok: false, reason: "nope" }))
    expect(result.queued).toBe(false)
    expect(result.state.structureError).toBe("nope")
    expect(result.state.pending).toHaveLength(0)
  })

  it("defers external retrieve while pending commits exist", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const item = { path: "/d.ecp.json", version: "v9", manifest: base, issues: [], warnings: [], updatedAt: "" }
  const withPending = { ...session, pending: [{ kind: "edit" as const, label: "A", apply: () => ({ ok: true, manifest: base }) }] }
    expect(classifyRetrieve(withPending, item, { isFirstLoad: false, retrieveGeneration: 5 }).kind).toBe("deferred")
  })

  it("beginInFlightCommit is noop when queue empty", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    expect(beginInFlightCommit(session)).toEqual(session)
  })

  it("queueTextEdit failure does not enqueue", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const result = queueTextEdit(session, "Expr", () => ({ ok: false, reason: "bad" }))
    expect(result.ok).toBe(false)
    expect(result.state.pending).toHaveLength(0)
  })

  it("conflict replay empty success clears note", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const item = { path: "/d.ecp.json", version: "v2", manifest: base, issues: [], warnings: [], updatedAt: "" }
    const next = resolveConflictWithItem(
      { ...session, pending: [{ kind: "edit", label: "Bad", apply: () => ({ ok: false, reason: "nope" }) }] },
      item,
    )
    expect(next.versionConflictNote).toContain("Bad")
    expect(next.local).toEqual(base)
  })

  it("merges scripts from in-flight pending prefix", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const pending = [
      { kind: "edit" as const, label: "Script", apply: () => ({ ok: true, manifest: base }), scripts: { "a.js": "one" } },
      {
        kind: "restore" as const,
        label: "Undo",
        manifest: base,
        scripts: { "b.js": "two" },
      },
    ]
    expect(scriptsForInFlight({ ...session, pending, inFlightCount: 2 })).toEqual({ "a.js": "one", "b.js": "two" })
  })

  it("stale retrieve with own version still stale", () => {
    const session = {
      ...createEditSession({ manifest: base, version: "v1", issues: [] }),
      commitAckGeneration: 3,
      ownVersions: ["v0"],
    }
    const item = { path: "/d.ecp.json", version: "v0", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(session, item, { isFirstLoad: false, retrieveGeneration: 1 }).kind).toBe("stale")
  })

  it("external reload without text pending has no discard note", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const item = { path: "/d.ecp.json", version: "v9", manifest: base, issues: [], warnings: [], updatedAt: "" }
    const next = applyExternalRetrieve(session, item, false)
    expect(next.draftDiscardNote).toBeUndefined()
  })

  it("classifies initial retrieve", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const item = { path: "/d.ecp.json", version: "v0", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(session, item, { isFirstLoad: true, retrieveGeneration: 1 }).kind).toBe("initial")
  })

  it("classifies stale retrieve after commit ack", () => {
    const session = { ...createEditSession({ manifest: base, version: "v1", issues: [] }), commitAckGeneration: 2 }
    const item = { path: "/d.ecp.json", version: "v0", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(session, item, { isFirstLoad: false, retrieveGeneration: 1 }).kind).toBe("stale")
  })

  it("classifies idle external retrieve", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const item = { path: "/d.ecp.json", version: "v9", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(session, item, { isFirstLoad: false, retrieveGeneration: 5 }).kind).toBe("external")
  })

  it("commit refused and pump helpers", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const refused = commitRefused(session, "boom")
    expect(refused.status).toBe("error")
    expect(shouldPumpCommit(session)).toBe(false)
    const queued = { ...session, pending: [{ kind: "edit", label: "A", apply: () => ({ ok: true, manifest: base }) }] }
    expect(shouldPumpCommit(queued)).toBe(true)
    expect(scriptsForInFlight({ ...queued, inFlightCount: 1 })).toBeUndefined()
    const { generation } = beginRetrieve(session)
    expect(generation).toBe(1)
    expect(canUndo(session)).toBe(false)
    expect(canRedo(session)).toBe(false)
  })

  it("resolveConflictWithItem applies replay manifest", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    const item = {
      path: "/d.ecp.json",
      version: "v2",
      manifest: base,
      issues: [],
      warnings: [],
      updatedAt: "",
    }
    const next = resolveConflictWithItem(
      {
        ...session,
        pending: [{ kind: "edit", label: "Good", apply: (manifest) => ({ ok: true, manifest: { ...manifest, execution: { id: "demo", label: "after" } } }) }],
      },
      item,
    )
    expect(next.local.execution?.label).toBe("after")
    expect(next.version).toBe("v2")
  })

  it("shouldWarnBeforeUnload when pending or in flight", () => {
    const session = createEditSession({ manifest: base, version: "v0", issues: [] })
    expect(shouldWarnBeforeUnload(session)).toBe(false)
    expect(shouldWarnBeforeUnload({ ...session, pending: [{ kind: "edit", label: "A", apply: () => ({ ok: true, manifest: base }) }] })).toBe(
      true,
    )
    expect(shouldWarnBeforeUnload({ ...session, inFlightCount: 1 })).toBe(true)
    expect(shouldWarnBeforeUnload({ ...session, textScheduler: textSchedulerSchedule({}, 0) })).toBe(true)
  })

  it("redo queues restore and conflict keeps saving status", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    session = { ...session, undo: [{ manifest: base }], local: { ...base, execution: { id: "demo", label: "edited" } } }
    const undone = applyUndo(session)
    expect(undone?.pending.at(-1)?.label).toBe("Undo")
    expect(undone?.pending.at(-1)?.kind).toBe("restore")
    session = { ...session, redo: [{ manifest: base }] }
    const redone = applyRedo(session)
    expect(redone?.pending.at(-1)?.label).toBe("Redo")
    expect(redone?.pending.at(-1)?.kind).toBe("restore")
    expect(commitVersionConflict(session).status).toBe("saving")
  })

  it("new edit clears redo", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    session = { ...session, undo: [{ manifest: base }], redo: [{ manifest: base }] }
    const result = applyStructuralEdit(session, "Edit", (manifest) => ({ ok: true, manifest }))
    expect(result.state.redo).toHaveLength(0)
  })

  it("own echo with empty pending syncs version from retrieve", () => {
    const session = { ...createEditSession({ manifest: base, version: "v0", issues: [] }), ownVersions: ["v1"], pending: [] }
    const item = { path: "/d.ecp.json", version: "v1", manifest: base, issues: [], warnings: [], updatedAt: "" }
    const next = applyOwnEchoRetrieve(session, item)
    expect(next.version).toBe("v1")
    expect(next.ownVersions).not.toContain("v1")
  })

  it("commitSucceeded keeps saving while more pending", () => {
    const session = {
      ...createEditSession({ manifest: base, version: "v0", issues: [] }),
      inFlightCount: 1,
      pending: [
        { kind: "edit", label: "A", apply: () => ({ ok: true, manifest: base }) },
        { kind: "edit", label: "B", apply: () => ({ ok: true, manifest: base }) },
      ],
    }
    const next = commitSucceeded(session, "v1", [])
    expect(next.status).toBe("saving")
    expect(next.pending).toHaveLength(1)
  })

  it("classifies matching version as own echo", () => {
    const session = createEditSession({ manifest: base, version: "v1", issues: [] })
    const item = { path: "/d.ecp.json", version: "v1", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(session, item, { isFirstLoad: false, retrieveGeneration: 2 }).kind).toBe("own-echo")
  })

  it("snapshotManifest clones", () => {
    const copy = snapshotManifest(base)
    expect(copy).toEqual(base)
    expect(copy).not.toBe(base)
  })

  it("formatVersionConflictNote joins labels", () => {
    expect(formatVersionConflictNote(["A", "B"])).toContain("A, B")
  })

  describe("text scheduler", () => {
    it("fires at 500ms not 499ms", () => {
      vi.useFakeTimers()
      const state = textSchedulerSchedule({}, 0)
      expect(textSchedulerDue(state, 499)).toBe(false)
      expect(textSchedulerDue(state, 500)).toBe(true)
    })

    it("discard clears pending without firing", () => {
      let state = textSchedulerSchedule({}, 0)
      expect(textSchedulerPending(state)).toBe(true)
      state = textSchedulerDiscard(state)
      expect(textSchedulerPending(state)).toBe(false)
      state = textSchedulerFlush(state)
      expect(textSchedulerPending(state)).toBe(false)
    })

    it("reschedule resets deadline", () => {
      const state = textSchedulerSchedule(textSchedulerSchedule({}, 0), 400)
      expect(state.deadline).toBe(400 + AUTOSAVE_TEXT_MS)
    })
  })

  it("treats an external revert to bytes we wrote earlier as external once idle", () => {
    // We committed v1 then v2 (e.g. an edit and its undo / redo); the file now holds v1 again from outside.
    const session = { ...createEditSession({ manifest: base, version: "v2", issues: [] }), ownVersions: ["v1", "v2"] }
    const item = { path: "/x.ecp.json", version: "v1", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(session, item, { isFirstLoad: false, retrieveGeneration: 1 }).kind).toBe("external")
    expect(classifyRetrieve(session, { ...item, version: "v2" }, { isFirstLoad: false, retrieveGeneration: 1 }).kind).toBe(
      "own-echo",
    )
  })

  it("still matches an earlier own version while a later commit is outstanding", () => {
    const busy = {
      ...createEditSession({ manifest: base, version: "v1", issues: [] }),
      ownVersions: ["v1"],
      inFlightCount: 1,
      pending: [{ kind: "edit" as const, label: "B", apply: () => ({ ok: true as const, manifest: base }) }],
    }
    const item = { path: "/x.ecp.json", version: "v1", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(busy, item, { isFirstLoad: false, retrieveGeneration: 1 }).kind).toBe("own-echo")
    expect(classifyRetrieve(busy, { ...item, version: "zz" }, { isFirstLoad: false, retrieveGeneration: 1 }).kind).toBe(
      "deferred",
    )
  })

  it("forgets older own versions once the echo arrives with nothing outstanding", () => {
    const session = { ...createEditSession({ manifest: base, version: "v2", issues: [] }), ownVersions: ["v1", "v2"] }
    const item = { path: "/x.ecp.json", version: "v2", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(applyOwnEchoRetrieve(session, item).ownVersions).toEqual([])
  })

  it("a retrieve started after several commit acks is not stale (generations are reload counts)", () => {
    let session = createEditSession({ manifest: base, version: "v0", issues: [] })
    session = beginRetrieve(session).state // reload 1, before any commit
    for (const version of ["v1", "v2", "v3"]) {
      session = {
        ...session,
        inFlightCount: 1,
        pending: [{ kind: "edit" as const, label: "A", apply: () => ({ ok: true as const, manifest: base }) }],
      }
      session = commitSucceeded(session, version, [])
    }
    const { state, generation } = beginRetrieve(session) // reload 2, after the acks
    const item = { path: "/d.ecp.json", version: "elsewhere", manifest: base, issues: [], warnings: [], updatedAt: "" }
    expect(classifyRetrieve(state, item, { isFirstLoad: false, retrieveGeneration: generation }).kind).toBe("external")
    expect(classifyRetrieve(state, item, { isFirstLoad: false, retrieveGeneration: 1 }).kind).toBe("stale")
  })
})