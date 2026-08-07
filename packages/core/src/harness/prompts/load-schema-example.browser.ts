import { SCHEMA_EXAMPLE_FILES } from "./schema-example-files.js"

function fileNameFromGlobKey(key: string): string {
  const normalized = key.replace(/\\/g, "/")
  return normalized.split("/").pop() ?? normalized
}

const jsonModules = import.meta.glob("../../../fixtures/schema-examples/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>

const eqlModules = import.meta.glob("../../../fixtures/schema-examples/*.eql", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>

const jsonByFileName = new Map<string, Record<string, unknown>>()
for (const [key, value] of Object.entries(jsonModules)) {
  jsonByFileName.set(fileNameFromGlobKey(key), value)
}

const eqlByFileName = new Map<string, string>()
for (const [key, value] of Object.entries(eqlModules)) {
  eqlByFileName.set(fileNameFromGlobKey(key), String(value).trimEnd())
}

function loadJsonExample(fileName: string): Record<string, unknown> {
  const value = jsonByFileName.get(fileName)
  if (!value) {
    throw new Error(`Schema example JSON not found: ${fileName}`)
  }
  return value
}

function loadEqlExample(fileName: string): string {
  const value = eqlByFileName.get(fileName)
  if (value === undefined) {
    throw new Error(`Schema example EQL not found: ${fileName}`)
  }
  return value
}

/** @category Harness */
export function loadSchemaExample(outputSchema: string): Record<string, unknown> {
  const fileName = SCHEMA_EXAMPLE_FILES[outputSchema]?.json
  if (!fileName) {
    throw new Error(`No schema example fixture for output schema: ${outputSchema}`)
  }
  return loadJsonExample(fileName)
}

/** @category Harness */
export function loadSchemaExampleEql(outputSchema: string): string {
  const fileName = SCHEMA_EXAMPLE_FILES[outputSchema]?.eql
  if (!fileName) {
    throw new Error(`No EQL schema example fixture for output schema: ${outputSchema}`)
  }
  return loadEqlExample(fileName)
}

/** @category Harness */
export function formatSchemaExampleJson(outputSchema: string): string {
  return JSON.stringify(loadSchemaExample(outputSchema))
}

/** @category Harness */
export function formatSchemaExampleEql(outputSchema: string): string {
  return loadSchemaExampleEql(outputSchema)
}

/** @category Harness */
export function loadRepairNeutralExampleEql(outputSchema: string): string {
  const fileName =
    SCHEMA_EXAMPLE_FILES[outputSchema]?.repairNeutralEql ??
    SCHEMA_EXAMPLE_FILES[outputSchema]?.eql
  if (!fileName) {
    throw new Error(`No EQL repair example fixture for output schema: ${outputSchema}`)
  }
  return loadEqlExample(fileName)
}
