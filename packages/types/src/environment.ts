import type { NamespacedId } from "./schema.js"
import type { EcpVersion } from "./version.js"

/** Environment manifest (bindings only). @category Environment */
export interface EnvironmentManifest {
  schema: "@executioncontrolprotocol.environment"
  version: EcpVersion
  environment: {
    id: string
    label?: string
  }
  runtime?: RuntimeBindingManifest
  extensions?: ExtensionBindingManifest[]
  policies?: PolicyBindingManifest[]
}

/** Runtime binding in environment manifest. @category Environment */
export interface RuntimeBindingManifest {
  id: NamespacedId | string
  label?: string
  config?: Record<string, unknown>
}

/** Extension binding in environment manifest. @category Environment */
export interface ExtensionBindingManifest {
  id: NamespacedId | string
  label?: string
  order: number
  config?: Record<string, unknown>
}

/** Policy binding in environment manifest. @category Environment */
export interface PolicyBindingManifest {
  id: NamespacedId | string
  label?: string
  order: number
  config?: Record<string, unknown>
}

/** Runtime feature flags for validation. @category Environment */
export interface RuntimeFeatures {
  durableExecution?: boolean
  loops?: boolean
  parallel?: boolean
  branches?: boolean
  pauses?: boolean
  cancellation?: boolean
  longRunningWorkflows?: boolean
}

/** Environment descriptor for discovery. @category Environment */
export interface EnvironmentDescriptor {
  schema: "@executioncontrolprotocol.environment.describe"
  version: EcpVersion
  environment: {
    id: string
    label?: string
  }
  runtime: RuntimeDescription
  extensions: ExtensionDescription[]
  capabilities: CapabilityDescription[]
  policies: PolicyDescription[]
}

/** Runtime section of descriptor. @category Environment */
export interface RuntimeDescription {
  id: string
  label?: string
  features: RuntimeFeatures
}

/** Extension section of descriptor. @category Environment */
export interface ExtensionDescription {
  id: string
  label?: string
  order: number
  configSchema?: unknown
  capabilities: string[]
  /** Runtimes this extension supports when restricted; omitted when universal. */
  supportedRuntimes?: string[]
}

/** Capability metadata in descriptor. @category Environment */
export interface CapabilityDescription {
  id: string
  label?: string
  extension: string
  inputSchema?: unknown
  outputSchema?: unknown
  examples?: unknown[]
}

/** Policy metadata in descriptor. @category Environment */
export interface PolicyDescription {
  id: string
  label?: string
  summary?: string
  config?: Record<string, unknown>
  configSchema?: unknown
}

/** Describe query selection. @category Environment */
export interface DescribeSelection {
  id?: string
  namespace?: string
  match?: string
  mode?: "exact" | "partial" | "fuzzy" | "semantic"
  include?: string[]
  limit?: number
}

/** Describe query object. @category Environment */
export interface DescribeQuery {
  runtime?: DescribeSelection
  extensions?: DescribeSelection
  capabilities?: DescribeSelection
  policies?: DescribeSelection
  features?: DescribeSelection
}

/** Search options. @category Environment */
export interface SearchOptions {
  types?: Array<"capability" | "extension" | "policy">
  include?: string[]
  limit?: number
}

/** Search result item. @category Environment */
export interface SearchResultItem {
  type: string
  id: string
  label?: string
  score: number
  reason?: string
  /** Present when requested via {@link SearchOptions.include}. */
  inputSchema?: unknown
  /** Present when requested via {@link SearchOptions.include}. */
  outputSchema?: unknown
}

/** Search response. @category Environment */
export interface SearchResult {
  schema: "@executioncontrolprotocol.environment.search"
  version: EcpVersion
  results: SearchResultItem[]
}
