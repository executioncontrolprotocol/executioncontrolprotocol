const ECP_IMPORT_RE =
  /import\s*\{[^}]+\}\s*from\s*["']@executioncontrolprotocol\/(?:core|browser)["']\s*;?\s*/g

const BUILDER_NAMES = [
  "workflow",
  "step",
  "ref",
  "state",
  "env",
  "expr",
  "parallel",
  "branch",
  "loop",
] as const

/** Strip @executioncontrolprotocol/core|browser imports and inject globalThis workflow builder shim. */
export function prepareBrowserWorkflowSource(source: string): string {
  const stripped = source.replace(ECP_IMPORT_RE, "").trimStart()
  const used = BUILDER_NAMES.filter((name) => new RegExp(`\\b${name}\\b`).test(stripped))
  const bindings = used.length > 0 ? used.join(", ") : "workflow, step"
  return `const { ${bindings} } = globalThis.__ecpWorkflowShim;
${stripped}`
}
