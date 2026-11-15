import { describe, expect, it } from "vitest"
import { z } from "zod"
import { defineOperation } from "../src/define-operation.js"

describe("defineOperation", () => {
  it("builds a host operation", () => {
    const op = defineOperation("ping")
      .withInput(z.object({ n: z.string() }))
      .withMetadata({ summary: "Ping" })
      .withHandler(async (input) => input)
      .build()
    expect(op.name).toBe("ping")
    expect(op.metadata.summary).toBe("Ping")
  })

  it("requires input, summary and handler", () => {
    expect(() => defineOperation("a").build()).toThrow(/withInput/)
    expect(() => defineOperation("a").withInput(z.object({})).build()).toThrow(/metadata.summary/)
    expect(() =>
      defineOperation("a").withInput(z.object({})).withMetadata({ summary: "A" }).build()
    ).toThrow(/withHandler/)
  })
})
