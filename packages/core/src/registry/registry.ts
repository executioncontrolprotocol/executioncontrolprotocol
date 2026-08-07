import type { CapabilityId, NamespacedId, RegistryRegistrationRequest } from "@executioncontrolprotocol/types"
import type {
  CapabilityDefinition,
  ExtensionDefinition,
  PolicyDefinition,
  RuntimeDefinition,
} from "../definitions/types.js"
import { RegistryFrozenError } from "./errors.js"

/** Guard invoked before registry registration. @category Runtime */
export type RegistryRegistrationGuard = (
  request: RegistryRegistrationRequest
) => void | Promise<void>

/**
 * Global definition registry.
 * @category Runtime
 */
export class Registry {
  private runtimes = new Map<string, RuntimeDefinition>()
  private extensions = new Map<string, ExtensionDefinition>()
  private policies = new Map<string, PolicyDefinition>()
  private capabilities = new Map<string, CapabilityDefinition>()
  private frozen = false
  private freezeReason?: string
  private guard?: RegistryRegistrationGuard

  /** Attach a guard checked before each registration. */
  setRegistrationGuard(guard: RegistryRegistrationGuard | undefined): void {
    this.guard = guard
  }

  /** Lock registry; further registrations throw {@link RegistryFrozenError}. */
  freeze(reason?: string): void {
    this.frozen = true
    this.freezeReason = reason
  }

  /** Whether the registry accepts new registrations. */
  isFrozen(): boolean {
    return this.frozen
  }

  /** Last freeze reason if frozen. */
  getFreezeReason(): string | undefined {
    return this.freezeReason
  }

  private buildRequest(
    kind: RegistryRegistrationRequest["kind"],
    def: { id: string },
    extra?: Partial<RegistryRegistrationRequest>
  ): RegistryRegistrationRequest {
    return {
      kind,
      id: def.id as NamespacedId,
      definition: def,
      ...extra,
    }
  }

  private async assertCanRegister(request: RegistryRegistrationRequest): Promise<void> {
    if (this.frozen) {
      throw new RegistryFrozenError(this.freezeReason)
    }
    if (this.guard) {
      await this.guard(request)
    }
  }

  /** Register a runtime definition. */
  async registerRuntime(
    def: RuntimeDefinition,
    extra?: Partial<RegistryRegistrationRequest>
  ): Promise<void> {
    await this.assertCanRegister(this.buildRequest("runtime", def, extra))
    this.runtimes.set(def.id, def)
  }

  /** Register an extension and its capabilities. */
  async registerExtension(
    def: ExtensionDefinition,
    extra?: Partial<RegistryRegistrationRequest>
  ): Promise<void> {
    await this.assertCanRegister(this.buildRequest("extension", def, extra))
    this.extensions.set(def.id, def)
    for (const cap of def.capabilities) {
      this.capabilities.set(cap.id, cap)
    }
  }

  /** Register a policy definition. */
  async registerPolicy(
    def: PolicyDefinition,
    extra?: Partial<RegistryRegistrationRequest>
  ): Promise<void> {
    await this.assertCanRegister(this.buildRequest("policy", def, extra))
    this.policies.set(def.id, def)
  }

  getRuntime(id: string): RuntimeDefinition | undefined {
    return this.runtimes.get(id)
  }

  getExtension(id: string): ExtensionDefinition | undefined {
    return this.extensions.get(id)
  }

  getPolicy(id: string): PolicyDefinition | undefined {
    return this.policies.get(id)
  }

  getCapability(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id)
  }

  listCapabilities(): CapabilityDefinition[] {
    return [...this.capabilities.values()]
  }

  listExtensions(): ExtensionDefinition[] {
    return [...this.extensions.values()]
  }

  listPolicies(): PolicyDefinition[] {
    return [...this.policies.values()]
  }

  resolveCapability(ref: CapabilityId | string): CapabilityDefinition | undefined {
    return this.capabilities.get(ref)
  }

  resolveNamespacedId(ref: NamespacedId | string): NamespacedId {
    return ref as NamespacedId
  }
}

/** Shared default registry. @category Runtime */
export const globalRegistry = new Registry()
