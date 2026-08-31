import { readFile, writeFile, access } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { Command, Flags } from "@oclif/core"
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

function runNpmInstall(cwd: string, extra: string[]): Promise<void> {
  return new Promise((resolveInstall, reject) => {
    const child = spawn("npm", ["install", ...extra], {
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

/** Create or merge package.json from an environment module's imports. */
export default class Init extends Command {
  static summary = "Create or merge package.json from an environment module"

  static description =
    "Collect npm packages from environment.ts side-effect imports, write or merge " +
    "package.json (never bump existing ranges), and optionally run npm install."

  static examples = [
    "<%= config.bin %> <%= command.id %> --from environment.ts --install",
    "<%= config.bin %> <%= command.id %> --from examples/01-echo/environment.ts --no-install",
  ]

  static flags = {
    from: Flags.string({
      required: true,
      description: "Path to environment module (.ts or .js)",
    }),
    install: Flags.boolean({
      description: "Run npm install after writing package.json",
      allowNo: true,
      default: true,
    }),
    "dry-run": Flags.boolean({
      description: "Print planned packages without writing files",
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Init)
    const envPath = resolve(flags.from)
    const source = await readFile(envPath, "utf8")
    const packages = collectPackagesFromEnvironmentSource(source)
    const dir = dirname(envPath)
    const pkgPath = join(dir, "package.json")
    const exists = await pathExists(pkgPath)

    if (flags["dry-run"]) {
      this.log(JSON.stringify({ packages, packageJson: pkgPath, exists }, null, 2))
      return
    }

    let added: string[] = packages
    if (!exists) {
      const created = createPackageJson(basename(dir) || "ecp-env", packages)
      await writeFile(pkgPath, `${JSON.stringify(created, null, 2)}\n`, "utf8")
      this.log(`Created ${pkgPath}`)
    } else {
      const existing = JSON.parse(await readFile(pkgPath, "utf8")) as InitPackageJson
      const merged = mergeMissingDependencies(existing, packages)
      added = merged.added
      await writeFile(pkgPath, `${JSON.stringify(merged.next, null, 2)}\n`, "utf8")
      if (added.length === 0) {
        this.log(`No missing packages in ${pkgPath}`)
      } else {
        this.log(`Added ${added.join(", ")} to ${pkgPath}`)
      }
    }

    if (flags.install) {
      await runNpmInstall(dir, [])
    }
  }
}
