import "vitest"

declare module "vitest" {
  export interface ProvidedContext {
    /** Directory of per-pid JSON registry files for host-process teardown. */
    ecpTestProcRegistry: string
  }
}