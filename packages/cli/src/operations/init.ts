import { z } from "zod"
import { access, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { defineOperation, EcpCliError, EXIT_FAILED } from "@executioncontrolprotocol/plugin-sdk"
import { collectPackagesFromEnvironmentSource } from "../lib/init/collect-env-packages.js"
import {
  createPackageJson,
  mergeMissingDependencies,
  type InitPackageJson,
} from "../lib/init/merge-package-json.js"

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function runNpmInstall(cwd: string): Promise<void> {
  return new Promise((resolveInstall, reject) => {
    const child = spawn("npm", ["install"], {
      cwd,
      stdio: "inherit",
      shell: true,
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolveInstall()
      else reject(new Error(`npm install exited with code ${code ?? "null"}`))
    })
  })
}

/** `ecp init`. Behavior is unchanged in Phase 3; Phase 4 rewrites it. @category CLI */
export const initOperation = defineOperation("init")
  .withInput(
    z.object({
      from: z.string(),
      install: z.boolean().default(true),
      "dry-run": z.boolean().optional(),
    })
  )
  .withMetadata({
    summary: "Create or merge package.json from an environment module",
    description:
      "Collect npm packages from environment.ts side-effect imports, write or merge package.json (never bump existing ranges), and optionally run npm install.",
    useCases: ["Bootstrap package.json next to an environment module"],
    examples: [
      "ecp init --from environment.ts --install",
      "ecp init --from examples/01-echo/environment.ts --no-install",
    ],
  })
  .withHandler(async (input) => {
    const envPath = resolve(String(input.from))
    const source = await readFile(envPath, "utf8")
    const packages = collectPackagesFromEnvironmentSource(source)
    const dir = dirname(envPath)
    const pkgPath = join(dir, "package.json")
    const exists = await pathExists(pkgPath)

    if (input["dry-run"]) {
      return { packages, packageJson: pkgPath, exists }
    }

    let added: string[] = packages
    if (!exists) {
      const created = createPackageJson(basename(dir) || "ecp-env", packages)
      await writeFile(pkgPath, `${JSON.stringify(created, null, 2)}\n`, "utf8")
    } else {
      const existing = JSON.parse(await readFile(pkgPath, "utf8")) as InitPackageJson
      const merged = mergeMissingDependencies(existing, packages)
      added = merged.added
      await writeFile(pkgPath, `${JSON.stringify(merged.next, null, 2)}\n`, "utf8")
    }

    if (input.install !== false) {
      try {
        await runNpmInstall(dir)
      } catch (err) {
        throw new EcpCliError(
          "ECP_INIT_INSTALL",
          err instanceof Error ? err.message : String(err),
          { exitCode: EXIT_FAILED }
        )
      }
    }

    return {
      packageJson: pkgPath,
      added,
      created: !exists,
    }
  })
  .build()
