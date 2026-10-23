import { createHash } from "node:crypto"
import { canonicalStepDefinition } from "@executioncontrolprotocol/core"
import type { StepNode } from "@executioncontrolprotocol/core/types"

/**
 * Hex SHA-256 of `text`.
 * @category Journal
 */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex")
}

/**
 * Hash a leaf step definition for rerun compatibility.
 * @category Journal
 */
export function hashStepDefinition(step: StepNode): string {
  return sha256Hex(canonicalStepDefinition(step))
}
