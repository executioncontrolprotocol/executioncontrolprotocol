import { formatSchemaExampleEql, formatSchemaExampleJson } from "./load-schema-example.js"
import type { HarnessPromptFixture } from "./harness-prompt-fixture-schema.js"

function formatRepairExample(outputSchema: string, eql: boolean): string {
  if (eql && outputSchema === "@executioncontrolprotocol.patch") {
    return "PATCH WORKFLOW <workflow-id> then only required UPDATE/ADD/DELETE/MOVE lines with real step ids."
  }
  return eql ? formatSchemaExampleEql(outputSchema) : formatSchemaExampleJson(outputSchema)
}

/**
 * Build repair-line text from an in-memory harness prompt fixture.
 * @category Harness
 */
export function buildRepairHintFromFixture(fixture: HarnessPromptFixture): string {
  const eql = fixture.promptFormat !== "json"
  const parts = [
    fixture.repairHint ??
      (eql ? "Return corrected EQL only." : "Return corrected JSON only."),
  ]
  if (eql && fixture.outputSchema !== "@executioncontrolprotocol.patch") {
    const example = formatRepairExample(fixture.outputSchema, eql)
    parts.push(`Example shape:\n${example}`)
  }
  return parts.join(" ")
}
