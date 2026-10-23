import { z } from "zod"
import { readFile, writeFile } from "node:fs/promises"
import { compileWorkflowSource } from "@executioncontrolprotocol/node"
import {
  defineOperation,
  EcpCliError,
  ECP_INPUT_INVALID,
  ECP_WORKFLOW_LOAD,
  EXIT_USAGE,
} from "@executioncontrolprotocol/plugin-sdk"
import { readJsonFile } from "../lib/command-helpers.js"
import { applyFormat } from "../lib/format-output.js"
import { prepareWorkflowRun, throwIfRunFailed } from "../lib/prepare-workflow.js"
import { terminateIfNeeded } from "../lib/load-ecp.js"

/** `ecp run`. @category CLI */
export const runOperation = defineOperation("run")
  .withInput(
    z.object({
      "workflow-path": z.string(),
      env: z.string().optional(),
      input: z.string().optional(),
      "dry-run": z.boolean().optional(),
    })
  )
  .withMetadata({
    summary: "Run a workflow file",
    description:
      "Compile (if needed) and execute a workflow. --env is an optional environment file overlay; omit it to use the process host.",
    useCases: ["Execute a single-file workflow"],
    examples: ["ecp run examples/01-echo/workflow.ecp.ts", "ecp run brief.ecp.ts --env team.ecp.ts"],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input, ctx) => {
    const { loaded, ecp, terminate } = await prepareWorkflowRun({
      workflowPath: String(input["workflow-path"]),
      envFlag: input.env ? String(input.env) : undefined,
      config: ctx.config,
      argv: ctx.argv,
      json: ctx.json,
      host: ctx.host,
      install: true,
    })
    try {
      const workflowInput = input.input
        ? await readJsonFile<Record<string, unknown>>(String(input.input), "--input")
        : undefined
      const result = await ecp.run(loaded.manifest, {
        input: workflowInput,
        dryRun: Boolean(input["dry-run"]),
      })
      return throwIfRunFailed(result)
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
      env: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Validate a workflow file",
    description:
      "Compile (if needed) and validate a workflow against the process host, an optional --env file, and the workflow's bindings. Never installs plugins.",
    useCases: ["Check a workflow before running it"],
    examples: ["ecp validate examples/01-echo/workflow.ecp.ts"],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input, ctx) => {
    const { loaded, ecp, terminate } = await prepareWorkflowRun({
      workflowPath: String(input["workflow-path"]),
      envFlag: input.env ? String(input.env) : undefined,
      config: ctx.config,
      argv: ctx.argv,
      json: ctx.json,
      host: ctx.host,
      install: false,
    })
    try {
      const result = await ecp.validate(loaded.manifest)
      if (!result.valid) {
        throw new EcpCliError(ECP_INPUT_INVALID, "Workflow is not valid", {
          exitCode: EXIT_USAGE,
          details: result.errors,
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
    examples: ["ecp compile examples/01-echo/workflow.ecp.ts"],
    cli: { args: ["workflow-path"] },
  })
  .withHandler(async (input, ctx) => {
    const filename = String(input["workflow-path"])
    const source = await readFile(filename, "utf8")
    const result = await compileWorkflowSource({ source, filename })
    if (!result.ok) {
      throw new EcpCliError(
        ECP_WORKFLOW_LOAD,
        result.compileErrors?.[0]?.message ?? "Workflow failed to compile",
        { exitCode: EXIT_USAGE }
      )
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
