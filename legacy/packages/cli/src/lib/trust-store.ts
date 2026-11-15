import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { Interfaces } from "@oclif/core"

interface TrustFile {
  packages: Record<string, { trusted: boolean; at: string }>
}

async function trustPath(config: Interfaces.Config): Promise<string> {
  return join(config.dataDir, "trust.json")
}

async function readTrust(config: Interfaces.Config): Promise<TrustFile> {
  try {
    return JSON.parse(await readFile(await trustPath(config), "utf8")) as TrustFile
  } catch {
    return { packages: {} }
  }
}

/**
 * Remembered trust decision for a package, if any.
 * @category CLI
 */
export async function rememberedTrust(
  config: Interfaces.Config,
  name: string
): Promise<boolean | undefined> {
  const file = await readTrust(config)
  return file.packages[name]?.trusted
}

/**
 * Persist a trust decision for a package.
 * @category CLI
 */
export async function rememberTrust(
  config: Interfaces.Config,
  name: string,
  trusted: boolean
): Promise<void> {
  const path = await trustPath(config)
  await mkdir(dirname(path), { recursive: true })
  const file = await readTrust(config)
  file.packages[name] = { trusted, at: new Date().toISOString() }
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, "utf8")
}
