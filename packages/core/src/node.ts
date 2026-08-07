/**
 * Node host conveniences: file loaders and workflow compile (native esbuild).
 * Import from `@executioncontrolprotocol/core/node` in Node runtimes; browser apps use `@executioncontrolprotocol/core/browser`.
 * @packageDocumentation
 */

export * from "./loaders/index.js"
export {
  compileWorkflowSource,
  compileAndValidateWorkflowSource,
  extractWorkflowFromModule,
  compileHarnessArtifactSource,
  extractArtifactFromModule,
  type CompileWorkflowResult,
  type CompileWorkflowSourceOptions,
  type CompileDiagnostic,
  type CompileHarnessArtifactResult,
  type CompileHarnessArtifactSourceOptions,
  type HarnessArtifactSchema,
} from "./compile/entry.js"
