import { readFileSync } from "node:fs"
import path from "node:path"
import { SCHEMA_EXAMPLES_DIR } from "./fixtures-root.js"
import { SCHEMA_EXAMPLE_FILES } from "./schema-example-files.js"

function loadJsonExampleNode(fileName: string): Record<string, unknown> {
  const full = path.join(SCHEMA_EXAMPLES_DIR, fileName)
  return JSON.parse(readFileSync(full, "utf8")) as Record<string, unknown>
}

function loadEqlExampleNode(fileName: string): string {
  const full = path.join(SCHEMA_EXAMPLES_DIR, fileName)
  return readFileSync(full, "utf8").trimEnd()
}

/** Node-only schema example loader. @category Harness */
export function loadSchemaExampleNode(outputSchema: string): Record<string, unknown> {
  const fileName = SCHEMA_EXAMPLE_FILES[outputSchema]?.json
  if (!fileName) {
    throw new Error(`No schema example fixture for output schema: ${outputSchema}`)
  }
  return loadJsonExampleNode(fileName)
}

/** @category Harness */
export function loadSchemaExampleEqlNode(outputSchema: string): string {
  const fileName = SCHEMA_EXAMPLE_FILES[outputSchema]?.eql
  if (!fileName) {
    throw new Error(`No EQL schema example fixture for output schema: ${outputSchema}`)
  }
  return loadEqlExampleNode(fileName)
}

/** @category Harness */
export function loadRepairNeutralExampleEqlNode(outputSchema: string): string {
  const fileName =
    SCHEMA_EXAMPLE_FILES[outputSchema]?.repairNeutralEql ??
    SCHEMA_EXAMPLE_FILES[outputSchema]?.eql
  if (!fileName) {
    throw new Error(`No EQL repair example fixture for output schema: ${outputSchema}`)
  }
  return loadEqlExampleNode(fileName)
}
