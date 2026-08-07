import type { EnvValue, SecretValue, BrowserValue } from "@executioncontrolprotocol/types"

/** Extension id for process environment resolution. @category Environment */
export const PROCESS_ENV_RESOLVER_ID = "@executioncontrolprotocol/process-env"

/** Extension id for OS secrets resolution. @category Environment */
export const SECRETS_RESOLVER_ID = "@executioncontrolprotocol/secrets"

/** Extension id for browser encrypted secrets resolution. @category Environment */
export const BROWSER_SECRETS_RESOLVER_ID = "@executioncontrolprotocol/browser-secrets"

/** Resolvers excluded from the `$env` fallback chain. @category Environment */
const ENV_CHAIN_EXCLUDED_RESOLVER_IDS = new Set([
  SECRETS_RESOLVER_ID,
  BROWSER_SECRETS_RESOLVER_ID,
])

function resolverErrorLabel(resolverId: string): string {
  if (resolverId === SECRETS_RESOLVER_ID) return "Secret"
  if (resolverId === BROWSER_SECRETS_RESOLVER_ID) return "Browser secret"
  return "Environment variable"
}

/** Resolves `env("KEY")` and `secrets("KEY")` values for environment bindings. @category Environment */
export interface EnvironmentConfigResolver {
  /** Resolver identifier (e.g. extension id). */
  id: string
  /** Resolve a config key name to a value, or undefined if not handled. */
  resolve(name: string): Promise<unknown> | unknown
}

/** Options when resolving a single config key. @category Environment */
export interface ResolveEnvNameOptions {
  optional?: boolean
  fallback?: unknown
}

function findResolver(
  resolvers: EnvironmentConfigResolver[],
  id: string
): EnvironmentConfigResolver | undefined {
  return resolvers.find((r) => r.id === id)
}

/**
 * Resolve a key using a specific extension resolver.
 * @category Environment
 */
export async function resolveConfigName(
  name: string,
  resolvers: EnvironmentConfigResolver[],
  options?: ResolveEnvNameOptions & { resolverId?: string }
): Promise<unknown> {
  const resolverId = options?.resolverId
  if (resolverId) {
    const resolver = findResolver(resolvers, resolverId)
    if (resolver) {
      const value = await resolver.resolve(name)
      if (value !== undefined) return value
    }
    if (options?.optional) return options.fallback
    throw new Error(`${resolverErrorLabel(resolverId)} ${name} is not set`)
  }

  for (const resolver of resolvers) {
    const value = await resolver.resolve(name)
    if (value !== undefined) return value
  }
  if (options?.optional) return options.fallback
  throw new Error(`Environment variable ${name} is not set`)
}

/**
 * Resolve `$env`, `$secret`, and `$browser` placeholders in a config object using extension resolvers.
 * @category Environment
 */
export async function resolveEnvConfigAsync(
  config: Record<string, unknown>,
  resolvers: EnvironmentConfigResolver[]
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(config)) {
    out[k] = await resolveEnvValueAsync(v, resolvers)
  }
  return out
}

async function resolveEnvValueAsync(
  v: unknown,
  resolvers: EnvironmentConfigResolver[]
): Promise<unknown> {
  if (v !== null && typeof v === "object" && "$env" in v) {
    const e = v as EnvValue
    const envResolvers = resolvers.filter((r) => !ENV_CHAIN_EXCLUDED_RESOLVER_IDS.has(r.id))
    return resolveConfigName(e.$env, envResolvers, {
      optional: e.optional,
      fallback: e.fallback,
    })
  }
  if (v !== null && typeof v === "object" && "$secret" in v) {
    const s = v as SecretValue
    return resolveConfigName(s.$secret, resolvers, {
      optional: s.optional,
      fallback: s.fallback,
      resolverId: SECRETS_RESOLVER_ID,
    })
  }
  if (v !== null && typeof v === "object" && "$browser" in v) {
    const b = v as BrowserValue
    return resolveConfigName(b.$browser, resolvers, {
      optional: b.optional,
      fallback: b.fallback,
      resolverId: BROWSER_SECRETS_RESOLVER_ID,
    })
  }
  if (Array.isArray(v)) {
    return Promise.all(v.map((item) => resolveEnvValueAsync(item, resolvers)))
  }
  if (v !== null && typeof v === "object") {
    const o: Record<string, unknown> = {}
    for (const [k, c] of Object.entries(v)) {
      o[k] = await resolveEnvValueAsync(c, resolvers)
    }
    return o
  }
  return v
}

/** Copy config for manifests without resolving secrets. @category Environment */
export function cloneConfigForManifest(
  config: Record<string, unknown>
): Record<string, unknown> {
  return structuredClone(config)
}
