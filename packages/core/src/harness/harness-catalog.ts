import {
  ECP_HARNESS_CAPABILITY_NAME,
  type HarnessCapabilityId,
  type HarnessId,
  type NamespacedId,
} from "@executioncontrolprotocol/types"
import type { HarnessDefinition } from "./types.js"

const catalog = new Map<HarnessId, HarnessDefinition>()

/**
 * Normalize harness id to `@namespace/name` form.
 * @category Harness
 */
export function normalizeHarnessId(ref: string): HarnessId {
  if (ref.startsWith("@")) return ref as HarnessId
  return `@executioncontrolprotocol/${ref}` as HarnessId
}

/**
 * Register a harness definition for catalog lookup and invocation.
 * @category Harness
 */
export function catalogHarness(def: HarnessDefinition): void {
  catalog.set(def.id, def)
}

/**
 * Look up a cataloged harness by id.
 * @category Harness
 */
export function getCatalogedHarness(id: HarnessId | string): HarnessDefinition | undefined {
  return catalog.get(normalizeHarnessId(id))
}

/**
 * List cataloged harness ids.
 * @category Harness
 */
export function listCatalogedHarnessIds(): HarnessId[] {
  return [...catalog.keys()]
}

/**
 * Parse harness id from evaluate capability id.
 * @category Harness
 */
export function harnessIdFromCapabilityId(capabilityId: string): HarnessId | undefined {
  const suffix = `.${ECP_HARNESS_CAPABILITY_NAME}`
  if (!capabilityId.endsWith(suffix)) return undefined
  return capabilityId.slice(0, -suffix.length) as HarnessId
}

/**
 * Build harness evaluate capability id.
 * @category Harness
 */
export function harnessEvaluateCapabilityId(harnessId: NamespacedId | string): HarnessCapabilityId {
  const id = normalizeHarnessId(String(harnessId))
  return `${id}.${ECP_HARNESS_CAPABILITY_NAME}` as HarnessCapabilityId
}

/**
 * Whether a capability id is a harness evaluate endpoint.
 * Extension capabilities such as `@executioncontrolprotocol/ollama.evaluate` also end with `.evaluate` but are not harnesses.
 * @category Harness
 */
export function isHarnessCapabilityId(capabilityId: string): boolean {
  const harnessId = harnessIdFromCapabilityId(capabilityId)
  if (!harnessId) return false
  return getCatalogedHarness(harnessId) !== undefined
}

/** Clear harness catalog (unit tests). @internal */
export function resetHarnessCatalogForTests(): void {
  catalog.clear()
}
