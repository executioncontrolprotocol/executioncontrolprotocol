import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  ensureEvalEnvLoaded,
  parseDotEnvFile,
  resetEvalEnvLoadedForTests,
} from "@executioncontrolprotocol/evals"

describe("load-eval-env", () => {
  afterEach(() => {
    resetEvalEnvLoadedForTests()
    delete process.env.ECP_EVAL_ENV_TEST_KEY
  })

  it("parses dotenv lines and ignores comments", () => {
    expect(
      parseDotEnvFile(`# comment
ECP_EVAL_ENV_TEST_KEY=plain
QUOTED="hello world"
SINGLE='x'
INVALID LINE
=emptykey
`)
    ).toEqual({
      ECP_EVAL_ENV_TEST_KEY: "plain",
      QUOTED: "hello world",
      SINGLE: "x",
    })
  })

  it("loads .env into process.env without overwriting existing values", () => {
    const root = mkdtempSync(join(tmpdir(), "ecp-eval-env-"))
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n")
    writeFileSync(join(root, ".env"), "ECP_EVAL_ENV_TEST_KEY=from-file\n")

    process.env.ECP_EVAL_ENV_TEST_KEY = "from-process"
    ensureEvalEnvLoaded({ force: true, root })
    expect(process.env.ECP_EVAL_ENV_TEST_KEY).toBe("from-process")

    delete process.env.ECP_EVAL_ENV_TEST_KEY
    ensureEvalEnvLoaded({ force: true, root })
    expect(process.env.ECP_EVAL_ENV_TEST_KEY).toBe("from-file")
  })
})
