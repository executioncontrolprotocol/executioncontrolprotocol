import { z } from "zod"

/** Input for {@link "@executioncontrolprotocol/jsonata.transform"}. @category Extensions */
export const jsonataTransformInputSchema = z.object({
  /** JSONata expression (agent-authored). */
  expression: z.string().min(1),
  /** Document to evaluate against (literal or ref-resolved). */
  payload: z.unknown(),
  /** Optional named bindings assigned before evaluation (reference as `$name` in the expression). */
  bindings: z.record(z.string(), z.unknown()).optional(),
})

/** Output for {@link "@executioncontrolprotocol/jsonata.transform"}. @category Extensions */
export const jsonataTransformOutputSchema = z.object({
  /** Evaluation result (any JSON-compatible value). */
  result: z.unknown(),
})

/** Inferred input type for jsonata.transform. @category Extensions */
export type JsonataTransformInput = z.infer<typeof jsonataTransformInputSchema>

/** Inferred output type for jsonata.transform. @category Extensions */
export type JsonataTransformOutput = z.infer<typeof jsonataTransformOutputSchema>
