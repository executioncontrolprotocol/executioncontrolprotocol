/**
 * Secret providers, broker, and MCP stdio env resolution.
 *
 * @category Secrets
 */

export { ECP_KEYRING_ACCOUNT_PREFIX, ECP_KEYRING_SERVICE } from "./constants.js";
export {
  DOT_PROVIDER_ID,
  ENV_PROVIDER_ID,
  OS_PROVIDER_ID,
  SESSION_PROVIDER_ID,
} from "./provider-ids.js";
export {
  canonicalSecretKeyForOsStorage,
  normalizeOsKeychainAccountKey,
  osKeychainCredentialTarget,
} from "./os-keychain-account-key.js";
export { redactSecret } from "./redaction.js";
export { DefaultSecretBroker } from "./broker.js";
export { DefaultSecretProviderRegistry } from "./registry.js";
export {
  canonicalSecretKeyForBinding,
  secretRefFromBinding,
  secretRefIdFromLogicalKey,
} from "./ref.js";
export { isInsecureSecretProvider } from "./insecure.js";
export * from "./warnings.js";
export {
  putCliSessionSecret,
  getCliSessionSecret,
  deleteCliSessionSecret,
  clearCliSessionSecrets,
  listCliSessionKeys,
} from "./cli-session-store.js";
export { buildMinimalStdioEnv } from "./minimal-env.js";
export { resolveStdioEnvForToolServer } from "./mcp-env.js";
export type { ToolServerDefinitionLike } from "./mcp-env.js";
export {
  registerBuiltinSecretProviders,
  createDefaultSecretBroker,
} from "./builtin.js";
export type {
  BuiltinSecretRegistrationOptions,
  CreateDefaultSecretBrokerOptions,
} from "./builtin.js";
export { EnvSecretProvider } from "./providers/env-secret-provider.js";
export { DotenvSecretProvider } from "./providers/dotenv-secret-provider.js";
export { CliSessionSecretProvider } from "./providers/cli-session-secret-provider.js";
export { OsKeychainSecretProvider } from "./providers/os-keychain-secret-provider.js";
