import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { browserPromptLoaderPlugin } from "./vite-browser-prompts-plugin.js"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, "../../..")
const corePromptsDir = join(repoRoot, "core/src/harness/prompts")
const stubDir = join(repoRoot, "evals/test/stubs")
const nanoPromptsIndex = join(
  repoRoot,
  "harnesses/browser-nano/src/prompts/index.ts",
)
const nanoBrowserPrompt = join(
  repoRoot,
  "harnesses/browser-nano/src/prompts/load-harness-prompt.browser.ts",
)
const coreSchemaBrowser = join(corePromptsDir, "load-schema-example.browser.ts")

describe("browserPromptLoaderPlugin", () => {
  const plugin = browserPromptLoaderPlugin({ corePromptsDir, stubDir })
  const resolveId = plugin.resolveId as (
    source: string,
    importer?: string,
  ) => string | undefined

  it("resolves harness prompt loaders beside the importing harness", () => {
    expect(resolveId("./load-harness-prompt.js", nanoPromptsIndex)).toBe(nanoBrowserPrompt)
  })

  it("resolves schema example loaders from core prompts", () => {
    expect(resolveId("./load-schema-example.js", join(corePromptsDir, "index.ts"))).toBe(
      coreSchemaBrowser,
    )
  })

  it("stubs Node-only harness prompt loaders", () => {
    expect(resolveId("./load-harness-prompt.node.js", nanoPromptsIndex)).toBe(
      join(stubDir, "load-harness-prompt-node-stub.ts"),
    )
  })
})
