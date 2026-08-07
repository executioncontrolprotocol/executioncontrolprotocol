import {
  harnessPromptFixtureSchema,
  type HarnessPromptFixture,
} from "@executioncontrolprotocol/core"

function fixtureIdFromGlobKey(key: string): string {
  const normalized = key.replace(/\\/g, "/")
  const fileName = normalized.split("/").pop() ?? normalized
  return fileName.replace(/\.prompt\.json$/, "")
}

function loadBrowserPromptFixtures(): Map<string, HarnessPromptFixture> {
  const modules = import.meta.glob("../../../fixtures/harness-prompts/*.prompt.json", {
    eager: true,
    import: "default",
  }) as Record<string, HarnessPromptFixture>
  const map = new Map<string, HarnessPromptFixture>()
  for (const [key, raw] of Object.entries(modules)) {
    const fixtureId = fixtureIdFromGlobKey(key)
    const parsed = harnessPromptFixtureSchema.parse(raw)
    if (parsed.id !== fixtureId) {
      throw new Error(`Harness prompt fixture id mismatch: file ${fixtureId}, json id ${parsed.id}`)
    }
    map.set(fixtureId, parsed)
  }
  return map
}

const promptFixtures = loadBrowserPromptFixtures()

/** Load and validate a Browser Nano harness prompt fixture by id (browser bundle). @category Harness */
export function loadNanoHarnessPromptFixture(fixtureId: string): HarnessPromptFixture {
  const fixture = promptFixtures.get(fixtureId)
  if (!fixture) {
    throw new Error(`Harness prompt fixture not found: ${fixtureId}`)
  }
  return fixture
}
