import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { z } from "zod"
import type { Ecp } from "@executioncontrolprotocol/core"
import type { EcpEncodeInput, RunResult, WorkflowManifest } from "@executioncontrolprotocol/types"
import { ECP_FORMATS } from "@executioncontrolprotocol/types"
import { createServer, type Server } from "node:http"

/** Options for MCP server creation. @category MCP */
export interface CreateEcpMcpServerOptions {
  /** Initialized operational ECP instance. */
  ecp: Ecp
  name?: string
  version?: string
}

/** JSON mime type used for ECP MCP resources. */
const JSON_MIME = "application/json"

/** In-process run store shared across MCP server instances in this process. */
const runs = new Map<string, RunResult>()

/** Wrap a value as an MCP tool text result. */
function toolText(value: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }
}

/** Wrap a value as MCP resource JSON contents. */
function jsonContents(uri: URL, value: unknown) {
  return {
    contents: [
      { uri: uri.href, mimeType: JSON_MIME, text: JSON.stringify(value, null, 2) },
    ],
  }
}

/** Register operational tools on the server. */
function registerEcpTools(server: McpServer, ecp: Ecp): void {
  server.tool(
    "ecp.describe_environment",
    { query: z.record(z.unknown()).optional() },
    async ({ query }) => toolText(await ecp.describe(query))
  )

  server.tool(
    "ecp.search",
    { query: z.string(), options: z.record(z.unknown()).optional() },
    async ({ query, options: searchOpts }) =>
      toolText(await ecp.search(query, searchOpts as import("@executioncontrolprotocol/types").SearchOptions))
  )

  server.tool(
    "ecp.validate_workflow",
    { workflow: z.record(z.unknown()) },
    async ({ workflow }) =>
      toolText(await ecp.validate(workflow as unknown as WorkflowManifest))
  )

  server.tool(
    "ecp.run_workflow",
    {
      workflow: z.record(z.unknown()),
      input: z.record(z.unknown()).optional(),
      dryRun: z.boolean().optional(),
    },
    async ({ workflow, input, dryRun }) => {
      const result = await ecp.run(workflow as unknown as WorkflowManifest, {
        input,
        dryRun,
      })
      runs.set(result.run.id, result)
      return toolText(result)
    }
  )

  const formatSchema = z.enum(["json", "toon", "fluent"])

  server.tool(
    "ecp.encode",
    {
      source: z.union([z.record(z.unknown()), z.string()]),
      format: formatSchema.optional(),
      compact: z.boolean().optional(),
    },
    async ({ source, format, compact }) => {
      let op = ecp.encode(source as EcpEncodeInput["source"])
      if (format === "toon") op = op.uses("@executioncontrolprotocol/format-toon")
      else if (format === "fluent") op = op.uses("@executioncontrolprotocol/format-fluent")
      else op = op.uses("@executioncontrolprotocol/format-json")
      if (compact) op = op.compact()
      return toolText(await op.process())
    }
  )

  server.tool(
    "ecp.decode",
    {
      content: z.union([z.record(z.unknown()), z.string()]),
      format: z.enum(["json", "toon"]).optional(),
      strict: z.boolean().optional(),
      targetSchema: z.string().optional(),
    },
    async ({ content, format, strict, targetSchema }) => {
      let op = ecp.decode(content)
      if (format === "toon") op = op.uses("@executioncontrolprotocol/format-toon")
      else op = op.uses("@executioncontrolprotocol/format-json")
      if (strict) op = op.strict()
      if (targetSchema) op = op.to(targetSchema as "@executioncontrolprotocol.workflow")
      else if (!format || format === ECP_FORMATS.JSON) op = op.to("@executioncontrolprotocol.workflow")
      return toolText(await op.process())
    }
  )

  server.tool("ecp.get_run_status", { runId: z.string() }, async ({ runId }) =>
    toolText(runs.get(runId) ?? { error: "Run not found", runId })
  )
}

