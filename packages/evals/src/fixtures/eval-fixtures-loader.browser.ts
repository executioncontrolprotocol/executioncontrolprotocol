import type { RunResult, WorkflowManifest } from "@executioncontrolprotocol/types"
import {
  harnessRunContextSchema,
  runResultSchema,
  toHarnessRunContext,
  type HarnessRunContext,
} from "@executioncontrolprotocol/types"
import { evalCaseSchema, type EvalCase, type SingleEvalCase } from "./eval-case-schema.js"
import type { LoadEvalCasesOptions } from "./load-eval-cases-options.js"

function globKeySuffix(path: string): string {
  const normalized = path.replace(/\\/g, "/")
  const fixturesIdx = normalized.indexOf("/fixtures/")
  return fixturesIdx >= 0 ? normalized.slice(fixturesIdx + "/fixtures/".length) : normalized
}

function parseCasesRaw(raw: unknown, fileLabel: string): EvalCase[] {
  const rows = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === "object" && "cases" in raw
      ? (raw as { cases: unknown[] }).cases
      : null
  if (!Array.isArray(rows)) {
    throw new Error(`${fileLabel}: expected a JSON array or { "cases": [...] }`)
  }
  return rows.map((row, index) => {
    const parsed = evalCaseSchema.safeParse(row)
    if (!parsed.success) {
      throw new Error(
        `${fileLabel}[${index}]: ${parsed.error.issues.map((i) => i.message).join("; ")}`
      )
    }
    return parsed.data
  })
}

function filterEvalCases(cases: EvalCase[], options: LoadEvalCasesOptions): EvalCase[] {
  let filtered = cases
  if (options.suite) {
    filtered = filtered.filter((c) => c.suite === options.suite)
  }
  if (options.excludeSkipped !== false) {
    filtered = filtered.filter((c) => !c.skip)
  }
  return filtered
}

/** Bundled browser eval fixture modules. @category Evals */
export interface BrowserEvalFixtureModules {
  caseModules: Record<string, EvalCase[] | { cases: EvalCase[] }>
  workflowModules: Record<string, WorkflowManifest>
  runModules: Record<string, unknown>
}

function workflowFixtureMap(modules: Record<string, WorkflowManifest>): Map<string, WorkflowManifest> {
  const map = new Map<string, WorkflowManifest>()
  for (const [key, value] of Object.entries(modules)) {
    map.set(globKeySuffix(key), value)
  }
  return map
}

function runFixtureMap(modules: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>()
  for (const [key, value] of Object.entries(modules)) {
    map.set(globKeySuffix(key), value)
  }
  return map
}

/**
 * Browser eval fixture loader bound to Vite-bundled fixture modules.
 * @category Evals
 */
export interface BrowserEvalFixturesLoader {
  loadEvalCases: (options?: LoadEvalCasesOptions) => EvalCase[]
  loadWorkflowFixture: (relativePath: string) => WorkflowManifest
  loadHarnessRunFixture: (relativePath: string) => HarnessRunContext
  resolveSingleEvalCaseInput: (caseRow: SingleEvalCase) => Record<string, unknown>
  countEvalCases: () => number
}

/**
 * Create a browser eval fixtures loader from bundled `import.meta.glob` modules.
 * @category Evals
 */
export function createBrowserEvalFixturesLoader(
  modules: BrowserEvalFixtureModules
): BrowserEvalFixturesLoader {
  const workflowFixtures = workflowFixtureMap(modules.workflowModules)
  const runFixtures = runFixtureMap(modules.runModules)

  const loadWorkflowFixture = (relativePath: string): WorkflowManifest => {
    const key = relativePath.startsWith("workflows/")
      ? relativePath
      : `workflows/${relativePath}`
    const manifest = workflowFixtures.get(key)
    if (!manifest) {
      throw new Error(`Workflow fixture not found: ${key}`)
    }
    return manifest
  }

  const loadHarnessRunFixture = (relativePath: string): HarnessRunContext => {
    const key = relativePath.startsWith("runs/") ? relativePath : `runs/${relativePath}`
    const raw = runFixtures.get(key)
    if (raw === undefined) {
      throw new Error(`Run fixture not found: ${key}`)
    }
    const asContext = harnessRunContextSchema.safeParse(raw)
    if (asContext.success) {
      return toHarnessRunContext(
        asContext.data.run as RunResult,
        asContext.data.workflow as WorkflowManifest | undefined
      )
    }
    const asRun = runResultSchema.safeParse(raw)
    if (asRun.success) {
      return toHarnessRunContext(asRun.data as RunResult)
    }
    throw new Error(`${key}: expected HarnessRunContext or @executioncontrolprotocol.run.result document`)
  }

  const resolveEvalInvokeInput = (input: Record<string, unknown>): Record<string, unknown> => {
    const resolved = { ...input }
    const manifestRef = resolved.manifestRef
    if (typeof manifestRef === "string") {
      resolved.manifest = loadWorkflowFixture(manifestRef)
      delete resolved.manifestRef
    }
    const runContextFixture = resolved.runContextFixture
    if (typeof runContextFixture === "string") {
      resolved.runContext = loadHarnessRunFixture(runContextFixture)
      delete resolved.runContextFixture
    }
    return resolved
  }

  return {
    loadEvalCases: (options = {}) => {
      let cases: EvalCase[] = []
      for (const [filePath, raw] of Object.entries(modules.caseModules)) {
        cases = cases.concat(parseCasesRaw(raw, globKeySuffix(filePath)))
      }
      cases.sort((a, b) => a.id.localeCompare(b.id))
      return filterEvalCases(cases, options)
    },
    loadWorkflowFixture,
    loadHarnessRunFixture,
    resolveSingleEvalCaseInput: (caseRow) => {
      const input = resolveEvalInvokeInput(caseRow.input)
      if (caseRow.baselineWorkflow) {
        input.manifest = loadWorkflowFixture(caseRow.baselineWorkflow)
      }
      return input
    },
    countEvalCases: () => {
      let cases: EvalCase[] = []
      for (const [filePath, raw] of Object.entries(modules.caseModules)) {
        cases = cases.concat(parseCasesRaw(raw, globKeySuffix(filePath)))
      }
      return filterEvalCases(cases, { excludeSkipped: true }).length
    },
  }
}
