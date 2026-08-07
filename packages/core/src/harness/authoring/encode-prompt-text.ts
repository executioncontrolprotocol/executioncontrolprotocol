import type { Ecp } from "../../environment/ecp.js"

/**
 * Encode a plain object for inclusion in a harness user prompt.
 * @category Harness
 */
export async function encodeForPrompt(
  ecp: Ecp,
  value: unknown,
  format: string
): Promise<string> {
  const encoded = await ecp
    .encode(value)
    .uses(format)
    .with({ headers: false, compact: true })
    .process()
  return String(encoded.result ?? "")
}
