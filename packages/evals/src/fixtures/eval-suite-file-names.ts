import { EVAL_SUITE_VALUES, type EvalSuite } from "./eval-case-schema.js"

/** Suite file name helper. @category Evals */
export const EVAL_SUITE_FILE_NAMES: Record<EvalSuite, string> = {
  [EVAL_SUITE_VALUES.WORKFLOW_CREATE]: "workflow-create.cases.json",
  [EVAL_SUITE_VALUES.WORKFLOW_PATCH]: "workflow-patch.cases.json",
  [EVAL_SUITE_VALUES.INTENT]: "intent.cases.json",
  [EVAL_SUITE_VALUES.ASSISTANT]: "assistant.cases.json",
  [EVAL_SUITE_VALUES.FLOW]: "flow.cases.json",
  [EVAL_SUITE_VALUES.CHAT]: "chat.cases.json",
}
