import { describe, expect, it } from "vitest"
import {
  EDITOR_SCHEMA_SHUTDOWN_WAIT_MS,
  holdEditorSchemaWriteForTests,
  releaseEditorSchemaWriteForTests,
  setEditorSchemaWriteDelayForTests,
} from "../src/editor-schema.js"

describe("editor schema test hooks", () => {
  it("holds and releases an in-flight write gate", () => {
    holdEditorSchemaWriteForTests()
    releaseEditorSchemaWriteForTests()
    releaseEditorSchemaWriteForTests()
    setEditorSchemaWriteDelayForTests(-5)
    setEditorSchemaWriteDelayForTests(0)
    expect(EDITOR_SCHEMA_SHUTDOWN_WAIT_MS).toBeGreaterThan(0)
  })
})