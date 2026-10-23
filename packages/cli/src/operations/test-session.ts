import { z } from "zod"
import { defineOperation } from "@executioncontrolprotocol/plugin-sdk"
import { readJsonFile } from "../lib/command-helpers.js"
import { ecpFromEnvFlag, terminateIfNeeded } from "../lib/load-ecp.js"
import { loadWorkflowFile } from "@executioncontrolprotocol/node"
import { readTestSessionFile, writeTestSessionFile } from "../lib/test-session-io.js"

/** `ecp test` topic help. @category CLI */
export const testTopicOperation = defineOperation("test")
  .withInput(z.object({}))
  .withMetadata({
    summary: "Test a workflow with a persistent session",
    description:
      "Create and drive a test session that freezes workflow state between operations.\n\nSubcommands: start, run, rerun, status.",
    useCases: ["Step a workflow with frozen state until Phase 4 run journals replace this"],
  })
  .withHandler(async () => {
    return [
      "Usage: ecp test <subcommand>",
      "",
      "  start WORKFLOW-PATH  Create a session (-o session.json)",
      "  run --to STEP-ID     Inclusive run through a step",
      "  rerun STEP-ID        Rerun one step; clear downstream",
      "  status               Show session snapshot summary",
      "",
      "Run ecp test <cmd> --help for flags.",
    ].join("\n")
  })
  .build()

/** `ecp test start`. @category CLI */
export const testStartOperation = defineOperation("test:start")
  .withInput(
    z.object({
      "workflow-path": z.string(),
      env: z.string(),
      input: z.string().optional(),
      output: z.string(),
    })
  )
  .withMetadata({
    summary: "Start a workflow test session",
    description: "Create an idle test session snapshot for a workflow.",
    useCases: ["Begin a stepped test session"],
    examples: [
      "ecp test start examples/01-echo/workflow.ts --env examples/01-echo/environment.ts -o session.json",
    ],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(String(input.env), ctx.host)
    try {
      const workflowInput = input.input
        ? await readJsonFile<Record<string, unknown>>(String(input.input), "--input")
        : {}
      const workflow = await loadWorkflowFile(String(input["workflow-path"]))
      const session = await ecp.test(workflow).with({ input: workflowInput }).start()
      const snap = session.snapshot()
      await writeTestSessionFile(String(input.output), snap)
      return snap
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp test run`. @category CLI */
export const testRunOperation = defineOperation("test:run")
  .withInput(
    z.object({
      env: z.string(),
      to: z.string(),
      session: z.string(),
    })
  )
  .withMetadata({
    summary: "Run a test session through a step",
    description: "Inclusively execute through --to <step-id> and rewrite --session.",
    useCases: ["Advance a test session to a step"],
    examples: ["ecp test run --to echo --env examples/01-echo/environment.ts --session session.json"],
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(String(input.env), ctx.host)
    try {
      const snap = await readTestSessionFile(String(input.session))
      const session = await ecp.restoreTestSession(snap)
      const next = await session.runTo(String(input.to))
      await writeTestSessionFile(String(input.session), next)
      return next
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp test rerun`. @category CLI */
export const testRerunOperation = defineOperation("test:rerun")
  .withInput(
    z.object({
      "step-id": z.string(),
      env: z.string(),
      session: z.string(),
    })
  )
  .withMetadata({
    summary: "Rerun one step in a test session",
    description: "Execute a single step against frozen prior state and clear downstream history.",
    useCases: ["Replay one step after changing its input"],
    examples: ["ecp test rerun echo --env examples/01-echo/environment.ts --session session.json"],
    cli: { args: ["step-id"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(String(input.env), ctx.host)
    try {
      const snap = await readTestSessionFile(String(input.session))
      const session = await ecp.restoreTestSession(snap)
      const next = await session.rerun(String(input["step-id"]))
      await writeTestSessionFile(String(input.session), next)
      return next
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp test status`. @category CLI */
export const testStatusOperation = defineOperation("test:status")
  .withInput(z.object({ session: z.string() }))
  .withMetadata({
    summary: "Show test session status",
    description: "Print the test session snapshot (status, cursor, state keys, history).",
    useCases: ["Inspect a session file"],
    examples: ["ecp test status --session session.json"],
  })
  .withHandler(async (input) => readTestSessionFile(String(input.session)))
  .build()
