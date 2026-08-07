/** Options for loading eval cases. @category Evals */
export interface LoadEvalCasesOptions {
  /** Filter by suite id. */
  suite?: import("./eval-case-schema.js").EvalSuite
  /** Skip cases with `skip: true`. */
  excludeSkipped?: boolean
}
