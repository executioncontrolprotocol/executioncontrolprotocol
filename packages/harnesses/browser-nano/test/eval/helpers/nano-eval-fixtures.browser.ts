import { createBrowserEvalFixturesLoader } from "@executioncontrolprotocol/evals"
import type { EvalCase } from "@executioncontrolprotocol/evals"
import type { WorkflowManifest } from "@executioncontrolprotocol/types"

const caseModules = import.meta.glob("../../../fixtures/eval-cases/*.cases.json", {
  eager: true,
  import: "default",
}) as Record<string, EvalCase[] | { cases: EvalCase[] }>

const workflowModules = import.meta.glob("../../../fixtures/workflows/*.json", {
  eager: true,
  import: "default",
}) as Record<string, WorkflowManifest>

const runModules = import.meta.glob("../../../fixtures/runs/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>

/** Browser eval fixture loader for Browser Nano harness-owned fixtures. */
export const nanoBrowserEvalFixturesLoader = createBrowserEvalFixturesLoader({
  caseModules,
  workflowModules,
  runModules,
})

/** Load Browser Nano eval cases from the browser bundle. */
export const loadNanoEvalCasesBrowser = nanoBrowserEvalFixturesLoader.loadEvalCases
