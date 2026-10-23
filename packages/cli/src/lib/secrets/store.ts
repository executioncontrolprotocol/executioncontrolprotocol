import { createOsSecretsStore, type SecretsStore } from "@executioncontrolprotocol/node"

/** OS keychain store for CLI secret commands. */
export function getCliSecretsStore(): SecretsStore {
  return createOsSecretsStore()
}
