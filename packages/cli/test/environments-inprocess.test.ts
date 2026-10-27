import { EventEmitter } from "node:events"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Interfaces } from "@oclif/core"
import { EcpCliError } from "@executioncontrolprotocol/plugin-sdk"
import { afterEach, describe, expect, it } from "vitest"
import {
  extensionIdFromPluginPackage,
  looksLikeEnvPath,
  prepareArgvForExecute,
  setPendingAddToEnv,
  stripAddToEnvFromArgv,
  takePendingAddToEnv,
} from "../src/lib/add-to-env.js"
import { applyDefaultEcpHome, defaultEcpHome } from "../src/lib/ecp-home.js"
import { resolveEditor, tokenizeCommand } from "../src/lib/editor.js"
import {
  appendExtensionStubToEnvFile,
  defaultEnvironmentPath,
  environmentFileTemplate,
  insertExtensionStub,
} from "../src/lib/environment-file.js"
import {
  NODE_HOST_PACKAGE,
  packageJsonFromRequirements,
} from "../src/lib/export-environment.js"
import {
  environmentsEditOperation,
  environmentsExportOperation,
  environmentsInitOperation,
  environmentsTopicOperation,
} from "../src/operations/environments.js"
import { workflowsTopicOperation } from "../src/operations/workflow.js"
import { repoRoot } from "./helpers.js"

const echoWf = join(repoRoot, "examples", "01-echo", "workflow.ecp.ts")

function ctx(configDir: string): {
  host: undefined
  config: Interfaces.Config
  argv: string[]
  json: boolean
} {
  return {
    host: undefined,
    config: { configDir, getPluginsList: () => [], runCommand: async () => undefined } as unknown as Interfaces.Config,
    argv: [],
    json: true,
  }
}

describe("topic help", () => {
  it("workflows and environments topics list subcommands", async () => {
    const dummy = ctx(tmpdir())
    expect(String(await workflowsTopicOperation.handler({}, dummy))).toMatch(/ecp workflows/)
    expect(String(await environmentsTopicOperation.handler({}, dummy))).toMatch(/ecp environments/)
  })
})

describe("environments export", () => {
  it("includes node, workflow requirement packages, and env-file imports", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-export-"))
    const envFile = join(dir, "environment.ecp.ts")
    await writeFile(
      envFile,
      `import { environment, NODE_ENVIRONMENT_ID } from "@executioncontrolprotocol/node"
import jsonata from "@executioncontrolprotocol/plugin-jsonata"
export default environment(NODE_ENVIRONMENT_ID, "local").with([])
`,
      "utf8"
    )
    const document = (await environmentsExportOperation.handler(
      { format: "package-json", "workflow-path": echoWf, env: envFile },
      ctx(dir)
    )) as { dependencies: Record<string, string> }
    expect(document.dependencies[NODE_HOST_PACKAGE]).toBe("*")
    expect(document.dependencies["@executioncontrolprotocol/plugin-test"]).toBe("*")
    expect(document.dependencies["@executioncontrolprotocol/plugin-jsonata"]).toBe("*")
    expect(JSON.stringify(document)).not.toMatch(/sk-|secret|apiKey/i)
  }, 30_000)

  it("exports node only when no workflow or env file is passed", async () => {
    const document = (await environmentsExportOperation.handler(
      { format: "package-json" },
      ctx(tmpdir())
    )) as { dependencies: Record<string, string> }
    expect(document.dependencies).toEqual({ [NODE_HOST_PACKAGE]: "*" })
  })

  it("writes --output and uses pinned ranges from requirements", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-export-out-"))
    const out = join(dir, "package.json")
    const document = packageJsonFromRequirements(
      [
        {
          kind: "extension",
          id: "@executioncontrolprotocol/jsonata",
          package: "@executioncontrolprotocol/plugin-jsonata",
          range: "^0.50.0",
          source: "explicit",
        },
      ],
      []
    )
    expect(document.dependencies["@executioncontrolprotocol/plugin-jsonata"]).toBe("^0.50.0")
    const written = await environmentsExportOperation.handler(
      { format: "package-json", output: out },
      ctx(dir)
    )
    expect(written).toBeUndefined()
    const saved = JSON.parse(await readFile(out, "utf8")) as { dependencies: Record<string, string> }
    expect(saved.dependencies[NODE_HOST_PACKAGE]).toBe("*")
  })

  it("rejects a missing workflow file", async () => {
    await expect(
      environmentsExportOperation.handler(
        { format: "package-json", "workflow-path": join(tmpdir(), "missing.ecp.ts") },
        ctx(tmpdir())
      )
    ).rejects.toThrow()
  })
})