/** Register discovery resources on the server. */
function registerEcpResources(server: McpServer, ecp: Ecp): void {
  server.registerResource(
    "environment",
    "ecp://environment/describe",
    {
      title: "Environment descriptor",
      description: "Full ECP environment descriptor: runtime, extensions, capabilities, policies.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonContents(uri, await ecp.describe())
  )

  server.registerResource(
    "capabilities",
    "ecp://capabilities",
    {
      title: "Capabilities",
      description: "All capabilities available in this environment.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonContents(uri, (await ecp.describe()).capabilities)
  )

  server.registerResource(
    "policies",
    "ecp://policies",
    {
      title: "Policies",
      description: "All policies governing this environment.",
      mimeType: JSON_MIME,
    },
    async (uri) => jsonContents(uri, (await ecp.describe()).policies)
  )

  // Reserved expansion `{+id}` so capability ids containing `/` and `.`
  // (e.g. `@executioncontrolprotocol/test.echo`) match and round-trip correctly.
  server.registerResource(
    "capability",
    new ResourceTemplate("ecp://capabilities/{+id}", {
      list: async () => {
        const descriptor = await ecp.describe()
        return {
          resources: descriptor.capabilities.map((c) => ({
            uri: `ecp://capabilities/${c.id}`,
            name: c.id,
            ...(c.label ? { title: c.label } : {}),
            mimeType: JSON_MIME,
          })),
        }
      },
    }),
    {
      title: "Capability detail",
      description: "A single capability's schemas and metadata by id.",
      mimeType: JSON_MIME,
    },
    async (uri, variables) => {
      const id = String(variables.id)
      const descriptor = await ecp.describe()
      const capability = descriptor.capabilities.find((c) => c.id === id)
      return jsonContents(uri, capability ?? { error: "Capability not found", id })
    }
  )

  server.registerResource(
    "run",
    new ResourceTemplate("ecp://runs/{runId}", {
      list: async () => ({
        resources: [...runs.keys()].map((id) => ({
          uri: `ecp://runs/${id}`,
          name: id,
          mimeType: JSON_MIME,
        })),
      }),
    }),
    {
      title: "Run detail",
      description: "Result of a workflow run executed via ecp.run_workflow in this process.",
      mimeType: JSON_MIME,
    },
    async (uri, variables) => {
      const runId = String(variables.runId)
      return jsonContents(uri, runs.get(runId) ?? { error: "Run not found", runId })
    }
  )
}

/** Format the environment's capabilities as a bullet list for prompts. */
function capabilityList(
  capabilities: { id: string; label?: string }[]
): string {
  if (capabilities.length === 0) return "(no capabilities are registered)"
  return capabilities
    .map((c) => `- ${c.id}${c.label ? ` — ${c.label}` : ""}`)
    .join("\n")
}

/** Register guidance prompts on the server. */
function registerEcpPrompts(server: McpServer, ecp: Ecp): void {
  server.registerPrompt(
    "ecp.author_workflow",
    {
      title: "Author an ECP workflow",
      description: "Guide the agent to build a valid @executioncontrolprotocol.workflow manifest for a goal.",
      argsSchema: { goal: z.string() },
    },
    async ({ goal }) => {
      const descriptor = await ecp.describe()
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Author an ECP workflow manifest (schema "@executioncontrolprotocol.workflow", version "1.0") for this goal:`,
                "",
                goal,
                "",
                "Only use capabilities available in this environment:",
                capabilityList(descriptor.capabilities),
                "",
                "Rules:",
                "- Output a single JSON workflow manifest.",
                "- Each step's `uses` must be one of the capability ids above.",
                "- Use `as` to commit a step output to state; reference prior state with { \"$ref\": \"state.<key>\" }.",
                "- Do not include runtime, extension, policy, or secret configuration.",
                "Then call ecp.validate_workflow to confirm it is valid before running.",
              ].join("\n"),
            },
          },
        ],
      }
    }
  )

  server.registerPrompt(
    "ecp.repair_workflow",
    {
      title: "Repair an ECP workflow",
      description: "Guide the agent to fix a workflow using validation errors.",
      argsSchema: { workflow: z.string(), errors: z.string().optional() },
    },
    ({ workflow, errors }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Fix this ECP workflow manifest so it validates against the environment.",
              "",
              "Workflow:",
              workflow,
              "",
              "Validation errors:",
              errors && errors.trim().length > 0
                ? errors
                : "(none provided — call ecp.validate_workflow to obtain them)",
              "",
              "Return the corrected JSON workflow manifest only, then re-validate.",
            ].join("\n"),
          },
        },
      ],
    })
  )

  server.registerPrompt(
    "ecp.explain_environment",
    {
      title: "Explain the environment",
      description: "Summarize the capabilities and policies available in this environment.",
    },
    async () => {
      const descriptor = await ecp.describe()
      const policies =
        descriptor.policies.length > 0
          ? descriptor.policies
              .map((p) => `- ${p.id}${p.summary ? ` — ${p.summary}` : ""}`)
              .join("\n")
          : "(no policies are bound)"
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Explain what this ECP environment ("${descriptor.environment.id}") can do.`,
                "",
                "Capabilities:",
                capabilityList(descriptor.capabilities),
                "",
                "Policies:",
                policies,
              ].join("\n"),
            },
          },
        ],
      }
    }
  )
}

