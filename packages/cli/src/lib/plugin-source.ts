/**
 * Classify a plugin install target as npm, git, or a local path.
 * @category CLI
 */
export function pluginSourceKind(spec: string): "npm" | "git" | "path" {
  if (/^git(\+ssh|\+https)?:/i.test(spec) || /github\.com[:/]/i.test(spec) || spec.endsWith(".git")) {
    return "git"
  }
  if (
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("file:") ||
    /^[a-zA-Z]:[\\/]/.test(spec)
  ) {
    return "path"
  }
  return "npm"
}

/**
 * Package name from an install spec (`@scope/name@version` or a bare name).
 * @category CLI
 */
export function pluginNameFromSpec(spec: string): string {
  if (pluginSourceKind(spec) !== "npm") return spec
  if (spec.startsWith("@")) {
    const rest = spec.slice(1)
    const at = rest.lastIndexOf("@")
    return at > 0 ? `@${rest.slice(0, at)}` : spec
  }
  const at = spec.lastIndexOf("@")
  return at > 0 ? spec.slice(0, at) : spec
}
