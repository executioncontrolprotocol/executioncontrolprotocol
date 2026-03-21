/**
 * Secret provider contracts for ECP (built-in providers: `os.secrets`, `process.env`, `dot.env`, `session`, …).
 *
 * @category Secrets
 */

/**
 * How strictly to treat insecure secret sources (`process.env`, `dot.env`, `session`).
 *
 * @category Secrets
 */
export type SecretPolicyMode = "permissive" | "warn" | "strict";

/**
 * Where a bound secret value is loaded from (provider id + lookup key).
 *
 * @category Secrets
 */
export interface CredentialBindingSource {
  /** Secret provider id (e.g. `os.secrets`, `process.env`, `dot.env`). */
  provider: string;

  /**
   * Provider-specific lookup key.
   * For `os.secrets`, use a plain logical key (e.g. `GITHUB_API_KEY` or `server/fetch.token`); shorthand
   * `os.secrets.MY_KEY` in docs maps to `provider: os.secrets`, `key: MY_KEY`.
   * Default generated ref ids are `ECP_SECRET_REF_PROTOCOL_PREFIX` from `@executioncontrolprotocol/runtime` plus the normalized key; `provider` disambiguates namespaces.
   */
  key: string;

  /** Optional override for the ref `id` (normally `ECP_SECRET_REF_PROTOCOL_PREFIX` + normalized key from runtime). */
  refId?: string;
}

/**
 * Bind a logical env var name to a secret reference for MCP stdio (and similar).
 *
 * @category Secrets
 */
export interface ToolServerCredentialBinding {
  /** Environment variable name passed to the child process. */
  name: string;

  source: CredentialBindingSource;

  /** If true, resolution failure fails the run. */
  required?: boolean;

  /** How the value is delivered; only `env` is supported initially. */
  delivery?: "env";

  description?: string;

  /**
   * When true, allows insecure providers under `strict` policy.
   */
  allowInsecure?: boolean;
}

/**
 * Canonical secret reference (values are never stored in config — only refs).
 *
 * @category Secrets
 */
export interface SecretRef {
  /** Stable id for logging and tooling (not the secret value). */
  id: string;

  provider: string;

  key: string;

  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * @category Secrets
 */
export interface SecretProviderCapabilities {
  secureAtRest: boolean;
  interactiveUnlock: boolean;
  headlessSupported: boolean;
  persistent: boolean;
  supportsList: boolean;
  supportsDelete: boolean;
  supportsMetadata: boolean;
}

/**
 * @category Secrets
 */
export interface SecretValueResult {
  value: string;
  redactedPreview: string;
  metadata?: Record<string, unknown>;
}

/**
 * @category Secrets
 */
export interface SecretStoreInput {
  ref: SecretRef;
  value: string;
  metadata?: Record<string, unknown>;
}

/**
 * @category Secrets
 */
export interface SecretProviderHealth {
  ok: boolean;
  providerId: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Pluggable secret backend (built-in or third-party).
 *
 * @category Secrets
 */
export interface SecretProvider {
  readonly id: string;
  readonly displayName: string;

  isAvailable(): Promise<boolean>;
  capabilities(): SecretProviderCapabilities;
  healthCheck(): Promise<SecretProviderHealth>;

  store?(input: SecretStoreInput): Promise<void>;
  load(ref: SecretRef): Promise<SecretValueResult | null>;
  delete?(ref: SecretRef): Promise<void>;
  list?(): Promise<SecretRef[]>;
  validateRef?(ref: SecretRef): Promise<void>;
}

/**
 * @category Secrets
 */
export interface RegisteredSecretProvider {
  provider: SecretProvider;
  source: "builtin" | "plugin";
}

/**
 * @category Secrets
 */
export interface SecretProviderRegistry {
  register(provider: SecretProvider, source?: "builtin" | "plugin"): void;
  get(providerId: string): SecretProvider | undefined;
  list(): RegisteredSecretProvider[];
}

/**
 * @category Secrets
 */
export interface SecretResolutionContext {
  serverId?: string;
  projectId?: string;
  sessionId?: string;
  mode?: "dev" | "test" | "prod";
  /** When resolving a binding, mirrors `ToolServerCredentialBinding.allowInsecure`. */
  allowInsecureForBinding?: boolean;
}

/**
 * @category Secrets
 */
export interface ResolvedSecret {
  ref: SecretRef;
  value: string;
  redactedPreview: string;
  providerId: string;
  warnings: string[];
}

/**
 * @category Secrets
 */
export interface SecretBroker {
  resolve(ref: SecretRef, ctx?: SecretResolutionContext): Promise<ResolvedSecret>;
  resolveMany(refs: SecretRef[], ctx?: SecretResolutionContext): Promise<ResolvedSecret[]>;
  resolveBinding(
    binding: ToolServerCredentialBinding,
    ctx?: SecretResolutionContext,
  ): Promise<ResolvedSecret>;
  resolveBindingsToEnv(
    bindings: ToolServerCredentialBinding[],
    ctx?: SecretResolutionContext,
  ): Promise<{ env: Record<string, string>; warnings: string[] }>;
}
