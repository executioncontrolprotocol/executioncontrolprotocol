import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  ECP_INPUT_INVALID,
  ECP_PLUGIN_DENIED,
  ECP_PLUGINS_MISSING,
  ECP_STEP_FAILED,
  EcpError,
} from "@executioncontrolprotocol/core/types"
import {
  loadWorkflowFile,
  readStepJournal,
  readTextFile,
  sha256Hex,
} from "@executioncontrolprotocol/node"
import { applyFormat } from "./format.js"
import { progressFromRunEvent } from "./progress.js"
import { loadParentRun, rerunOptionsFromJournal } from "./rerun.js"
import { toolCaught, toolOk } from "./result.js"
import type { McpSessionState } from "./session.js"
import { loadWorkflowPathOrSource } from "./source.js"
import type { CreateEcpMcpServerOptions } from "./types.js"

const recordSchema = z.record(z.unknown())

/**
 * Register the closed meta-tool set. Handlers call the same Ecp / journal / oclif
 * surfaces as the CLI operations, without importing `@executioncontrolprotocol/cli`.
 * @category MCP
 */
export function registerMetaTools(
  server: McpServer,
  options: CreateEcpMcpServerOptions,
  state: McpSessionState
): void {
  server.tool(
    "ecp_search",
    "Search environment capabilities by id or label.",
    { query: z.string() },
    async ({ query }) => {
      try {
        return toolOk(await state.host.ecp.search(query))
      } catch (err) {
        return toolCaught(err)
      }
    }
  )

  server.tool(
    "ecp_describe",
    "Describe the environment's extensions, capabilities, and policies. Pass format for toon.",
    {
      format: z.string().optional(),
      capability: z.string().optional(),
      extension: z.string().optional(),
    },
    async ({ format, capability, extension }) => {
      try {
        const query =
          capability || extension
            ? {
                ...(capability
                  ? { capabilities: { match: capability, mode: "exact" as const } }
                  : {}),
                ...(extension
                  ? { extensions: { match: extension, mode: "exact" as const } }
                  : {}),
              }
            : undefined
        const descriptor = await state.host.ecp.describe(query)
        return toolOk(await applyFormat(state.host.ecp, descriptor, format))
      } catch (err) {
        return toolCaught(err)
      }
    }
  )

  server.tool(
    "ecp_validate",
    "Validate a workflow file path or inlined Fluent source.",
    { path: z.string().optional(), source: z.string().optional() },
    async ({ path, source }) => {
      try {
        const loaded = await loadWorkflowPathOrSource({ path, source })
        try {
          return toolOk(await state.host.ecp.validate(loaded.loaded.manifest))
        } finally {
          await loaded.cleanup()
        }
      } catch (err) {
        return toolCaught(err)
      }
    }
  )

  server.tool(
    "ecp_run",
    "Run a workflow file path or inlined Fluent source. Returns the run envelope including runId.",
    {
      path: z.string().optional(),
      source: z.string().optional(),
      input: recordSchema.optional(),
      dryRun: z.boolean().optional(),
      to: z.string().optional(),
      events: z.boolean().optional(),
    },
    async ({ path, source, input, dryRun, to, events }, extra) => {
      try {
        const loaded = await loadWorkflowPathOrSource({ path, source })
        // Keep inlined source on disk so ecp_runs_rerun can reload journal.workflowPath.
        const result = await state.host.ecp.run(loaded.loaded.manifest, {
          input,
          dryRun,
          stopAfterStepId: to,
          onEvent: progressFromRunEvent(extra, events),
          journal: {
            workflowPath: loaded.workflowPath,
            workflowHash: sha256Hex(loaded.sourceText),
            environmentId: state.host.environmentId,
          },
        })
        return toolOk({ ...result, runId: result.run.id })
      } catch (err) {
        return toolCaught(err)
      }
    }
  )

  server.tool(
    "ecp_runs_show",
    "Show a run journal (run.json), or one step with step.",
    { runId: z.string(), step: z.string().optional() },
    async ({ runId, step }) => {
      try {
        if (step) {
          return toolOk(await readStepJournal(runId, step))
        }
        return toolOk(await loadParentRun(runId))
      } catch (err) {
        return toolCaught(err)
      }
    }
  )

  server.tool(
    "ecp_runs_rerun",
    "Rerun from a step using the current workflow file recorded in the journal.",
    {
      runId: z.string(),
      from: z.string().optional(),
      to: z.string().optional(),
    },
    async ({ runId, from, to }) => {
      try {
        const parent = await loadParentRun(runId)
        if (!parent.workflowPath) {
          throw new EcpError(ECP_INPUT_INVALID, "Journal has no workflow path")
        }
        const loaded = await loadWorkflowFile(parent.workflowPath)
        const extras = await rerunOptionsFromJournal({
          parent,
          workflow: loaded.manifest,
          fromStepId: from,
          toStepId: to,
        })
        const sourceText = await readTextFile(parent.workflowPath)
        const result = await state.host.ecp.run(loaded.manifest, {
          ...extras,
          journal: {
            workflowPath: parent.workflowPath,
            workflowHash: sha256Hex(sourceText),
            environmentId: state.host.environmentId,
            parentRunId: parent.runId,
          },
        })
        return toolOk({ ...result, runId: result.run.id })
      } catch (err) {
        return toolCaught(err)
      }
    }
  )

  server.tool(
    "ecp_invoke",
    "Invoke a registered capability by id without running a workflow.",
    { capabilityId: z.string(), input: recordSchema.optional() },
    async ({ capabilityId, input }) => {
      try {
        const result = await state.host.ecp.invoke(capabilityId).with(input ?? {}).process()
        if (!result.success) {
          const diagnostic = result.diagnostics[0]
          throw new EcpError(
            diagnostic?.code ?? ECP_STEP_FAILED,
            diagnostic?.message ?? "Capability invoke did not succeed",
            { path: diagnostic?.path, suggestions: diagnostic?.suggestions }
          )
        }
        return toolOk(result)
      } catch (err) {
        return toolCaught(err)
      }
    }
  )

  server.tool(
    "ecp_plugins_install",
    "Install an oclif plugin. Third-party packages need confirm: true and the CLI trust policy.",
    { package: z.string(), confirm: z.boolean() },
    async ({ package: spec, confirm }) => {
      try {
        if (!confirm) {
          throw new EcpError(
            ECP_PLUGIN_DENIED,
            "ecp_plugins_install requires confirm: true",
            {
              suggestions: [
                "Ask the user to approve the install, then retry with confirm: true",
              ],
            }
          )
        }
        if (options.installPlugin) {
          const data = await options.installPlugin(spec)
          await options.onPluginsChanged?.()
          return toolOk(data ?? { installed: spec })
        }
        if (options.config) {
          await options.config.runCommand("plugins:install", [spec])
          await options.onPluginsChanged?.()
          return toolOk({ installed: spec })
        }
        throw new EcpError(
          ECP_PLUGINS_MISSING,
          "Plugin install requires the CLI host",
          { suggestions: ["Run ecp mcp serve so oclif can install plugins"] }
        )
      } catch (err) {
        return toolCaught(err)
      }
    }
  )
}
