import { describe, expect, it } from "vitest"
import {
  DEMO_PROVIDERS_DOCS_URL,
  DEMO_PROVIDERS_OLLAMA_DOCS_URL,
  ECP_UP_DOCS_URL,
  GITHUB_REPO_URL,
} from "../src/lib/external-links.js"

describe("external-links", () => {
  it("exports a GitHub repo URL", () => {
    expect(GITHUB_REPO_URL).toMatch(/^https:\/\/github\.com\//)
  })

  it("points Learn More at the public ecp up CLI docs", () => {
    expect(ECP_UP_DOCS_URL).toBe(
      "https://executioncontrolprotocol.io/reference/cli#ecp-up"
    )
  })

  it("points provider Learn More links at the demo providers guide", () => {
    expect(DEMO_PROVIDERS_DOCS_URL).toBe(
      "https://executioncontrolprotocol.io/getting-started/browser-demo-providers"
    )
    expect(DEMO_PROVIDERS_OLLAMA_DOCS_URL).toBe(
      "https://executioncontrolprotocol.io/getting-started/browser-demo-providers#ollama"
    )
  })
})
