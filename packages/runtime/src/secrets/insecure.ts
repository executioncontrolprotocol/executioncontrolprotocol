/**
 * @category Secrets
 */

const INSECURE = new Set(["env", "dotenv", "cli-session"]);

export function isInsecureSecretProvider(providerId: string): boolean {
  return INSECURE.has(providerId);
}
