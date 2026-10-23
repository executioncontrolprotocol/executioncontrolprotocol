import { z } from "zod"
import type { DescribeQuery } from "@executioncontrolprotocol/core/types"
import {
  defineOperation,
  EcpCliError,
  EXIT_FAILED,
} from "@executioncontrolprotocol/plugin-sdk"
import { readJsonFile } from "../lib/command-helpers.js"
import { applyFormat } from "../lib/format-output.js"
import { ecpFromEnvFlag, terminateIfNeeded } from "../lib/load-ecp.js"

/** `ecp describe`. @category CLI */
export const describeOperation = defineOperation("describe")
  .withInput(
    z.object({
      env: z.string().optional(),
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
      "Return a structured catalog of extensions, capabilities, and policies. Pass --env to load an environment module; otherwise use installed plugins.",
    useCases: ["List installed capabilities", "Inspect one capability by exact id"],
    examples: ["ecp describe --env examples/01-echo/environment.ts"],
    cli: { args: ["id"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(
      input.env ? String(input.env) : undefined,
      ctx.host
    )
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

/** `ecp search`. @category CLI */
export const searchOperation = defineOperation("search")
  .withInput(
    z.object({
      query: z.string(),
      env: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Search environment capabilities",
    description: "Fuzzy-match capabilities by id or label. Quote multi-word queries.",
    useCases: ["Find a capability for an intent"],
    examples: ['ecp search "echo" --env examples/01-echo/environment.ts'],
    cli: { args: ["query"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(
      input.env ? String(input.env) : undefined,
      ctx.host
    )
    try {
      return await ecp.search(String(input.query))
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()

/** `ecp invoke`. @category CLI */
export const invokeOperation = defineOperation("invoke")
  .withInput(
    z.object({
      "capability-id": z.string(),
      env: z.string().optional(),
      input: z.string().optional(),
    })
  )
  .withMetadata({
    summary: "Invoke a capability",
    description:
      "Call a registered capability by id without running a workflow. Prints an InvokeResult JSON document.",
    useCases: ["Smoke-test a capability outside a workflow"],
    examples: [
      "ecp invoke @executioncontrolprotocol/test.echo --env examples/01-echo/environment.ts --input input.json",
    ],
    cli: { args: ["capability-id"] },
  })
  .withHandler(async (input, ctx) => {
    const { ecp, terminate } = await ecpFromEnvFlag(
      input.env ? String(input.env) : undefined,
      ctx.host
    )
    try {
      const payload = input.input ? await readJsonFile(String(input.input), "--input") : {}
      const result = await ecp.invoke(String(input["capability-id"])).with(payload).process()
      if (!result.success) {
        throw new EcpCliError(
          result.diagnostics[0]?.code ?? "INVOKE_FAILED",
          result.diagnostics[0]?.message ?? "Capability invoke did not succeed",
          { exitCode: EXIT_FAILED }
        )
      }
      return result
    } finally {
      await terminateIfNeeded(ecp, terminate)
    }
  })
  .build()
