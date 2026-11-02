import { z } from "zod"
import { readFile } from "node:fs/promises"
import { NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import {
  defineOperation,
  EcpCliError,
  ECP_RERUN_INCOMPATIBLE,
  EXIT_USAGE,
} from "@executioncontrolprotocol/plugin-sdk"
import { EcpError } from "@executioncontrolprotocol/core/types"
import { CONFIG_FLAG_HELP } from "../lib/config-file.js"
import { prepareWorkflowRun, throwIfRunFailed } from "../lib/prepare-workflow.js"
import { terminateIfNeeded } from "../lib/load-ecp.js"
import {
  hashWorkflowSource,
  listRunJournals,
  loadParentRun,
  pluginVersions,
  readStepJournal,
  runOptionsFromJournal,
} from "../lib/runs-io.js"

function asCli(err: unknown): never {
  if (err instanceof EcpCliError) throw err
  if (err instanceof EcpError) {
    throw new EcpCliError(err.code, err.message, {
      suggestions: err.suggestions,
      exitCode: err.code === ECP_RERUN_INCOMPATIBLE ? EXIT_USAGE : 1,
    })
  }
  throw err
}

/** `ecp runs` topic help. @category CLI */
export const runsTopicOperation = defineOperation("runs")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Inspect and continue workflow runs",
    description: "Subcommands: list, show, resume, rerun.",
    useCases: ["Resume a stopped or paused run"],
  })
  .withHandler(async () =>
    [
      "Usage: ecp runs <subcommand>",
      "",
      "  list                 Newest journals first",
      "  show RUN-ID          One journal (--step for a step file)",
      "  resume RUN-ID        Continue a stopped or paused run",
      "  rerun RUN-ID         Re-run from a step using the current file",
      "",
      "Run ecp runs <cmd> --help for flags.",
    ].join("\n")
  )
  .build()

/** `ecp runs list`. @category CLI */
export const runsListOperation = defineOperation("runs:list")
  .withInput(
    z.object({
      status: z.string().optional(),
      workflow: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "List run journals",
    description: "Newest first. Filter with --status and --workflow.",
    useCases: ["Find a run id to resume"],
    examples: ["ecp runs list", "ecp runs list --status stopped"],
  })
  .withHandler(async (input) => {
    const status = input.status ? String(input.status) : undefined
    const workflow = input.workflow ? String(input.workflow) : undefined
    const docs = await listRunJournals()
    return docs.filter((doc) => {
      if (status && doc.status !== status) return false
      if (workflow && doc.workflowPath !== workflow) return false
      return true
    })
  })
  .build()

/** `ecp runs show`. @category CLI */
export const runsShowOperation = defineOperation("runs:show")
  .withInput(
    z.object({
      "run-id": z.string(),
      step: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Show a run journal",
    description: "Print run.json, or one step with --step.",
    useCases: ["Inspect cursor, status, and per-step records"],
    examples: ["ecp runs show <id>", "ecp runs show <id> --step echo"],
    cli: { args: ["run-id"] },
  })
  .withHandler(async (input) => {
    const runId = String(input["run-id"])
    if (input.step) return readStepJournal(runId, String(input.step))
    return loadParentRun(runId)
  })
  .build()

/** `ecp runs resume`. @category CLI */
export const runsResumeOperation = defineOperation("runs:resume")
  .withInput(
    z.object({
      "run-id": z.string(),
      config: z.string().optional().describe(CONFIG_FLAG_HELP),
      to: z.string().optional(),
      approve: z.boolean().optional(),
    })
  )
  .withMetadata({
    summary: "Resume a stopped or paused run",
    description:
      "Starts a new run from the journal cursor. --approve records an approval for the paused step.",
    useCases: ["Continue after ecp run --to", "Continue after a policy pause"],
    examples: ["ecp runs resume <id>", "ecp runs resume <id> --approve"],
    cli: { args: ["run-id"] },
  })
  .withHandler(async (input, ctx) => {
    const parent = await loadParentRun(String(input["run-id"]))
    if (!parent.workflowPath) {
      throw new EcpCliError("ECP_INPUT_INVALID", "Journal has no workflow path", {
        exitCode: EXIT_USAGE,
      })
    }
    const { loaded, ecp, terminate } = await prepareWorkflowRun({
      workflowPath: parent.workflowPath,
      configFlag: input.config ? String(input.config) : undefined,
      config: ctx.config,
      argv: ctx.argv,
      json: ctx.json,
      host: ctx.host,
      install: true,
    })
    try {
      const extras = await runOptionsFromJournal({
        parent,
        workflow: loaded.manifest,
        toStepId: input.to ? String(input.to) : undefined,
        approve: Boolean(input.approve),
        mode: "resume",
      })
      const source = await readFile(parent.workflowPath, "utf8")
      const result = await ecp.run(loaded.manifest, {
        ...extras,
        journal: {
          workflowPath: parent.workflowPath,
          workflowHash: hashWorkflowSource(source),
          pluginVersions: pluginVersions(ctx.config),
          environmentId: NODE_ENVIRONMENT_ID,
          parentRunId: parent.runId,
          resumedFrom: parent.runId,
        },
      })
      return throwIfRunFailed(result)
    } catch (err) {
      asCli(err)
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp runs rerun`. @category CLI */
export const runsRerunOperation = defineOperation("runs:rerun")
  .withInput(
    z.object({
      "run-id": z.string(),
      config: z.string().optional().describe(CONFIG_FLAG_HELP),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Rerun from a step using the current workflow file",
    description:
      "Restores steps before --from from the journal. Default --from is the first failed step. Default --to is the end.",
    useCases: ["Fix a step and rerun from there"],
    examples: ["ecp runs rerun <id> --from web", "ecp runs rerun <id> --from a --to a"],
    cli: { args: ["run-id"] },
  })
  .withHandler(async (input, ctx) => {
    const parent = await loadParentRun(String(input["run-id"]))
    if (!parent.workflowPath) {
      throw new EcpCliError("ECP_INPUT_INVALID", "Journal has no workflow path", {
        exitCode: EXIT_USAGE,
      })
    }
    const { loaded, ecp, terminate } = await prepareWorkflowRun({
      workflowPath: parent.workflowPath,
      configFlag: input.config ? String(input.config) : undefined,
      config: ctx.config,
      argv: ctx.argv,
      json: ctx.json,
      host: ctx.host,
      install: true,
    })
    try {
      const extras = await runOptionsFromJournal({
        parent,
        workflow: loaded.manifest,
        fromStepId: input.from ? String(input.from) : undefined,
        toStepId: input.to ? String(input.to) : undefined,
        mode: "rerun",
      })
      const source = await readFile(parent.workflowPath, "utf8")
      const result = await ecp.run(loaded.manifest, {
        ...extras,
        journal: {
          workflowPath: parent.workflowPath,
          workflowHash: hashWorkflowSource(source),
          pluginVersions: pluginVersions(ctx.config),
          environmentId: NODE_ENVIRONMENT_ID,
          parentRunId: parent.runId,
        },
      })
      return throwIfRunFailed(result)
    } catch (err) {
      asCli(err)
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()
