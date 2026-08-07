import { describe, expect, it, vi, afterEach } from "vitest"
import type { Ecp } from "@executioncontrolprotocol/core"
import type { HarnessInvokeResult } from "@executioncontrolprotocol/types"
import { assertJudge } from "../../src/fixtures/assertions.js"
import type { EvalCase } from "../../src/fixtures/eval-case-schema.js"
import { CHROME_NANO_EVAL } from "../../src/profiles/chrome-nano.js"
import {
  resetActiveEvalProvider,
  setActiveEvalProvider,
} from "../../src/profiles/eval-provider-context.js"

const caseRow = {
  id: "judge-test",
  suite: "assistant",
  title: "Judge fail closed",
  model: "default",
  harness: "workflow-assistant",
  input: { message: "test" },
  assertions: { deterministic: [], judge: { enabled: true, requireApproved: true } },
} as EvalCase

const harnessOutput = {
  artifact: { schema: "@executioncontrolprotocol.harness.reply", answer: "ok" },
  raw: "{}",
  trace: { harness: "@executioncontrolprotocol/harness-browser-nano" },
} as HarnessInvokeResult

describe("assertJudge", () => {
  afterEach(() => {
    resetActiveEvalProvider()
  })

  it("skips judge when active provider is not Ollama", async () => {
    setActiveEvalProvider(CHROME_NANO_EVAL)
    const ecp = {
      invoke: vi.fn(),
    } as unknown as Ecp

    await assertJudge(caseRow, harnessOutput, caseRow.assertions.judge, ecp)
    expect(ecp.invoke).not.toHaveBeenCalled()
  })

  it("fails when evaluate invoke throws", async () => {
    const ecp = {
      invoke: () => ({
        with: () => ({
          process: async () => {
            throw new Error("ollama down")
          },
        }),
      }),
    } as unknown as Ecp

    await expect(assertJudge(caseRow, harnessOutput, caseRow.assertions.judge, ecp)).rejects
      .toThrow(/judge approved/)
  })

  it("fails when evaluate returns success false", async () => {
    const ecp = {
      invoke: () => ({
        with: () => ({
          process: async () => ({
            success: false,
            schema: "@executioncontrolprotocol.invoke.result",
            version: "1.0",
            capabilityId: "@executioncontrolprotocol/ollama.evaluate",
            diagnostics: [{ message: "rate limited" }],
          }),
        }),
      }),
    } as unknown as Ecp

    await expect(assertJudge(caseRow, harnessOutput, caseRow.assertions.judge, ecp)).rejects
      .toThrow(/rate limited/)
  })

  it("invokes extension evaluate not harness ollama", async () => {
    const ecp = {
      invoke: vi.fn((capId: string) => ({
        with: vi.fn(() => ({
          process: vi.fn(async () => ({
            success: true,
            schema: "@executioncontrolprotocol.invoke.result",
            version: "1.0",
            capabilityId: capId,
            result: { approved: true },
            diagnostics: [],
          })),
        })),
      })),
    } as unknown as Ecp

    await assertJudge(caseRow, harnessOutput, caseRow.assertions.judge, ecp)
    expect(ecp.invoke).toHaveBeenCalledWith("@executioncontrolprotocol/ollama.evaluate")
  })

  it("passes when evaluate approves", async () => {
    const ecp = {
      invoke: vi.fn(() => ({
        with: vi.fn(() => ({
          process: vi.fn(async () => ({
            success: true,
            result: { approved: true },
          })),
        })),
      })),
    } as unknown as Ecp

    await expect(
      assertJudge(caseRow, harnessOutput, caseRow.assertions.judge, ecp)
    ).resolves.toBeUndefined()
  })
})
