import type { NamespacedId } from "./schema.js"
import type { EcpVersion } from "./version.js"

/** Whether a requirement was declared on `workflow().with()` or inferred from steps. @category Requirements */
export type RequirementSource = "explicit" | "inferred"

/** Binding kind recorded in a requirements document. @category Requirements */
export type RequirementKind = "extension" | "policy"

/**
 * One extension or policy the workflow file needs.
 * `config` holds placeholders only (`$secret`, `$env`); never resolved values.
 * @category Requirements
 */
export interface RequirementEntry {
  /** Binding kind. */
  kind: RequirementKind
  /** Extension or policy id. */
  id: NamespacedId
  /**
   * npm package to install. Omitted for built-ins that install nothing
   * (`registry-control`, `@executioncontrolprotocol/test`, Node `secrets` /
   * `process-env`, environment packages).
   */
  package?: string
  /** Semver range from `.requires(range, pkg?)`. */
  range?: string
  /** Binding config with placeholders only. */
  config?: Record<string, unknown>
  /** Whether this row came from `.with()` or from step inference. */
  source: RequirementSource
}

/**
 * Workflow-file requirements compiled separately from the portable manifest.
 * @category Requirements
 */
export interface RequirementsDocument {
  /** Schema discriminator. */
  schema: "@executioncontrolprotocol.requirements"
  /** ECP version. */
  version: EcpVersion
  /** Declared and inferred bindings. */
  requirements: RequirementEntry[]
}
