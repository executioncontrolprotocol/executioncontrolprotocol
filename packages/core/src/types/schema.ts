import type { EcpVersion } from "./version.js"

/** Serialized object schema discriminator. @category Common */
export type EcpSchema =
  | "@executioncontrolprotocol.workflow"
  | "@executioncontrolprotocol.environment"
  | "@executioncontrolprotocol.environment.describe"
  | "@executioncontrolprotocol.environment.search"
  | "@executioncontrolprotocol.requirements"
  | "@executioncontrolprotocol.run.request"
  | "@executioncontrolprotocol.run.result"
  | "@executioncontrolprotocol.run.event"
  | "@executioncontrolprotocol.validation.result"
  | "@executioncontrolprotocol.patch"
  | "@executioncontrolprotocol.patch.result"
  | "@executioncontrolprotocol.encode.result"
  | "@executioncontrolprotocol.decode.result"
  | "@executioncontrolprotocol.run.journal"

/** Namespaced definition id (`@namespace/name`). @category Common */
export type NamespacedId = `@${string}/${string}`

/** Capability id (`@namespace/name.capability`). @category Common */
export type CapabilityId = `${NamespacedId}.${string}`

/** Commit mode for step output. @category Workflow */
export type CommitMode = "create" | "replace" | "merge" | "append" | "version"

/** Run status. @category Runtime */
export type RunStatus =
  | "created"
  | "started"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused"
  | "stopped"

/** Workflow reference to committed state. @category Workflow */
export interface RefValue {
  /** State path prefixed with `state.` in manifests. */
  $ref: string
  /** When true, missing state does not fail resolution. */
  optional?: boolean
  /** Fallback when optional ref is missing. */
  fallback?: unknown
}

/** Mutable state handle in step input. @category Workflow */
export interface StateValue {
  /** State path for staged mutations. */
  $state: string
  optional?: boolean
  fallback?: unknown
}

/** Environment config secret reference (not portable in workflows). @category Environment */
export interface EnvValue {
  $env: string
  optional?: boolean
  fallback?: unknown
}

/** OS secrets reference (not portable in workflows). @category Environment */
export interface SecretValue {
  /** Logical key in the OS secrets store. */
  $secret: string
  /** When true, missing secret does not fail resolution. */
  optional?: boolean
  /** Fallback when optional secret is missing. */
  fallback?: unknown
}

/**
 * Portable JS function stored as source text (no closed-over environment).
 * Shared shape for workflow conditions and later custom script steps.
 * @category Workflow
 */
export interface SerializableFunction {
  /** Discriminator for script-like values. */
  $fn: true
  /** `Function#toString()` result. */
  source: string
  /** Declared parameter names for documentation / tooling (default `["state"]` for expr). */
  params?: string[]
}

/**
 * Expression value in workflow conditions (`when` / loop `until`).
 * Always a {@link SerializableFunction}.
 * @category Workflow
 */
export type ExprValue = SerializableFunction

/** Input value allowed in step config. @category Workflow */
export type InputValue =
  | string
  | number
  | boolean
  | null
  | InputValue[]
  | { [key: string]: InputValue }
  | RefValue
  | StateValue
  | EnvValue
  | SecretValue

/** Base fields on serialized ECP objects. @category Common */
export interface EcpDocumentBase {
  schema: EcpSchema
  version: EcpVersion
}
