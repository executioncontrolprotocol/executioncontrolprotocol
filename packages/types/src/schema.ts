import type { EcpVersion } from "./version.js"

/** Serialized object schema discriminator. @category Common */
export type EcpSchema =
  | "@executioncontrolprotocol.workflow"
  | "@executioncontrolprotocol.environment"
  | "@executioncontrolprotocol.environment.describe"
  | "@executioncontrolprotocol.environment.search"
  | "@executioncontrolprotocol.run.request"
  | "@executioncontrolprotocol.run.result"
  | "@executioncontrolprotocol.run.event"
  | "@executioncontrolprotocol.validation.result"
  | "@executioncontrolprotocol.patch"
  | "@executioncontrolprotocol.patch.result"
  | "@executioncontrolprotocol.encode.result"
  | "@executioncontrolprotocol.decode.result"
  | "@executioncontrolprotocol.intent"
  | "@executioncontrolprotocol.harness.reply"

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

/** Browser encrypted secrets reference (not portable in workflows). @category Environment */
export interface BrowserValue {
  /** Logical key in the browser secrets vault. */
  $browser: string
  /** When true, missing secret does not fail resolution. */
  optional?: boolean
  /** Fallback when optional secret is missing. */
  fallback?: unknown
}

/** Expression value in workflow conditions. @category Workflow */
export type ExprValue =
  | { eq: [string, unknown] }
  | { neq: [string, unknown] }
  | Record<string, unknown>

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
  | BrowserValue

/** Base fields on serialized ECP objects. @category Common */
export interface EcpDocumentBase {
  schema: EcpSchema
  version: EcpVersion
}
