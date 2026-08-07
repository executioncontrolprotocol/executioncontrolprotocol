import type { HarnessId } from "@executioncontrolprotocol/types"
import { ECP_MODEL_GENERATE_INTERFACE } from "@executioncontrolprotocol/types"
import type { z } from "zod"
import type { HarnessCapabilityContext } from "./context.js"

/** Infer harness invoke input type from a Zod schema. @category Harness */
export type HarnessInputOf<S extends z.ZodType> = z.infer<S>

/** Infer harness environment config type from a Zod schema. @category Harness */
export type HarnessConfigOf<S extends z.ZodType> = z.infer<S>

/** Infer harness invoke output type from a Zod schema. @category Harness */
export type HarnessOutputOf<S extends z.ZodType> = z.infer<S>

/** Typed harness evaluate handler. @category Harness */
export type HarnessHandler<
  TInput = unknown,
  TOutput = unknown,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> = (
  input: TInput,
  ctx: HarnessCapabilityContext<TConfig>
) => Promise<TOutput>

/** Erased handler stored on catalog definitions. @category Harness */
export type ErasedHarnessHandler = HarnessHandler<unknown, unknown, Record<string, unknown>>

/** Registered harness definition. @category Harness */
export interface HarnessDefinition {
  /** Harness id (e.g. `@executioncontrolprotocol/evals-workflow-authoring`). */
  id: HarnessId
  /** Namespace segment. */
  namespace: string
  /** Short name segment. */
  name: string
  /** Environment binding config schema. */
  configSchema?: z.ZodType
  /** Invoke input schema. */
  inputSchema?: z.ZodType
  /** Invoke output schema. */
  outputSchema?: z.ZodType
  /** Required provider interface tag. */
  providerInterface: typeof ECP_MODEL_GENERATE_INTERFACE
  /** Harness implementation. */
  handler: ErasedHarnessHandler
}
