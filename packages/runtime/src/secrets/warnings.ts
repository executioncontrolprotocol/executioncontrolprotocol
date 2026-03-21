/**
 * @category Secrets
 */

export const WARNING_ENV_PROVIDER =
  "Secret source 'env' is intended for local testing and is not recommended for production use.";

export const WARNING_DOTENV_PROVIDER =
  "Secret source 'dotenv' is intended for testing and local development only. Use OS-native secure storage for regular use.";

export const WARNING_CLI_SESSION_PROVIDER =
  "CLI-entered secrets are ephemeral and intended only for temporary testing.";

export function warningForProvider(providerId: string): string | undefined {
  switch (providerId) {
    case "env":
      return WARNING_ENV_PROVIDER;
    case "dotenv":
      return WARNING_DOTENV_PROVIDER;
    case "cli-session":
      return WARNING_CLI_SESSION_PROVIDER;
    default:
      return undefined;
  }
}
