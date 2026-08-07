import { describe, expect, it } from "vitest"
import { decodeDocumentFromToon } from "../../format-toon/src/toon-codec.js"
import { workflowToMermaid } from "../src/workflow-to-mermaid.js"

describe("demo TOON → manifest → mermaid", () => {
  it("renders steps from compact tabular TOON decode", () => {
    const toon = [
      'schema: "@executioncontrolprotocol.workflow"',
      'version: "1.0"',
      "workflow:",
      "  id: demo-generated",
      "steps[1]{id,uses,label,as}:",
      "  echo,@executioncontrolprotocol/test.echo,Demo Echo,echo",
    ].join("\n")

    const doc = decodeDocumentFromToon(toon, { strict: true, compact: true }) as {
      steps: unknown
    }
    expect(Array.isArray(doc.steps)).toBe(true)
    expect((doc.steps as unknown[]).length).toBe(1)

    const mermaid = workflowToMermaid(doc as never)
    expect(mermaid).toContain("Demo Echo")
    expect(mermaid).not.toContain("no steps")
  })
})