describe("environments init and edit", () => {
  it("writes the template then refuses a second init", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-env-init-"))
    const first = (await environmentsInitOperation.handler({}, ctx(dir))) as { path: string }
    expect(first.path).toBe(defaultEnvironmentPath(dir))
    const source = await readFile(first.path, "utf8")
    expect(source).toMatch(/NODE_ENVIRONMENT_ID/)
    expect(source).toMatch(/\.with\(\[/)
    await expect(environmentsInitOperation.handler({}, ctx(dir))).rejects.toMatchObject({
      code: "ECP_INPUT_INVALID",
    })
  })

  it("edit prints the path, scaffolds when missing, and invokes the editor", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-env-edit-"))
    const previousVisual = process.env.VISUAL
    const previousEditor = process.env.EDITOR
    delete process.env.VISUAL
    process.env.EDITOR = `"${process.execPath}" -e process.exit(0)`
    try {
      const result = (await environmentsEditOperation.handler({}, ctx(dir))) as { path: string }
      expect(result.path).toBe(defaultEnvironmentPath(dir))
      expect(await readFile(result.path, "utf8")).toMatch(/environment\(/)
      const again = (await environmentsEditOperation.handler({}, ctx(dir))) as { path: string }
      expect(again.path).toBe(result.path)
    } finally {
      if (previousVisual === undefined) delete process.env.VISUAL
      else process.env.VISUAL = previousVisual
      if (previousEditor === undefined) delete process.env.EDITOR
      else process.env.EDITOR = previousEditor
    }
  })
})

describe("ecp home defaults", () => {
  it("sets ~/.ecp subdirs when ECP_* and XDG_* are unset", () => {
    const env: NodeJS.ProcessEnv = {}
    applyDefaultEcpHome(env, "/home/agent")
    const root = defaultEcpHome("/home/agent")
    expect(env.ECP_CONFIG_DIR).toBe(join(root, "config"))
    expect(env.ECP_DATA_DIR).toBe(join(root, "data"))
    expect(env.ECP_CACHE_DIR).toBe(join(root, "cache"))
  })

  it("leaves explicit ECP_* and XDG_* overrides alone", () => {
    const ecpEnv: NodeJS.ProcessEnv = {
      ECP_CONFIG_DIR: "/custom/config",
      ECP_DATA_DIR: "/custom/data",
      ECP_CACHE_DIR: "/custom/cache",
    }
    applyDefaultEcpHome(ecpEnv, "/home/agent")
    expect(ecpEnv.ECP_CONFIG_DIR).toBe("/custom/config")
    expect(ecpEnv.ECP_DATA_DIR).toBe("/custom/data")
    expect(ecpEnv.ECP_CACHE_DIR).toBe("/custom/cache")

    const xdgEnv: NodeJS.ProcessEnv = {
      XDG_CONFIG_HOME: "/xdg/config",
      XDG_DATA_HOME: "/xdg/data",
      XDG_CACHE_HOME: "/xdg/cache",
    }
    applyDefaultEcpHome(xdgEnv, "/home/agent")
    expect(xdgEnv.ECP_CONFIG_DIR).toBeUndefined()
    expect(xdgEnv.ECP_DATA_DIR).toBeUndefined()
    expect(xdgEnv.ECP_CACHE_DIR).toBeUndefined()
  })
})

describe("add-to-env", () => {
  afterEach(() => {
    takePendingAddToEnv()
  })

  it("strips --add-to-env from plugins install and remembers the target", () => {
    const bare = stripAddToEnvFromArgv([
      "node",
      "ecp.js",
      "plugins",
      "install",
      "jsonata",
      "--add-to-env",
    ])
    expect(bare.argv).toEqual(["node", "ecp.js", "plugins", "install", "jsonata"])
    expect(bare.addToEnv).toBe(true)

    const withPath = stripAddToEnvFromArgv([
      "node",
      "ecp.js",
      "plugins",
      "install",
      "jsonata",
      "--add-to-env",
      "./environment.ecp.ts",
    ])
    expect(withPath.addToEnv).toBe("./environment.ecp.ts")
    expect(withPath.argv).not.toContain("--add-to-env")
    expect(withPath.argv).not.toContain("./environment.ecp.ts")

    const equals = stripAddToEnvFromArgv([
      "node",
      "ecp.js",
      "plugins",
      "install",
      "jsonata",
      "--add-to-env=/tmp/env.ts",
    ])
    expect(equals.addToEnv).toBe("/tmp/env.ts")
  })

  it("does not strip the flag on other commands", () => {
    const other = stripAddToEnvFromArgv(["node", "ecp.js", "run", "wf.ts", "--add-to-env"])
    expect(other.addToEnv).toBeUndefined()
    expect(other.argv).toContain("--add-to-env")
  })

  it("prepareArgvForExecute stores the target for the postinstall hook", () => {
    const argv = prepareArgvForExecute(["node", "ecp.js", "plugins", "install", "jsonata", "--add-to-env"])
    expect(argv).not.toContain("--add-to-env")
    expect(takePendingAddToEnv()).toBe(true)
    expect(takePendingAddToEnv()).toBeUndefined()
  })

  it("maps package names to extension ids", () => {
    expect(
      extensionIdFromPluginPackage("@executioncontrolprotocol/plugin-jsonata", {
        ecp: { id: "@executioncontrolprotocol/jsonata" },
      })
    ).toBe("@executioncontrolprotocol/jsonata")
    expect(extensionIdFromPluginPackage("@executioncontrolprotocol/plugin-jsonata")).toBe(
      "@executioncontrolprotocol/jsonata"
    )
    expect(looksLikeEnvPath("jsonata")).toBe(false)
    expect(looksLikeEnvPath("environment.ecp.ts")).toBe(true)
  })

  it("inserts a commented stub, is idempotent, and errors without .with([", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ecp-stub-"))
    const path = defaultEnvironmentPath(dir)
    await writeFile(path, environmentFileTemplate(), "utf8")
    const first = await appendExtensionStubToEnvFile(path, "@executioncontrolprotocol/openai")
    expect(first.inserted).toBe(true)
    const source = await readFile(path, "utf8")
    expect(source).toMatch(/\/\/ extension\("@executioncontrolprotocol\/openai"\)/)
    expect(source).toMatch(/secrets\("openai\/api-key"\)/)
    const second = await appendExtensionStubToEnvFile(path, "@executioncontrolprotocol/openai")
    expect(second.inserted).toBe(false)
    expect(() => insertExtensionStub("export default environment()", "@x/y")).toThrow(EcpCliError)
  })

  it("setPendingAddToEnv is a no-op for the hook when unset", () => {
    setPendingAddToEnv(undefined)
    expect(takePendingAddToEnv()).toBeUndefined()
  })
})

