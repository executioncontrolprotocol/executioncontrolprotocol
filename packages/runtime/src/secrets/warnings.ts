/**
 * @category Secrets
 */

import { DOT_PROVIDER_ID, ENV_PROVIDER_ID, SESSION_PROVIDER_ID } from "./provider-ids.js";

export const WARNING_ENV_PROVIDER =
  "Secret source 'process.env' is intended for local testing and is not recommended for production use.";

export const WARNING_DOT_PROVIDER =
  "Secret source 'dot.env' (.env file) is intended for testing and local development only. Use OS-native secure storage for regular use.";

export const WARNING_SESSION_PROVIDER =
  "CLI-entered secrets are ephemeral and intended only for temporary testing.";

export function warningForProvider(providerId: string): string | undefined {
  switch (providerId) {
    case ENV_PROVIDER_ID:
      return WARNING_ENV_PROVIDER;
    case DOT_PROVIDER_ID:
      return WARNING_DOT_PROVIDER;
    case SESSION_PROVIDER_ID:
      return WARNING_SESSION_PROVIDER;
    default:
      return undefined;
  }
}