/**
 * Create an MCP server exposing ECP operational APIs as tools, resources, and prompts.
 * @category MCP
 */
export function createEcpMcpServer(options: CreateEcpMcpServerOptions): McpServer {
  const { ecp } = options
  const server = new McpServer({
    name: options.name ?? "ecp",
    version: options.version ?? "1.0.0",
  })

  registerEcpTools(server, ecp)
  registerEcpResources(server, ecp)
  registerEcpPrompts(server, ecp)

  return server
}

/** Serve MCP over stdio. @category MCP */
export async function serveStdio(options: {
  environment: import("@executioncontrolprotocol/core").Environment
  name?: string
  version?: string
}): Promise<void> {
  const ecp = await options.environment.init()
  const server = createEcpMcpServer({ ecp, name: options.name, version: options.version })
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

/** Default MCP endpoint path for {@link serveHttp}. */
const DEFAULT_MCP_PATH = "/mcp"

/**
 * Serve MCP over Streamable HTTP.
 *
 * Implements the MCP Streamable HTTP transport in stateless mode: each POST to
 * the MCP endpoint gets a fresh {@link McpServer} + transport bound to the same
 * initialized {@link Ecp}, avoiding request-id collisions between concurrent
 * clients. Returns the underlying `http.Server` so callers can close it.
 *
 * @category MCP
 */
export async function serveHttp(options: {
  environment: import("@executioncontrolprotocol/core").Environment
  port?: number
  path?: string
  name?: string
  version?: string
}): Promise<Server> {
  const ecp = await options.environment.init()
  const port = options.port ?? 8787
  const path = options.path ?? DEFAULT_MCP_PATH

  const httpServer = createServer((req, res) => {
    void (async () => {
      const url = req.url ?? ""
      const pathname = url.split("?")[0]
      if (pathname !== path) {
        res.writeHead(404, { "Content-Type": JSON_MIME })
        res.end(JSON.stringify({ error: "Not found" }))
        return
      }

      if (req.method !== "POST") {
        // Stateless mode: no server-initiated streams, so GET/DELETE are
        // not supported. Mirror the MCP SDK's stateless guidance.
        res.writeHead(405, { "Content-Type": JSON_MIME, Allow: "POST" })
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Method not allowed. Use POST." },
            id: null,
          })
        )
        return
      }

      const server = createEcpMcpServer({
        ecp,
        name: options.name,
        version: options.version,
      })
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      res.on("close", () => {
        void transport.close()
        void server.close()
      })
      try {
        await server.connect(transport)
        await transport.handleRequest(req, res)
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": JSON_MIME })
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal server error" },
              id: null,
            })
          )
        }
      }
    })()
  })

  await new Promise<void>((resolve) => httpServer.listen(port, resolve))
  return httpServer
}
