import { z } from "zod"
import type { RunResult } from "./run.js"
import type { WorkflowManifest } from "./workflow.js"

/** Zod mirror of per-step run history (eval fixtures). @category Harness */
export const stepRunRecordSchema = z.object({
  status: z.string(),
  output: z.unknown().optional(),
  committedAs: z.string().nullable().optional(),
  attempts: z.number().optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
  mutations: z.array(z.record(z.string(), z.unknown())).optional(),
})

/** Zod mirror of run result document (eval fixtures). @category Harness */
export const runResultSchema = z.object({
  schema: z.literal("@executioncontrolprotocol.run.result"),
  version: z.string(),
  run: z.object({
    id: z.string(),
    status: z.string(),
  }),
  state: z.record(z.string(), z.unknown()).optional(),
  history: z.record(z.string(), stepRunRecordSchema).optional(),
  usage: z.record(z.string(), z.unknown()).optional(),
})

/** Snapshot passed into harnesses for run-aware assistance. @category Harness */
export interface HarnessRunContext {
  /** Result from ecp.run() or equivalent. */
  run: RunResult
  /** Workflow manifest when the run was started (optional but recommended). */
  workflow?: WorkflowManifest
}

/** Zod schema for {@link HarnessRunContext}. @category Harness */
export const harnessRunContextSchema = z.object({
  run: runResultSchema,
  workflow: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Build harness run context from a live run (single adapter for runtime + eval loaders).
 * @category Harness
 */
export function toHarnessRunContext(
  run: RunResult,
  workflow?: WorkflowManifest
): HarnessRunContext {
  return workflow !== undefined ? { run, workflow } : { run }
}
