import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import type { RunResult, WorkflowManifest } from "@executioncontrolprotocol/types"
import {
  harnessRunContextSchema,
  runResultSchema,
  toHarnessRunContext,
  type HarnessRunContext,
} from "@executioncontrolprotocol/types"
import { evalCaseSchema, type EvalCase, type SingleEvalCase } from "./eval-case-schema.js"
import type { LoadEvalCasesOptions } from "./load-eval-cases-options.js"

const CASE_FILE_SUFFIX = ".cases.json"

function parseCasesFile(filePath: string): EvalCase[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as unknown
  const rows = Array.isArray(raw)
    ? raw
    : raw !== null && typeof raw === "object" && "cases" in raw
      ? (raw as { cases: unknown[] }).cases
      : null
  if (!Array.isArray(rows)) {
    throw new Error(`${filePath}: expected a JSON array or { "cases": [...] }`)
  }
  return rows.map((row, index) => {
    const parsed = evalCaseSchema.safeParse(row)
    if (!parsed.success) {
      throw new Error(
        `${filePath}[${index}]: ${parsed.error.issues.map((i) => i.message).join("; ")}`
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

/**
 * Load eval cases from a directory of `*.cases.json` files.
 * @category Evals
 */
export function loadEvalCasesFromDir(
  casesDir: string,
  options: LoadEvalCasesOptions = {}
): EvalCase[] {
  const files = readdirSync(casesDir)
    .filter((name) => name.endsWith(CASE_FILE_SUFFIX))
    .sort()

  let cases: EvalCase[] = []
  for (const file of files) {
    cases = cases.concat(parseCasesFile(path.join(casesDir, file)))
  }
  return filterEvalCases(cases, options)
}

/**
 * Resolve a path under an eval fixtures root (`workflows/`, `runs/`, etc.).
 * @category Evals
 */
export function resolveEvalFixturePathUnderRoot(
  fixturesRoot: string,
  relativePath: string
): string {
  return path.join(fixturesRoot, relativePath.replace(/^\//, ""))
}

/**
 * Load a workflow manifest fixture relative to a fixtures root.
 * @category Evals
 */
export function loadWorkflowFixtureFromRoot(
  fixturesRoot: string,
  relativePath: string
): WorkflowManifest {
  const full = resolveEvalFixturePathUnderRoot(
    fixturesRoot,
    relativePath.startsWith("workflows/") ? relativePath : `workflows/${relativePath}`
  )
  return JSON.parse(readFileSync(full, "utf8")) as WorkflowManifest
}

/**
 * Load run context from a fixtures root.
 * @category Evals
 */
export function loadHarnessRunFixtureFromRoot(
  fixturesRoot: string,
  relativePath: string
): HarnessRunContext {
  const full = resolveEvalFixturePathUnderRoot(
    fixturesRoot,
    relativePath.startsWith("runs/") ? relativePath : `runs/${relativePath}`
  )
  const raw = JSON.parse(readFileSync(full, "utf8")) as unknown
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
  throw new Error(`${full}: expected HarnessRunContext or @executioncontrolprotocol.run.result document`)
}

/**
 * Resolve manifest/run fixture refs in harness invoke input.
 * @category Evals
 */
export function resolveEvalInvokeInputFromRoot(
  fixturesRoot: string,
  input: Record<string, unknown>
): Record<string, unknown> {
  const resolved = { ...input }
  const manifestRef = resolved.manifestRef
  if (typeof manifestRef === "string") {
    resolved.manifest = loadWorkflowFixtureFromRoot(fixturesRoot, manifestRef)
    delete resolved.manifestRef
  }
  const runContextFixture = resolved.runContextFixture
  if (typeof runContextFixture === "string") {
    resolved.runContext = loadHarnessRunFixtureFromRoot(fixturesRoot, runContextFixture)
    delete resolved.runContextFixture
  }
  return resolved
}

/**
 * Resolve invoke input for a single eval case (manifest/run fixture refs).
 * @category Evals
 */
export function resolveSingleEvalCaseInputFromRoot(
  fixturesRoot: string,
  caseRow: SingleEvalCase
): Record<string, unknown> {
  const input = resolveEvalInvokeInputFromRoot(fixturesRoot, caseRow.input)
  if (caseRow.baselineWorkflow) {
    input.manifest = loadWorkflowFixtureFromRoot(fixturesRoot, caseRow.baselineWorkflow)
  }
  return input
}

/** Paths for eval fixture directories on disk. @category Evals */
export interface EvalFixturesPaths {
  /** Root containing `workflows/` and `runs/` subdirectories. */
  fixturesRoot: string
  /** Directory of `*.cases.json` catalog files. */
  casesDir: string
}

/**
 * Node eval fixture loader bound to harness-owned fixture directories.
 * @category Evals
 */
export interface NodeEvalFixturesLoader {
  /** Load eval cases from the bound cases directory. */
  loadEvalCases: (options?: LoadEvalCasesOptions) => EvalCase[]
  /** Load a workflow manifest fixture. */
  loadWorkflowFixture: (relativePath: string) => WorkflowManifest
  /** Load a run context fixture. */
  loadHarnessRunFixture: (relativePath: string) => HarnessRunContext
  /** Resolve invoke input for a single eval case. */
  resolveSingleEvalCaseInput: (caseRow: SingleEvalCase) => Record<string, unknown>
  /** Count non-skipped cases. */
  countEvalCases: () => number
}

/**
 * Create a Node eval fixtures loader for a harness package fixture tree.
 * @category Evals
 */
export function createNodeEvalFixturesLoader(paths: EvalFixturesPaths): NodeEvalFixturesLoader {
  return {
    loadEvalCases: (options = {}) => loadEvalCasesFromDir(paths.casesDir, options),
    loadWorkflowFixture: (relativePath) =>
      loadWorkflowFixtureFromRoot(paths.fixturesRoot, relativePath),
    loadHarnessRunFixture: (relativePath) =>
      loadHarnessRunFixtureFromRoot(paths.fixturesRoot, relativePath),
    resolveSingleEvalCaseInput: (caseRow) =>
      resolveSingleEvalCaseInputFromRoot(paths.fixturesRoot, caseRow),
    countEvalCases: () => loadEvalCasesFromDir(paths.casesDir, { excludeSkipped: true }).length,
  }
}
