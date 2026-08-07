/**
 * Shared harness binding config for `@executioncontrolprotocol/evals` (trace + context).
 * Matrix task configs live in `@executioncontrolprotocol/harnesses-browser-nano` (via harness-bindings).
 * @category Evals
 */
import {
  HARNESS_NANO_REPAIR,
  HARNESS_TASKS,
  HARNESS_NANO_TRACE,
  HARNESS_NANO_BINDING,
  getHarnessNanoConfig,
} from "./harness-bindings.js"

export {
  HARNESS_NANO_REPAIR,
  HARNESS_NANO_TRACE,
  HARNESS_TASKS,
  HARNESS_NANO_BINDING,
  getHarnessNanoConfig,
}

/**
 * Intent classification harness config aligned with {@link INTENT_EVAL_EXTENSIONS}.
 * @category Evals
 */
export const INTENT_EVAL_HARNESS_CONFIG = getHarnessNanoConfig(
  HARNESS_TASKS.INTENT_CLASSIFICATION
)

/**
 * Workflow authoring harness config aligned with {@link WORKFLOW_EVAL_EXTENSIONS}.
 * @category Evals
 */
export const WORKFLOW_EVAL_HARNESS_CONFIG = getHarnessNanoConfig(
  HARNESS_TASKS.WORKFLOW_AUTHORING
)

/** Extension ids bound in workflow eval environments. @category Evals */
export const WORKFLOW_EVAL_EXTENSIONS = ["@executioncontrolprotocol/format-toon", "@executioncontrolprotocol/format-eql", "@executioncontrolprotocol/test"] as const

/** Extension ids bound in intent eval environments (same ops surface as workflow). @category Evals */
export const INTENT_EVAL_EXTENSIONS = ["@executioncontrolprotocol/format-toon", "@executioncontrolprotocol/format-eql", "@executioncontrolprotocol/test"] as const

/** Extension ids bound in Ollama matrix eval environments (binding order). @category Evals */
export const MATRIX_EVAL_EXTENSION_IDS = [
  "@executioncontrolprotocol/format-toon",
  "@executioncontrolprotocol/format-eql",
  "@executioncontrolprotocol/format-json",
  "@executioncontrolprotocol/test",
] as const

/** Intent harness config for matrix environment. @category Evals */
export const MATRIX_INTENT_HARNESS_CONFIG = getHarnessNanoConfig(
  HARNESS_TASKS.INTENT_CLASSIFICATION
)

/** Workflow harness config for matrix environment. @category Evals */
export const MATRIX_EVAL_HARNESS_CONFIG = getHarnessNanoConfig(
  HARNESS_TASKS.WORKFLOW_AUTHORING
)

/** Assistant harness config for matrix environment. @category Evals */
export const MATRIX_ASSISTANT_HARNESS_CONFIG = getHarnessNanoConfig(
  HARNESS_TASKS.WORKFLOW_ASSISTANT
)
