import { describe, expect, it } from "vitest"
import { z } from "zod"
import { ECP_INPUT_INVALID, EcpError } from "@executioncontrolprotocol/core/types"
import {
  assembleAdobeOperationInput,
  ensureDefaultCaiClaimVersion,
} from "../src/runtime/invoke.js"

const generateBodySchema = z.object({
  prompt: z.string().min(1),
  seeds: z.array(z.number().int()).optional(),
  numVariations: z.number().int().min(1).max(4).optional(),
})

const bodyKeys = { body: ["prompt", "seeds", "numVariations"] }

describe("assembleAdobeOperationInput", () => {
  it("sends parameters alone as the JSON body", () => {
    const assembled = assembleAdobeOperationInput(
      { prompt: "sunset", numVariations: 2 },
      bodyKeys,
      generateBodySchema,
    )
    expect(assembled.body).toEqual({ prompt: "sunset", numVariations: 2 })
  })

  it("overrides and augments body with parameters", () => {
    const assembled = assembleAdobeOperationInput(
      {
        prompt: "from-param",
        body: { prompt: "from-body", seeds: [7] },
      },
      bodyKeys,
      generateBodySchema,
    )
    expect(assembled.body).toEqual({ prompt: "from-param", seeds: [7] })
  })

  it("maps path, query, and header keys", () => {
    const assembled = assembleAdobeOperationInput(
      {
        jobId: "job-1",
        limit: "10",
        "x-model-version": "image5",
        prompt: "dunes",
      },
      {
        path: ["jobId"],
        query: ["limit"],
        headers: ["x-model-version"],
        body: ["prompt"],
      },
      generateBodySchema,
    )
    expect(assembled.path).toEqual({ jobId: "job-1" })
    expect(assembled.query).toEqual({ limit: "10" })
    expect(assembled.headers).toEqual({ "x-model-version": "image5" })
    expect(assembled.body).toEqual({ prompt: "dunes" })
  })

  it("rejects a merged body missing prompt", () => {
    expect(() =>
      assembleAdobeOperationInput(
        { body: { seeds: [1] } },
        bodyKeys,
        generateBodySchema,
      ),
    ).toThrow(/Adobe request body failed schema/)
  })

  it("rejects a non-object body when a body parameter is set", () => {
    expect(() =>
      assembleAdobeOperationInput(
        { prompt: "x", body: ["not-an-object"] },
        bodyKeys,
        generateBodySchema,
      ),
    ).toThrow(EcpError)
    try {
      assembleAdobeOperationInput(
        { prompt: "x", body: ["not-an-object"] },
        bodyKeys,
        generateBodySchema,
      )
    } catch (err) {
      expect(err).toBeInstanceOf(EcpError)
      expect((err as EcpError).code).toBe(ECP_INPUT_INVALID)
      return
    }
    expect.fail("expected EcpError")
  })

  it("does not erase a body key when the matching parameter is omitted", () => {
    const assembled = assembleAdobeOperationInput(
      { body: { prompt: "keep", seeds: [2] } },
      bodyKeys,
      generateBodySchema,
    )
    expect(assembled.body).toEqual({ prompt: "keep", seeds: [2] })
  })

  it("leaves body undefined when neither body nor parameters are set", () => {
    const assembled = assembleAdobeOperationInput({}, bodyKeys, generateBodySchema)
    expect(assembled.body).toBeUndefined()
  })

  it("does not treat poll knobs as request fields", () => {
    const assembled = assembleAdobeOperationInput(
      { prompt: "sunset", pollIntervalMs: 1000, pollTimeoutMs: 5_000 },
      bodyKeys,
      generateBodySchema,
    )
    expect(assembled.body).toEqual({ prompt: "sunset" })
    expect(assembled).not.toHaveProperty("pollIntervalMs")
    expect(assembled).not.toHaveProperty("pollTimeoutMs")
  })
})

const expandBodySchema = z.object({
  image: z.object({ source: z.object({ url: z.string().optional() }).passthrough() }),
  caiClaimVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  prompt: z.string().optional(),
})

const expandBodyKeys = { body: ["image", "caiClaimVersion", "prompt"] }

describe("ensureDefaultCaiClaimVersion", () => {
  it("defaults to 2 when an image input is present and the field is omitted", () => {
    expect(
      ensureDefaultCaiClaimVersion({
        image: { source: { url: "https://example.com/a.png" } },
      }),
    ).toEqual({
      image: { source: { url: "https://example.com/a.png" } },
      caiClaimVersion: 2,
    })
  })

  it("leaves an explicit caiClaimVersion alone", () => {
    expect(
      ensureDefaultCaiClaimVersion({
        image: { source: { url: "https://example.com/a.png" } },
        caiClaimVersion: 1,
      }),
    ).toEqual({
      image: { source: { url: "https://example.com/a.png" } },
      caiClaimVersion: 1,
    })
  })

  it("does not add caiClaimVersion when there is no image input", () => {
    expect(ensureDefaultCaiClaimVersion({ prompt: "sunset" })).toEqual({ prompt: "sunset" })
  })
})

describe("assembleAdobeOperationInput caiClaimVersion", () => {
  it("defaults caiClaimVersion to 2 for expand-style image requests", () => {
    const assembled = assembleAdobeOperationInput(
      { image: { source: { url: "https://example.com/a.png" } } },
      expandBodyKeys,
      expandBodySchema,
    )
    expect(assembled.body).toEqual({
      image: { source: { url: "https://example.com/a.png" } },
      caiClaimVersion: 2,
    })
  })

  it("keeps an author-provided caiClaimVersion", () => {
    const assembled = assembleAdobeOperationInput(
      {
        image: { source: { url: "https://example.com/a.png" } },
        caiClaimVersion: 1,
      },
      expandBodyKeys,
      expandBodySchema,
    )
    expect(assembled.body).toEqual({
      image: { source: { url: "https://example.com/a.png" } },
      caiClaimVersion: 1,
    })
  })
})