describe("editor resolution", () => {
  it("prefers VISUAL over EDITOR over the platform default", () => {
    expect(tokenizeCommand(`"${process.execPath}" -e process.exit(0)`)).toEqual([
      process.execPath,
      "-e",
      "process.exit(0)",
    ])
    expect(resolveEditor({ VISUAL: "code -w", EDITOR: "vim" }).command).toBe("code")
    expect(resolveEditor({ EDITOR: "vim" }).command).toBe("vim")
    expect(resolveEditor({}, "win32")).toEqual({ command: "notepad", args: [] })
    expect(resolveEditor({}, "darwin")).toEqual({ command: "open", args: ["-t"] })
    expect(resolveEditor({}, "linux")).toEqual({ command: "xdg-open", args: [] })
  })
})

describe("openInEditor spawn wiring", () => {
  it("passes the file path to the resolved editor", async () => {
    const { openInEditor } = await import("../src/lib/editor.js")
    const spawned: { command: string; args: string[] }[] = []
    const fake = ((command: string, args: string[]) => {
      spawned.push({ command, args })
      const child = new EventEmitter() as EventEmitter & { on: typeof EventEmitter.prototype.on }
      queueMicrotask(() => child.emit("close", 0))
      return child
    }) as unknown as typeof import("node:child_process").spawn
    await openInEditor("/tmp/environment.ecp.ts", {
      env: { EDITOR: "vim" },
      spawnImpl: fake,
    })
    expect(spawned[0]).toEqual({ command: "vim", args: ["/tmp/environment.ecp.ts"] })
  })
})
