import { workflow, step } from "@executioncontrolprotocol/core"

/** Single step that always throws an HTTP-shaped error (`test.fail`). */
export default workflow("Fail http")
  .run([
    step("@executioncontrolprotocol/test.fail", "Call").id("call").as("out"),
  ])
