import { extension, testExtension, type EnvironmentBinding } from "@executioncontrolprotocol/core"
import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import type { EcpHost } from "@executioncontrolprotocol/plugin-sdk"

/**
 * Build a Node host for MCP unit tests.
 * @category MCP
 */
export async function testHost(extra: EnvironmentBinding[] = []) {
  const env = environment(NODE_ENVIRONMENT_ID, "mcp-test").with([
    extension(testExtension, "Test").with({}),
    ...extra,
  ])
  const ecp = await env.init()
  const host: EcpHost = {
    ecp,
    registry: ecp.getRegistry(),
    environmentId: NODE_ENVIRONMENT_ID,
    output: "pretty",
  }
  return { env, ecp, host }
}

/** Fluent echo workflow used as inlined MCP `source`. @category MCP */
export const ECHO_SOURCE = `import { workflow, step } from "@executioncontrolprotocol/core"

export default workflow("Echo").run([
  step("@executioncontrolprotocol/test.echo", "Echo").with({ value: "hi" }).as("out"),
])
`

type TextContent = { type: string; text: string }

/**
 * Parse the first text content block of a tool result as JSON.
 * @category MCP
 */
export function parseText(content: TextContent[] | undefined): unknown {
  const text = content?.find((c) => c.type === "text")?.text
  if (text === undefined) throw new Error("no text content")
  return JSON.parse(text)
}

/**
 * Unwrap an `{ ok, data }` / `{ ok: false, error }` tool envelope.
 * @category MCP
 */
export function parseEnvelope(content: TextContent[] | undefined): {
  ok: boolean
  data?: unknown
  error?: { code: string; message: string }
} {
  return parseText(content) as {
    ok: boolean
    data?: unknown
    error?: { code: string; message: string }
  }
}
