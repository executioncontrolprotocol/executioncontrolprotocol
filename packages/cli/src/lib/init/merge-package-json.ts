import { INIT_DEV_DEPENDENCIES } from "./collect-env-packages.js"

/** package.json shape used by `ecp init`. @category CLI */
export interface InitPackageJson {
  /** Package name. */
  name?: string
  /** Private package flag. */
  private?: boolean
  /** Module type. */
  type?: string
  /** Production dependencies. */
  dependencies?: Record<string, string>
  /** Development dependencies. */
  devDependencies?: Record<string, string>
  /** Additional package.json fields. */
  [key: string]: unknown
}

/**
 * Create a greenfield package.json (latest-compatible ranges via `*`).
 * @category CLI
 */
export function createPackageJson(
  name: string,
  packages: string[],
  devPackages: readonly string[] = INIT_DEV_DEPENDENCIES
): InitPackageJson {
  const dependencies: Record<string, string> = {}
  for (const pkg of packages) {
    if (devPackages.includes(pkg as (typeof devPackages)[number])) continue
    dependencies[pkg] = "*"
  }
  const devDependencies: Record<string, string> = {}
  for (const pkg of devPackages) {
    devDependencies[pkg] = "*"
  }
  return {
    name,
    private: true,
    type: "module",
    dependencies,
    devDependencies,
  }
}

/**
 * Add missing packages without rewriting existing version ranges.
 * @category CLI
 */
export function mergeMissingDependencies(
  existing: InitPackageJson,
  packages: string[],
  devPackages: readonly string[] = INIT_DEV_DEPENDENCIES
): { next: InitPackageJson; added: string[] } {
  const next: InitPackageJson = {
    ...existing,
    dependencies: { ...existing.dependencies },
    devDependencies: { ...existing.devDependencies },
  }
  const added: string[] = []
  const deps = next.dependencies ?? {}
  const dev = next.devDependencies ?? {}
  next.dependencies = deps
  next.devDependencies = dev

  for (const pkg of packages) {
    if (devPackages.includes(pkg as (typeof devPackages)[number])) continue
    if (deps[pkg] || dev[pkg]) continue
    deps[pkg] = "*"
    added.push(pkg)
  }
  for (const pkg of devPackages) {
    if (deps[pkg] || dev[pkg]) continue
    dev[pkg] = "*"
    added.push(pkg)
  }
  return { next, added }
}
