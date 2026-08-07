import { describe, expect, it } from "vitest"
import {
  workflow,
  step,
  ref,
  state,
  env,
  secrets,
  browser,
  expr,
  parallel,
  branch,
  loop,
  extension,
  runtime,
  policy,
  environment,
  defineExtension,
  defineRuntime,
  definePolicy,
  capability,
  capabilityFor,
  hook,
  WorkflowBuilder,
} from "../src/index.js"
import { NODE_RUNTIME_ID, nodeRuntimeDefinition } from "@executioncontrolprotocol/node"

describe("fluent API surface", () => {
  it("workflow builder chains", () => {
    const b = workflow("W")
    expect(typeof b.run).toBe("function")
    expect(typeof b.id).toBe("function")
    expect(typeof b.compile).toBe("function")
    expect(typeof b.toManifest).toBe("function")
    expect(typeof b.validate).toBe("function")
    expect(typeof b.toGraph).toBe("function")
    expect(b).toBeInstanceOf(WorkflowBuilder)
    const m = b.run([step("@executioncontrolprotocol/test.echo", "S").with({ x: 1 }).as("k")]).toManifest()
    expect(m.schema).toBe("@executioncontrolprotocol.workflow")
  })

  it("step builder chains", () => {
    const s = step("@executioncontrolprotocol/test.echo", "Label")
    expect(typeof s.with).toBe("function")
    expect(typeof s.when).toBe("function")
    expect(typeof s.as).toBe("function")
    expect(typeof s.id).toBe("function")
    expect(typeof s.toNode).toBe("function")
    expect(s.toNode().type).toBe("step")
  })

  it("binding builders chain", () => {
    const e = extension("@executioncontrolprotocol/test", "E").with({ a: 1 })
    expect(typeof e.with).toBe("function")
    expect(e.getConfig()).toEqual({ a: 1 })

    const r = runtime(NODE_RUNTIME_ID, "R").with({})
    expect(typeof r.with).toBe("function")

    const p = policy("@executioncontrolprotocol/budget", "P").with({ maxModelCalls: 1 })
    expect(typeof p.with).toBe("function")
  })

  it("definition builders exist", () => {
    const ext = defineExtension("@executioncontrolprotocol", "x")
    expect(typeof ext.withConfig).toBe("function")
    expect(typeof ext.withCapabilities).toBe("function")
    expect(typeof ext.build).toBe("function")

    const rt = defineRuntime("@executioncontrolprotocol", "x")
    expect(typeof rt.withExecutor).toBe("function")

    const pol = definePolicy("@executioncontrolprotocol", "x")
    expect(typeof pol.withHooks).toBe("function")

    expect(typeof capability("c").withHandler).toBe("function")
    expect(typeof capabilityFor("@executioncontrolprotocol/x" as never, "c").withInput).toBe("function")
    expect(hook("run:before", async () => undefined).event).toBe("run:before")
  })

  it("value helpers", () => {
    expect(ref("a").$ref).toBe("state.a")
    expect(state("b").path).toBe("b")
    expect(env("KEY").$env).toBe("KEY")
    expect(secrets("my/key").$secret).toBe("my/key")
    expect(browser("OPENAI_API_KEY").$browser).toBe("OPENAI_API_KEY")
    expect(expr.eq("x", 1)).toEqual({ eq: ["x", 1] })
    expect(expr.neq("x", 1)).toEqual({ neq: ["x", 1] })
  })

  it("flow helpers produce node types", () => {
    expect(parallel([[step("@executioncontrolprotocol/test.echo", "A")]]).type).toBe("parallel")
    expect(branch([step("@executioncontrolprotocol/test.echo", "A")]).type).toBe("branch")
    expect(loop({ label: "L" }, [step("@executioncontrolprotocol/test.echo", "A")]).type).toBe("loop")
  })

  it("environment builder chains", () => {
    const envBuilder = environment("id", "label")
    expect(typeof envBuilder.withRuntime).toBe("function")
    expect(typeof envBuilder.withExtensions).toBe("function")
    expect(typeof envBuilder.withPolicies).toBe("function")
    expect(typeof envBuilder.compile).toBe("function")
    expect(typeof envBuilder.init).toBe("function")
    expect(typeof envBuilder.getRegistry).toBe("function")
  })

  it("runtime definition uses withExecutor terminator", () => {
    expect(nodeRuntimeDefinition.executor).toBeDefined()
    expect(defineRuntime("@executioncontrolprotocol", "x").withConfig({}).withExecutor(nodeRuntimeDefinition.executor).id).toBe(
      "@executioncontrolprotocol/x"
    )
  })
})
