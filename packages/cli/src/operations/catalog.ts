import { z } from "zod"
import type { DescribeQuery } from "@executioncontrolprotocol/core/types"
import {
  defineOperation,
  EcpCliError,
  ECP_STEP_FAILED,
  EXIT_FAILED,
} from "@executioncontrolprotocol/plugin-sdk"
import { readJsonFile } from "../lib/command-helpers.js"
import { applyFormat } from "../lib/format-output.js"
import { CONFIG_FLAG_HELP } from "../lib/config-file.js"
import { ecpFromConfigFlag, terminateIfNeeded } from "../lib/load-ecp.js"

/** `ecp environments describe`. @category CLI */
export const describeOperation = defineOperation("environments:describe")
  .withInput(
    z.object({
      config: z.string().optional().describe(CONFIG_FLAG_HELP),
      query: z.string().optional(),
      capability: z.string().optional(),
      extension: z.string().optional(),
      policies: z.boolean().optional(),
      format: z.string().optional(),
      id: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Describe an environment",
    description:
      "Return a structured catalog of extensions, capabilities, and policies. Pass --config for machine settings; otherwise use installed plugins.",
    useCases: ["List installed capabilities", "Inspect one capability by exact id"],
    examples: ["ecp environments describe"],
    cli: { args: ["id"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromConfigFlag({
      configFlag: input.config ? String(input.config) : undefined,
      host: ctx.host,
      config: ctx.config,
    })
    try {
      let query = input.query
        ? await readJsonFile<DescribeQuery>(String(input.query), "--query")
        : undefined
      const capability = input.capability ? String(input.capability) : input.id ? String(input.id) : undefined
      const extension = input.extension ? String(input.extension) : undefined
      if (capability || extension) {
        query = {
          ...(query ?? {}),
          ...(capability
            ? { capabilities: { ...(query?.capabilities ?? {}), match: capability, mode: "exact" as const } }
            : {}),
          ...(extension
            ? { extensions: { ...(query?.extensions ?? {}), match: extension, mode: "exact" as const } }
            : {}),
        }
      }
      let descriptor = await ecp.describe(query)
      if (input.policies) {
        descriptor = { ...descriptor, policies: descriptor.policies }
      }
      return applyFormat(ecp, descriptor, input.format ? String(input.format) : undefined)
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp environments search`. @category CLI */
export const searchOperation = defineOperation("environments:search")
  .withInput(
    z.object({
      query: z.string(),
      config: z.string().optional().describe(CONFIG_FLAG_HELP),
    })
  )
  .withMetadata({
    summary: "Search environment capabilities",
    description: "Fuzzy-match capabilities by id or label. Quote multi-word queries.",
    useCases: ["Find a capability for an intent"],
    examples: ['ecp environments search "echo"'],
    cli: { args: ["query"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromConfigFlag({
      configFlag: input.config ? String(input.config) : undefined,
      host: ctx.host,
      config: ctx.config,
    })
    try {
      return await ecp.search(String(input.query))
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp environments invoke`. @category CLI */
export const invokeOperation = defineOperation("environments:invoke")
  .withInput(
    z.object({
      "capability-id": z.string(),
      config: z.string().optional().describe(CONFIG_FLAG_HELP),
      input: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Invoke a capability",
    description:
      "Call a registered capability by id without running a workflow. Prints an InvokeResult JSON document.",
    useCases: ["Smoke-test a capability outside a workflow"],
    examples: [
      "ecp plugins link plugins/plugin-test",
      "ecp environments invoke @executioncontrolprotocol/test.echo --input input.json",
    ],
    cli: { args: ["capability-id"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromConfigFlag({
      configFlag: input.config ? String(input.config) : undefined,
      host: ctx.host,
      config: ctx.config,
    })
    try {
      const payload = input.input ? await readJsonFile(String(input.input), "--input") : {}
      const capabilityId = String(input["capability-id"])
      const result = await ecp.invoke(capabilityId).with(payload).process()
      const runId =
        (await ctx.host?.recordInvoke?.({
          capabilityId,
          input: payload,
          result: result.result,
          success: result.success,
          diagnostics: result.diagnostics,
        })) ?? ""
      const record = {
        runId,
        stepId: "invoke",
        capabilityId,
        status: result.success ? "completed" : "failed",
        output: result.result,
        diagnostics: result.diagnostics,
      }
      if (!result.success) {
        throw new EcpCliError(
          result.diagnostics[0]?.code ?? ECP_STEP_FAILED,
          result.diagnostics[0]?.message ?? "Capability invoke did not succeed",
          { exitCode: EXIT_FAILED, data: record }
        )
      }
      return ctx.json ? result : record
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()
