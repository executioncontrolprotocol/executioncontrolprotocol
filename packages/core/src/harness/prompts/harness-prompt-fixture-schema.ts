import { z } from "zod"

/** Few-shot row in a harness prompt fixture. @category Harness */
export const harnessPromptFewShotSchema = z.object({
  message: z.string(),
  /** EQL body (string) or legacy JSON object. */
  output: z.union([z.record(z.string(), z.unknown()), z.string()]),
})

/** Intent definition row in a harness prompt fixture. @category Harness */
export const harnessPromptDefinitionSchema = z.object({
  intent: z.string(),
  when: z.string(),
})

/** Harness prompt fixture file shape. @category Harness */
export const harnessPromptFixtureSchema = z.object({
  id: z.string(),
  role: z.string(),
  task: z.string(),
  outputSchema: z.string(),
  /** Prompt surface for model output examples (default eql). */
  promptFormat: z.enum(["eql", "json", "typescript"]).optional().default("eql"),
  allowedValues: z.record(z.string(), z.array(z.string())).optional(),
  definitions: z.array(harnessPromptDefinitionSchema).optional(),
  fewShots: z.array(harnessPromptFewShotSchema).optional(),
  repairHint: z.string().optional(),
  /** When true, prepend {@link ECP_ASSISTANT_IDENTITY_PRIMER} to the system prompt. */
  identity: z.boolean().optional(),
})

/** Parsed harness prompt fixture. @category Harness */
export type HarnessPromptFixture = z.infer<typeof harnessPromptFixtureSchema>
