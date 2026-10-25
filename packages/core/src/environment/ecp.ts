import type {
  CapabilityId,
  DescribeQuery,
  EnvironmentDescriptor,
  RunResult,
  SearchOptions,
  SearchResult,
  ValidationResult,
  WorkflowManifest,
} from "../types/index.js"
import type { Registry } from "../registry/registry.js"
import type { Environment, RunOptions } from "./environment.js"
import {
  createDecodeBuilder,
  createEncodeBuilder,
  type DecodeOperationBuilder,
  type EncodeOperationBuilder,
} from "../encoding/index.js"
import { createPatchBuilder, type PatchOperationBuilder } from "../patch/index.js"
import type { InvokeOperationBuilder } from "../invoke/invoke-builder.js"
import type { CapabilityBlobStore } from "../runtime/blobs.js"
import type { CapabilityArtifactStore } from "../runtime/artifacts.js"
import type { ServiceProvider, ServiceToken } from "../services/provider.js"

export type { RunOptions, EnvironmentInitOptions } from "./environment.js"

/**
 * Initialized operational ECP instance (returned from {@link Environment.init}).
 * @category Environment
 */
export interface Ecp {
  /** Environment id. */
  id: string
  /** Optional label. */
  label?: string
  /** Environment discovery descriptor. */
  describe(query?: DescribeQuery): Promise<EnvironmentDescriptor>
  /** Search capabilities and policies. */
  search(query: string, options?: SearchOptions): Promise<SearchResult>
  /** Encode a document via format extensions or JSON. */
  encode(input: unknown): EncodeOperationBuilder
  /** Decode encoded content via format extensions or JSON. */
  decode(input: unknown): DecodeOperationBuilder
  /** Apply a canonical JSON patch to a document. */
  patch<T = unknown>(document: T): PatchOperationBuilder<T>
  /** Validate a workflow manifest or environment-only when omitted. */
  validate(workflow?: WorkflowManifest): Promise<ValidationResult>
  /** Execute a workflow manifest. */
  run(workflow: WorkflowManifest, options?: RunOptions): Promise<RunResult>
  /** Invoke a registered capability outside workflow execution. */
  invoke(capabilityId: CapabilityId | string): InvokeOperationBuilder
  /** Underlying registry. */
  getRegistry(): Registry
  /** Run-scoped browser file blob store (created on first use). */
  getBlobStore(): CapabilityBlobStore
  /** Environment-scoped host artifact store (created on first use). */
  getArtifactStore(): CapabilityArtifactStore
  /**
   * Look up a service bound with {@link Environment.use}.
   * @category Environment
   */
  getService<T extends ServiceProvider>(token: ServiceToken<T>): T | undefined
  /** Terminate the environment and release resources. */
  terminate(): Promise<void>
}

/**
 * Operational facade over a prepared {@link Environment}.
 * @category Environment
 */
export class EcpImpl implements Ecp {
  constructor(private readonly env: Environment) {}

  get id(): string {
    return this.env.getEnvId()
  }

  get label(): string | undefined {
    return this.env.getEnvLabel()
  }

  describe(query?: DescribeQuery): Promise<EnvironmentDescriptor> {
    return this.env.ecpDescribe(query)
  }

  search(query: string, options?: SearchOptions): Promise<SearchResult> {
    return this.env.ecpSearch(query, options)
  }

  encode(input: unknown): EncodeOperationBuilder {
    return createEncodeBuilder(this.env, input)
  }

  decode(input: unknown): DecodeOperationBuilder {
    return createDecodeBuilder(this.env, input)
  }

  patch<T = unknown>(document: T): PatchOperationBuilder<T> {
    return createPatchBuilder(document)
  }

  validate(workflow?: WorkflowManifest): Promise<ValidationResult> {
    return this.env.ecpValidate(workflow)
  }

  run(workflow: WorkflowManifest, options?: RunOptions): Promise<RunResult> {
    return this.env.ecpRun(workflow, options)
  }

  invoke(capabilityId: CapabilityId | string): InvokeOperationBuilder {
    return this.env.ecpInvoke(capabilityId as CapabilityId)
  }

  getRegistry(): Registry {
    return this.env.getRegistry()
  }

  getBlobStore(): CapabilityBlobStore {
    return this.env.ensureBlobStore()
  }

  getArtifactStore(): CapabilityArtifactStore {
    return this.env.ensureArtifactStore()
  }

  getService<T extends ServiceProvider>(token: ServiceToken<T>): T | undefined {
    return this.env.get(token)
  }

  terminate(): Promise<void> {
    return this.env.ecpTerminate()
  }
}
