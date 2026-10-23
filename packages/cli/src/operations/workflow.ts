import { z } from "zod"
import { readFile, writeFile } from "node:fs/promises"
import { compileWorkflowSource, loadWorkflowFile } from "@executioncontrolprotocol/node"
import {
  defineOperation,
  EcpCliError,
  EXIT_FAILED,
  EXIT_USAGE,
} from "@executioncontrolprotocol/plugin-sdk"
import { readJsonFile } from "../lib/command-helpers.js"
import { applyFormat } from "../lib/format-output.js"
import { ecpFromEnvFlag, terminateIfNeeded } from "../lib/load-ecp.js"

/** `ecp run`. @category CLI */
export const runOperation = defineOperation("run")
  .withInput(
    z.object({
      "workflow-path": z.string(),
      env: z.string(),
      input: z.string().optional(),
      "dry-run": z.boolean().optional(),
    })
  )
  .withMetadata({
    summary: "Run a workflow",
    description: "Compile (if needed) and execute a workflow using the runtime and extensions from --env.",
    useCases: ["Execute a workflow file against a local environment module"],
    examples: [
      "ecp run examples/01-echo/workflow.ts --env examples/01-echo/environment.ts",
    ],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(String(input.env), ctx.host)
    try {
      const workflowInput = input.input
        ? await readJsonFile<Record<string, unknown>>(String(input.input), "--input")
        : undefined
      const workflow = await loadWorkflowFile(String(input["workflow-path"]))
      const result = await ecp.run(workflow, {
        input: workflowInput,
        dryRun: Boolean(input["dry-run"]),
      })
      if (result.run.status !== "completed") {
        throw new EcpCliError(
          "ECP_STEP_FAILED",
          `Workflow run did not complete (status: ${result.run.status})`,
          { exitCode: EXIT_FAILED }
        )
      }
      return result
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp validate`. @category CLI */
export const validateOperation = defineOperation("validate")
  .withInput(
    z.object({
      "workflow-path": z.string(),
      env: z.string(),
    })
  )
  .withMetadata({
    summary: "Validate a workflow manifest",
    description:
      "Compile (if needed) and validate a workflow against the extensions and policies in --env.",
    useCases: ["Check a workflow before running it"],
    examples: ["ecp validate examples/01-echo/workflow.ts --env examples/01-echo/environment.ts"],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(String(input.env), ctx.host)
    try {
      const workflow = await loadWorkflowFile(String(input["workflow-path"]))
      const result = await ecp.validate(workflow)
      if (!result.valid) {
        throw new EcpCliError("ECP_INPUT_INVALID", "Workflow is not valid", {
          exitCode: EXIT_FAILED,
        })
      }
      return result
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp compile`. @category CLI */
export const compileOperation = defineOperation("compile")
  .withInput(
    z.object({
      "workflow-path": z.string(),
      output: z.string().optional(),
      format: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Compile a workflow to JSON",
    description:
      "Bundle and evaluate a workflow module (.ts or .js), or load .json, and emit the workflow manifest.",
    useCases: ["Produce a portable workflow manifest for review"],
    examples: ["ecp compile examples/01-echo/workflow.ts"],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input, ctx) => {
    const filename = String(input["workflow-path"])
    const source = await readFile(filename, "utf8")
    const result = await compileWorkflowSource({ source, filename })
    if (!result.ok) {
      throw new EcpCliError("ECP_WORKFLOW_LOAD", "Workflow failed to compile", {
        exitCode: EXIT_USAGE,
      })
    }
    let payload: unknown = result.manifest
    if (input.format && ctx.host) {
      payload = await applyFormat(ctx.host.ecp, result.manifest, String(input.format))
    }
    if (input.output) {
      const text = typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`
      await writeFile(String(input.output), text.endsWith("\n") ? text : `${text}\n`, "utf8")
      return undefined
    }
    return payload
  })
  .build()
