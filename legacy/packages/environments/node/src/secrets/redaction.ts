/**
 * Redact a secret for logs and CLI output.
 * @category Secrets
 */
export function redactSecret(value: string): string {
  if (value.length <= 8) return "****"
  return `${value.slice(0, 2)}****${value.slice(-4)}`
}
