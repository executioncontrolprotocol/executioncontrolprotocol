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
 * TypeScript / JSON return prose only (no EQL example shapes). EQL appends an example shape.
 * @category Harness
 */
export function buildRepairHintFromFixture(fixture: HarnessPromptFixture): string {
  const format = fixture.promptFormat ?? "eql"
  if (format === "typescript") {
    return fixture.repairHint ?? "Return corrected TypeScript only."
  }
  if (format === "json") {
    return fixture.repairHint ?? "Return corrected JSON only."
  }
  const parts = [fixture.repairHint ?? "Return corrected EQL only."]
  if (fixture.outputSchema !== "@executioncontrolprotocol.patch") {
    const example = formatRepairExample(fixture.outputSchema, true)
    parts.push(`Example shape:\n${example}`)
  }
  return parts.join(" ")
}
