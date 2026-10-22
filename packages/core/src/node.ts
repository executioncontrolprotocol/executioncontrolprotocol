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
  type CompileWorkflowResult,
  type CompileWorkflowSourceOptions,
  type CompileDiagnostic,
} from "./compile/entry.js"
