import type { ExecutionManifest, RunEvent, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import {
  capabilitySchemaIndex,
  issueFromError,
  issueNodeId,
  newRunEvents,
  nodeErrorIssues,
  parseExecutionText,
  resolveScriptPath,
  retrieveItem,
  retrieveItems,
  samePath,
  validationFromExecute,
} from "../../src/client/results.js"

const manifest: ExecutionManifest = {
  schema: "@executioncontrolprotocol.execution",
  version: "2.0",
  steps: [
    { id: "first", uses: "@ecp/test.echo", input: { text: "a" } },
    {
      type: "if",
      id: "pick",
      expression: "true",
      then: [{ id: "inner", uses: "@ecp/test.echo", input: { "a/b": 1 } }],
      else: [{ id: "fallback", uses: "@ecp/test.echo" }],
    },
  ],
}

function issue(path: string, extra: Partial<ValidationIssue> = {}): ValidationIssue {
  return { code: "ECP_TYPE_MISMATCH", severity: "error", message: "m", path, ...extra }
}

function event(seq: number, type: RunEvent["type"] = "step.start"): RunEvent {
  return { seq, type, at: "t", data: {} }
}

describe("retrieveItem / retrieveItems", () => {
  it("reads an item or items from ok responses", () => {
    expect(retrieveItem({ ok: true, data: { type: "run", item: { id: "r" } } })).toEqual({ id: "r" })
    expect(retrieveItems({ ok: true, data: { type: "run", items: [{ id: "a" }], total: 1 } })).toEqual([{ id: "a" }])
  })

  it("returns nothing for refusals and the other shape", () => {
    const refused = { ok: false as const, error: { code: "ECP_NOT_FOUND", message: "x" } }
    expect(retrieveItem(refused)).toBeUndefined()
    expect(retrieveItems(refused)).toEqual([])
    expect(retrieveItem({ ok: true, data: { type: "run", items: [], total: 0 } })).toBeUndefined()
    expect(retrieveItems({ ok: true, data: { type: "run", item: {} } })).toEqual([])
  })
})

describe("issueFromError", () => {
  it("copies code, message, path and suggestions", () => {
    expect(
      issueFromError({ code: "ECP_NOT_FOUND", message: "gone", path: "/steps/0", suggestions: ["a"] }),
    ).toEqual({ code: "ECP_NOT_FOUND", severity: "error", message: "gone", path: "/steps/0", suggestions: ["a"] })
  })

  it("defaults the path and omits missing suggestions", () => {
    expect(issueFromError({ code: "ECP_INTERNAL", message: "x" })).toEqual({
      code: "ECP_INTERNAL",
      severity: "error",
      message: "x",
      path: "",
    })
  })
})

describe("validationFromExecute", () => {
  it("returns the validation of an ok response", () => {
    const warning = issue("/steps/0", { severity: "warning" })
    expect(
      validationFromExecute({
        ok: true,
        data: { validation: { valid: true, issues: [warning], manifestHash: "h", schemaHash: "s" } },
      }),
    ).toEqual({ valid: true, issues: [warning] })
  })

  it("uses the issues of a refused validation", () => {
    const error = { code: "ECP_MANIFEST_INVALID", message: "bad", issues: [issue("/steps/1")] }
    expect(validationFromExecute({ ok: false, error })).toEqual({ valid: false, issues: error.issues, error })
  })

  it("turns a refusal without issues into one issue", () => {
    const error = { code: "ECP_EXECUTION_LOAD", message: "no json", issues: [] }
    const result = validationFromExecute({ ok: false, error })
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([{ code: "ECP_EXECUTION_LOAD", severity: "error", message: "no json", path: "" }])
  })
})

describe("parseExecutionText", () => {
  it("parses a JSON object", () => {
    expect(parseExecutionText('{"schema":"x","steps":[]}')).toEqual({ ok: true, manifest: { schema: "x", steps: [] } })
  })

  it("reports invalid JSON as ECP_EXECUTION_LOAD", () => {
    const result = parseExecutionText('{"schema": ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe("ECP_EXECUTION_LOAD")
      expect(result.error.message).toMatch(/^The execution file is not valid JSON: /)
      expect(result.error.suggestions).toHaveLength(1)
    }
  })

  it("rejects JSON that is not an object", () => {
    for (const text of ["[]", "null", "3", '"s"']) {
      const result = parseExecutionText(text)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe("The execution file does not contain a JSON object.")
    }
  })
})

describe("capabilitySchemaIndex", () => {
  it("indexes accepts and returns by capability id", () => {
    const accepts = { type: "object", properties: { text: { type: "string" } } }
    expect(
      capabilitySchemaIndex([
        { id: "@ecp/test.echo", accepts, returns: { type: "object" } },
        { id: "@ecp/test.bare" },
        { summary: "no id" },
      ]),
    ).toEqual({
      "@ecp/test.echo": { accepts, returns: { type: "object" } },
      "@ecp/test.bare": {},
    })
  })

  it("is empty for no entries", () => {
    expect(capabilitySchemaIndex([])).toEqual({})
  })
})

describe("issueNodeId", () => {
  it("prefers issue.nodeId", () => {
    expect(issueNodeId(issue("/steps/0", { nodeId: "explicit" }), manifest)).toBe("explicit")
  })

  it("finds the deepest node on the pointer path", () => {
    expect(issueNodeId(issue("/steps/0/input/text"), manifest)).toBe("first")
    expect(issueNodeId(issue("/steps/1"), manifest)).toBe("pick")
    expect(issueNodeId(issue("/steps/1/then/0/input/a~1b"), manifest)).toBe("inner")
    expect(issueNodeId(issue("/steps/1/else/0/uses"), manifest)).toBe("fallback")
  })

  it("reads an @nodeId segment", () => {
    expect(issueNodeId(issue("/steps/@inner/input"), manifest)).toBe("inner")
    expect(issueNodeId(issue("/steps/@solo"))).toBe("solo")
  })

  it("returns undefined outside nodes or without a usable path", () => {
    expect(issueNodeId(issue("/execution/accepts"), manifest)).toBeUndefined()
    expect(issueNodeId(issue("/steps/9/input"), manifest)).toBeUndefined()
    expect(issueNodeId(issue(""), manifest)).toBeUndefined()
    expect(issueNodeId(issue("/input/x"), manifest)).toBeUndefined()
    expect(issueNodeId(issue("steps/0"), manifest)).toBeUndefined()
    expect(issueNodeId(issue("/steps/0"))).toBeUndefined()
    expect(issueNodeId(issue("/steps/@"), manifest)).toBeUndefined()
  })

  it("decodes ~0 in pointer segments", () => {
    const m = { schema: "x", steps: [{ id: "s", uses: "u", input: { "a~b": { $ref: "state.x" } } }] }
    expect(issueNodeId(issue("/steps/0/input/a~0b"), m as unknown as ExecutionManifest)).toBe("s")
  })
})

describe("nodeErrorIssues", () => {
  it("groups error issues by node and skips warnings and unplaced issues", () => {
    const a = issue("/steps/0/input")
    const b = issue("/steps/0/uses")
    const c = issue("/steps/1/then/0")
    const warning = issue("/steps/0", { severity: "warning" })
    const loose = issue("/execution")
    expect(nodeErrorIssues([a, b, c, warning, loose], manifest)).toEqual({ first: [a, b], inner: [c] })
  })
})

describe("resolveScriptPath", () => {
  it("joins relative paths to the execution folder with its separator", () => {
    expect(resolveScriptPath("/w/flows/a.ecp.json", "scripts/x.js")).toBe("/w/flows/scripts/x.js")
    expect(resolveScriptPath("/w/flows/a.ecp.json", "./x.js")).toBe("/w/flows/x.js")
    expect(resolveScriptPath("C:\\w\\a.ecp.json", "x.js")).toBe("C:\\w\\x.js")
    expect(resolveScriptPath("/w/a.ecp.json", "../x.js")).toBe("/w/../x.js")
  })

  it("keeps absolute script paths", () => {
    expect(resolveScriptPath("/w/a.ecp.json", "/abs/x.js")).toBe("/abs/x.js")
    expect(resolveScriptPath("C:\\w\\a.ecp.json", "D:\\s\\x.js")).toBe("D:\\s\\x.js")
    expect(resolveScriptPath("C:\\w\\a.ecp.json", "D:/s/x.js")).toBe("D:/s/x.js")
  })

  it("returns the script path when the execution path has no folder", () => {
    expect(resolveScriptPath("a.ecp.json", "x.js")).toBe("x.js")
  })
})

describe("samePath", () => {
  it("ignores separators and Windows drive case", () => {
    expect(samePath("C:\\Work\\a.ecp.json", "c:/work/a.ecp.json")).toBe(true)
    expect(samePath("/w/a.ecp.json", "/w/a.ecp.json")).toBe(true)
  })

  it("is case-sensitive for POSIX paths and false for missing values", () => {
    expect(samePath("/W/a.ecp.json", "/w/a.ecp.json")).toBe(false)
    expect(samePath(null, "/w")).toBe(false)
    expect(samePath("/w", undefined)).toBe(false)
  })
})

describe("newRunEvents", () => {
  it("returns events after lastSeq in seq order", () => {
    expect(newRunEvents([event(3), event(1), event(2)], 1).map((e) => e.seq)).toEqual([2, 3])
  })

  it("returns nothing when all events were seen", () => {
    expect(newRunEvents([event(1), event(2)], 2)).toEqual([])
    expect(newRunEvents([], 0)).toEqual([])
  })
})
