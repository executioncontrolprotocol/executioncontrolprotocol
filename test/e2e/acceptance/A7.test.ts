import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  callTool,
  createCliHome,
  openMcpSession,
  parseJsonStdout,
  runEcp,
} from "./support.js"

describe("A7 commit versioning and execute id+patch", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("create/update/ifVersion conflict; execute { id, patch } without saving", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const objectPath = path.join(home, "exec.json")
    writeFileSync(
      objectPath,
      `${JSON.stringify({
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { id: "patch-me" },
        steps: [
          {
            id: "echo",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: "v1" },
            as: "out",
          },
        ],
      })}\n`,
    )

    const create = await runEcp(
      [
        "commit",
        "--type",
        "execution",
        "--action",
        "create",
        "--id",
        "patch-me",
        "--object",
        `@${objectPath}`,
        "--json",
      ],
      { env },
    )
    expect(create.code).toBe(0)

    const patchPath = path.join(home, "patch.json")
    writeFileSync(
      patchPath,
      `${JSON.stringify([{ op: "replace", path: "/steps/0/input/value", value: "v2" }])}\n`,
    )
    const update = await runEcp(
      [
        "commit",
        "--type",
        "execution",
        "--action",
        "update",
        "--id",
        "patch-me",
        "--if-version",
        "1",
        "--patch",
        `@${patchPath}`,
        "--json",
      ],
      { env },
    )
    expect(update.code).toBe(0)
    expect(
      parseJsonStdout<{ ok: boolean; data: { version: number } }>(update.stdout).data.version,
    ).toBe(2)

    const conflict = await runEcp(
      [
        "commit",
        "--type",
        "execution",
        "--action",
        "update",
        "--id",
        "patch-me",
        "--if-version",
        "1",
        "--object",
        `@${objectPath}`,
        "--json",
      ],
      { env },
    )
    expect(conflict.code).toBe(2)
    expect(
      parseJsonStdout<{ ok: false; error: { code: string } }>(conflict.stdout).error.code,
    ).toBe("ECP_VERSION_CONFLICT")

    const session = await openMcpSession({ env })
    cleanups.push(session.close)
    const ephemeral = await callTool(session.client, "execute", {
      execution: {
        id: "patch-me",
        patch: [{ op: "replace", path: "/steps/0/input/value", value: "ephemeral" }],
      },
    })
    expect(ephemeral.isError).toBeUndefined()
    expect((ephemeral.structuredContent as { result?: { out?: { echo?: string } } }).result?.out?.echo).toBe(
      "ephemeral",
    )

    const stored = await callTool(session.client, "retrieve", { type: "execution", id: "patch-me" })
    expect(stored.isError).toBeUndefined()
    const item = (stored.structuredContent as { item?: { version?: number; manifest?: { steps: Array<{ input?: { value?: string } }> } } })
      .item
    expect(item?.version).toBe(2)
    expect(item?.manifest?.steps[0]?.input?.value).toBe("v2")
  }, 120_000)
})
