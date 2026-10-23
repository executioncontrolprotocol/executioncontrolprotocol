import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { toKebabCase } from "../kebab.js"

function pluginPackageName(name: string): string {
  if (name.startsWith("@")) return name
  const slug = toKebabCase(name.replace(/^plugin-/, ""))
  return `@executioncontrolprotocol/plugin-${slug}`
}

function extensionName(name: string): string {
  if (name.startsWith("@")) {
    const rest = name.split("/")[1] ?? name
    return rest.replace(/^plugin-/, "")
  }
  return toKebabCase(name.replace(/^plugin-/, ""))
}

/**
 * Scaffold a plugin directory with `src/index.ts` and a minimal `package.json`.
 * @category CLI
 */
export async function scaffoldPlugin(dir: string, name: string): Promise<void> {
  const pkgName = pluginPackageName(name)
  const extName = extensionName(name)
  await mkdir(join(dir, "src"), { recursive: true })
  const packageJson = {
    name: pkgName,
    version: "0.14.1",
    description: `ECP plugin ${extName}`,
    license: "Apache-2.0",
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    files: ["dist", "README.md"],
    scripts: {
      build: "tsc -b && ecp plugins build",
    },
    peerDependencies: {
      "@executioncontrolprotocol/core": "workspace:^",
      zod: "catalog:",
    },
    dependencies: {
      "@executioncontrolprotocol/plugin-sdk": "workspace:^",
    },
    devDependencies: {
      "@executioncontrolprotocol/cli": "workspace:^",
      "@executioncontrolprotocol/core": "workspace:^",
      typescript: "catalog:",
      zod: "catalog:",
    },
  }
  await writeFile(join(dir, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8")
  const source = `import { defineExtension, capabilityFor } from "@executioncontrolprotocol/core"
import { z } from "zod"

const ${camel(extName)}Extension = defineExtension("@executioncontrolprotocol", ${JSON.stringify(extName)})
  .withMetadata({
    summary: "${extName} plugin",
    description: "Replace this summary with product prose.",
    useCases: ["Call this plugin when the workflow needs ${extName}"],
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/${extName}", "run")
      .withInput(z.object({ value: z.string() }))
      .withOutput(z.object({ result: z.string() }))
      .withMetadata({
        summary: "Echo value",
        description: "Returns the input value. Replace with a real handler.",
        useCases: ["Smoke-test a newly scaffolded plugin"],
        projections: [
          {
            summary: "Take the result string",
            description: "Use result as the echoed value.",
          },
        ],
      })
      .withHandler(async (input) => ({ result: input.value })),
  ])
  .build()

export default ${camel(extName)}Extension
`
  await writeFile(join(dir, "src", "index.ts"), source, "utf8")
  const tsconfig = {
    extends: "../../tsconfig.base.json",
    compilerOptions: { outDir: "dist", rootDir: "src", composite: true },
    include: ["src/**/*.ts"],
    references: [{ path: "../../packages/core" }],
  }
  await writeFile(join(dir, "tsconfig.json"), `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8")
}

function camel(value: string): string {
  const parts = value.split(/[-_]/g).filter(Boolean)
  const [first = "plugin", ...rest] = parts
  return (
    first.replace(/[^a-zA-Z0-9]/g, "") +
    rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")
  )
}
