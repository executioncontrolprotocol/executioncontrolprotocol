import { z } from "zod"
import { defineOperation } from "@executioncontrolprotocol/plugin-sdk"
import { prepareWorkflowRun } from "../lib/prepare-workflow.js"
import { terminateIfNeeded } from "../lib/load-ecp.js"

/** `ecp workflows install`. @category CLI */
export const installOperation = defineOperation("workflows:install")
  .withInput(
    z.object({
      "workflow-path": z.string(),
      env: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Install plugins a workflow file requires",
    description:
      "Infer required plugins from the workflow file and install them without running the workflow.",
    useCases: ["Prepare a machine to run a workflow file"],
    examples: ["ecp workflows install brief.ecp.ts", "ecp workflows install brief.ecp.ts --yes"],
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
    await terminateIfNeeded(ecp, terminate)
    return {
      requirements: loaded.requirements.requirements,
    }
  })
  .build()
