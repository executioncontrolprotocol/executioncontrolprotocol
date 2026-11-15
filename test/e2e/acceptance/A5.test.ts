import { writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  createCliHome,
  parseJsonStdout,
  runEcp,
} from "./support.js"

describe("A5 $script path/source, syntax, maxLength", () => {
  it("path and source succeed; syntax reports line/col; over-long is ECP_INPUT_INVALID", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()

    // `$script` is a value (syntax-checked, never run). Resolved text is
    // `const params = …;\n` + source — keep source tiny so maxLength 40 passes.
    const scriptPath = path.join(home, "ok.js")
    writeFileSync(scriptPath, "1")

    const byPath = path.join(home, "script-path.ecp.json")
    writeFileSync(
      byPath,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "scripted",
            uses: "@executioncontrolprotocol/test.bounded",
            input: { text: { $script: { lang: "js", path: scriptPath } } },
            as: "out",
          },
        ],
      })}\n`,
    )
    const pathRun = await runEcp(["execute", byPath, "--json"], { env })
    expect(pathRun.code, pathRun.stderr + pathRun.stdout).toBe(0)
    const pathText = parseJsonStdout<{ data: { result?: { out?: { text?: string } } } }>(
      pathRun.stdout,
    ).data.result?.out?.text
    expect(pathText).toContain("1")
    expect(pathText!.length).toBeLessThanOrEqual(40)

    const bySource = path.join(home, "script-source.ecp.json")
    writeFileSync(
      bySource,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "scripted",
            uses: "@executioncontrolprotocol/test.bounded",
            input: { text: { $script: { lang: "js", source: "2" } } },
            as: "out",
          },
        ],
      })}\n`,
    )
    const sourceRun = await runEcp(["execute", bySource, "--json"], { env })
    expect(sourceRun.code, sourceRun.stderr + sourceRun.stdout).toBe(0)
    expect(
      parseJsonStdout<{ data: { result?: { out?: { text?: string } } } }>(sourceRun.stdout).data.result
        ?.out?.text,
    ).toContain("2")

    const syntaxManifest = path.join(home, "syntax.ecp.json")
    writeFileSync(
      syntaxManifest,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "scripted",
            uses: "@executioncontrolprotocol/test.bounded",
            input: { text: { $script: { lang: "js", source: "function (" } } },
            as: "out",
          },
        ],
      })}\n`,
    )
    const syntax = await runEcp(["execute", syntaxManifest, "--validate", "--json"], { env })
    expect(syntax.code).not.toBe(0)
    const syntaxEnv = parseJsonStdout<{
      ok: false
      error: { code?: string; issues?: Array<{ code: string; message: string }> }
    }>(syntax.stdout)
    const issues = syntaxEnv.error.issues ?? []
    expect(
      issues.some((issue) => issue.code === "ECP_SCRIPT_INVALID") ||
        syntaxEnv.error.code === "ECP_SCRIPT_INVALID",
    ).toBe(true)
    const message = JSON.stringify(syntaxEnv)
    expect(message).toMatch(/line|column|col/i)

    // Over-long: resolved script text exceeds maxLength 40 → ECP_INPUT_INVALID.
    const longManifest = path.join(home, "long.ecp.json")
    writeFileSync(
      longManifest,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            id: "scripted",
            uses: "@executioncontrolprotocol/test.bounded",
            input: {
              text: { $script: { lang: "js", source: `"${"x".repeat(50)}"` } },
            },
            as: "out",
          },
        ],
      })}\n`,
    )
    const tooLong = await runEcp(["execute", longManifest, "--json"], { env })
    expect(tooLong.code).not.toBe(0)
    expect(tooLong.stdout + tooLong.stderr).toMatch(/ECP_INPUT_INVALID/)
  }, 120_000)
})
