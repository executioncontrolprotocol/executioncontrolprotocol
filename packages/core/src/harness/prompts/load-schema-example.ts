import {
  loadRepairNeutralExampleEqlNode,
  loadSchemaExampleEqlNode,
  loadSchemaExampleNode,
} from "./load-schema-example.node.js"

/** @category Harness */
export function loadSchemaExample(outputSchema: string): Record<string, unknown> {
  return loadSchemaExampleNode(outputSchema)
}

/** @category Harness */
export function loadSchemaExampleEql(outputSchema: string): string {
  return loadSchemaExampleEqlNode(outputSchema)
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
  return loadRepairNeutralExampleEqlNode(outputSchema)
}
