import type { EnvironmentDescriptor } from "@executioncontrolprotocol/core/types"

/**
 * Virtual Monaco URI for the read-only Environment tab.
 * @category App
 */
export const ENVIRONMENT_EDITOR_PATH = "file:///ecp-workflow/environment.ts"

const PLACEHOLDER_SOURCE = `import { environment } from "@executioncontrolprotocol/core"

// View only — no environment is connected.
export default environment("unknown").with([])
`

/**
 * Render a view-only Fluent environment file from {@link EnvironmentDescriptor}.
 * Binding `config` is omitted so secret-shaped fields never appear in the App.
 *
 * @category App
 */
export function environmentSourceFromDescriptor(
  descriptor: EnvironmentDescriptor | null | undefined
): string {
  if (!descriptor) return PLACEHOLDER_SOURCE

  const extensions = [...descriptor.extensions].sort((left, right) => {
    if (left.order !== right.order) return left.order - right.order
    return left.id.localeCompare(right.id)
  })
  const policies = [...descriptor.policies].sort((left, right) => left.id.localeCompare(right.id))

  const imports = ["environment"]
  if (extensions.length > 0) imports.push("extension")
  if (policies.length > 0) imports.push("policy")

  const idArg = JSON.stringify(descriptor.environment.id)
  const labelArg = descriptor.environment.label
    ? `, ${JSON.stringify(descriptor.environment.label)}`
    : ""

  const bindings = [
    ...extensions.map((ext) => `  extension(${JSON.stringify(ext.id)}),`),
    ...policies.map((item) => `  policy(${JSON.stringify(item.id)}),`),
  ]

  const withBlock =
    bindings.length === 0 ? ".with([])" : `.with([\n${bindings.join("\n")}\n])`

  return [
    `import { ${imports.join(", ")} } from "@executioncontrolprotocol/core"`,
    "",
    "// View only — process host: installed plugins.",
    `export default environment(${idArg}${labelArg})${withBlock}`,
    "",
  ].join("\n")
}
