import { readFileSync } from "node:fs"
import path from "node:path"
import {
  harnessPromptFixtureSchema,
  type HarnessPromptFixture,
} from "@executioncontrolprotocol/core"
import { NANO_HARNESS_PROMPTS_DIR } from "./fixtures-root.js"

const cache = new Map<string, HarnessPromptFixture>()

/** Node-only Browser Nano harness prompt loader. @category Harness */
export function loadNanoHarnessPromptFixtureNode(fixtureId: string): HarnessPromptFixture {
  const cached = cache.get(fixtureId)
  if (cached) return cached
  const full = path.join(NANO_HARNESS_PROMPTS_DIR, `${fixtureId}.prompt.json`)
  const raw = JSON.parse(readFileSync(full, "utf8")) as unknown
  const parsed = harnessPromptFixtureSchema.parse(raw)
  if (parsed.id !== fixtureId) {
    throw new Error(`Harness prompt fixture id mismatch: file ${fixtureId}, json id ${parsed.id}`)
  }
  cache.set(fixtureId, parsed)
  return parsed
}
