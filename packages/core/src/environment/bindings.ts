import type { CapabilityId, HarnessId, NamespacedId } from "@executioncontrolprotocol/types"
import type { HookDefinition } from "../definitions/types.js"
import {
  cloneConfigForManifest,
  resolveEnvConfigAsync,
  type EnvironmentConfigResolver,
} from "./config-resolver.js"

/** Resolved runtime binding. */
export interface ResolvedRuntimeBinding {
  id: NamespacedId
  label?: string
  config: Record<string, unknown>
}

/** Resolved extension binding. */
export interface ResolvedExtensionBinding {
  id: NamespacedId
  label?: string
  order: number
  config: Record<string, unknown>
}

/** Resolved policy binding. */
export interface ResolvedPolicyBinding {
  id: NamespacedId
  label?: string
  order: number
  config: Record<string, unknown>
}

/** Resolved harness binding. */
export interface ResolvedHarnessBinding {
  id: HarnessId
  label?: string
  uses: CapabilityId
  config: Record<string, unknown>
}

/** All resolved bindings for execution. */
export interface ResolvedBindings {
  runtime: ResolvedRuntimeBinding
  extensions: ResolvedExtensionBinding[]
  policies: ResolvedPolicyBinding[]
  harnesses: ResolvedHarnessBinding[]
  extensionHooks: HookDefinition[]
  policyHooks: Array<{ hook: HookDefinition; config: Record<string, unknown> }>
}

/** Unresolved config for environment manifests (keeps `$env` placeholders). */
export function manifestConfig(config: Record<string, unknown>): Record<string, unknown> {
  return cloneConfigForManifest(config)
}

/** Resolve bindings for execution using the config resolver chain. */
export async function resolveBindingsForRun(
  runtimeBinding: {
    id: NamespacedId
    label?: string
    rawConfig: Record<string, unknown>
  },
  extensionBindings: Array<{
    id: NamespacedId
    label?: string
    order: number
    rawConfig: Record<string, unknown>
  }>,
  policyBindings: Array<{
    id: NamespacedId
    label?: string
    order: number
    rawConfig: Record<string, unknown>
  }>,
  harnessBindings: Array<{
    id: HarnessId
    label?: string
    uses: CapabilityId
    rawConfig: Record<string, unknown>
  }>,
  extensionHooks: HookDefinition[],
  policyHooks: Array<{ hook: HookDefinition; config: Record<string, unknown> }>,
  resolvers: EnvironmentConfigResolver[]
): Promise<ResolvedBindings> {
  return {
    runtime: {
      id: runtimeBinding.id,
      label: runtimeBinding.label,
      config: await resolveEnvConfigAsync(runtimeBinding.rawConfig, resolvers),
    },
    extensions: await Promise.all(
      extensionBindings.map(async (b) => ({
        id: b.id,
        label: b.label,
        order: b.order,
        config: await resolveEnvConfigAsync(b.rawConfig, resolvers),
      }))
    ),
    policies: await Promise.all(
      policyBindings.map(async (b) => ({
        id: b.id,
        label: b.label,
        order: b.order,
        config: await resolveEnvConfigAsync(b.rawConfig, resolvers),
      }))
    ),
    harnesses: await Promise.all(
      harnessBindings.map(async (b) => ({
        id: b.id,
        label: b.label,
        uses: b.uses,
        config: await resolveEnvConfigAsync(b.rawConfig, resolvers),
      }))
    ),
    extensionHooks,
    policyHooks: await Promise.all(
      policyHooks.map(async (p) => ({
        hook: p.hook,
        config: await resolveEnvConfigAsync(p.config, resolvers),
      }))
    ),
  }
}
