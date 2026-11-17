import { afterEach } from "vitest"
import { resetDelayForTests } from "../plugins/plugin-test/src/capabilities/delay-hooks.js"

afterEach(() => {
  resetDelayForTests()
})