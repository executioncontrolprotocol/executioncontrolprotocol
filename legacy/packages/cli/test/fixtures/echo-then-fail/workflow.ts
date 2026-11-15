import { workflow, step } from "@executioncontrolprotocol/core"

/** Echo then always throw (`test.fail`) so resume/rerun can fail after a completed step. */
export default workflow("Echo then fail")
  .run([
    step("@executioncontrolprotocol/test.echo", "First").id("first").as("first"),
    step("@executioncontrolprotocol/test.fail", "Call").id("call").as("out"),
  ])
