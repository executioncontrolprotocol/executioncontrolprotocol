import { describe, expect, it } from "vitest"
import { buildSystemPromptFromFixture } from "../../src/harness/prompts/build-system-prompt.js"
import { buildRepairHintFromFixture } from "../../src/harness/prompts/build-repair-hint.js"
import { harnessPromptFixtureSchema } from "../../src/harness/prompts/harness-prompt-fixture-schema.js"

const minimalIntentFixture = harnessPromptFixtureSchema.parse({
  id: "test-intent",
  role: "Classify intent.",
  task: "Return EQL intent only.",
  outputSchema: "@executioncontrolprotocol.workflow",
  promptFormat: "eql",
  fewShots: [
    {
      message: "Create a workflow",
      output: "WORKFLOW demo \"Demo\"\nSTEP echo USES @executioncontrolprotocol/test.echo\n  WITH value = \"hi\"\n  AS echo",
    },
  ],
})

describe("harness prompt assembly", () => {
  it("buildSystemPromptFromFixture includes EQL primer and few-shots", () => {
    const system = buildSystemPromptFromFixture(minimalIntentFixture)
    expect(system).toContain("WORKFLOW demo")
    expect(system).toContain("Additional examples (message -> EQL output)")
    expect(system).toContain("Reply with SQL-like EQL only")
    expect(system).toContain("no prior knowledge of EQL")
  })

  it("buildRepairHintFromFixture includes repair prose", () => {
    const fixture = harnessPromptFixtureSchema.parse({
      ...minimalIntentFixture,
      outputSchema: "@executioncontrolprotocol.patch",
      repairHint: "Return corrected EQL only.",
    })
    const hint = buildRepairHintFromFixture(fixture)
    expect(hint).toContain("Return corrected EQL only.")
  })
})
