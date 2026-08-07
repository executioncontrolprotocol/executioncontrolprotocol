import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type { EcpPatchDocument, EcpPatchEntry, EcpPatchInput, EcpSchema } from "@executioncontrolprotocol/types"
import { ecpPatchDocumentSchema } from "./patch-document.js"

function isPatchDocument(value: unknown): value is EcpPatchDocument {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as EcpPatchDocument).schema === "@executioncontrolprotocol.patch"
  )
}

function isPatchEntryArray(value: unknown): value is EcpPatchEntry[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (e) =>
        e !== null &&
        typeof e === "object" &&
        "path" in e &&
        typeof (e as EcpPatchEntry).path === "string"
    )
  )
}

/**
 * Normalize shorthand or canonical patch input to {@link EcpPatchDocument}.
 * @category Patch
 */
export function normalizePatchInput(
  input: EcpPatchInput,
  targetSchema: EcpSchema = "@executioncontrolprotocol.workflow"
): EcpPatchDocument {
  if (isPatchDocument(input)) {
    return input
  }

  if (isPatchEntryArray(input)) {
    return {
      schema: "@executioncontrolprotocol.patch",
      version: LATEST_ECP_VERSION,
      targetSchema,
      patches: input,
    }
  }

  if (
    input !== null &&
    typeof input === "object" &&
    "patches" in input &&
    isPatchEntryArray((input as { patches: unknown }).patches)
  ) {
    return {
      schema: "@executioncontrolprotocol.patch",
      version: LATEST_ECP_VERSION,
      targetSchema,
      patches: (input as { patches: EcpPatchEntry[] }).patches,
    }
  }

  const patches: EcpPatchEntry[] = Object.entries(input as Record<string, unknown>).map(
    ([path, value]) => ({
      path,
      mode: "merge" as const,
      value,
    })
  )

  return {
    schema: "@executioncontrolprotocol.patch",
    version: LATEST_ECP_VERSION,
    targetSchema,
    patches,
  }
}

/**
 * Validate canonical patch document structure.
 * @category Patch
 */
export function validatePatchDocument(
  document: EcpPatchDocument
): { valid: boolean; errors: string[] } {
  const parsed = ecpPatchDocumentSchema.safeParse(document)
  if (parsed.success) return { valid: true, errors: [] }
  return {
    valid: false,
    errors: parsed.error.issues.map((i) => i.message),
  }
}
