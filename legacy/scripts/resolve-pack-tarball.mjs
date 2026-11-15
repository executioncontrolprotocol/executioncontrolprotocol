import { basename, isAbsolute, join } from "node:path"

/**
 * Whether a `pnpm pack` path is absolute (POSIX or Windows drive letter).
 *
 * @param {string} filename
 * @returns {boolean}
 */
export function isAbsolutePackPath(filename) {
  return isAbsolute(filename) || /^[A-Za-z]:[\\/]/.test(filename)
}

/**
 * Parse the tarball path from `pnpm pack` stdout (last `.tgz` line, or final line).
 *
 * @param {string} packOutput
 * @returns {string | undefined}
 */
export function parsePackTarballLine(packOutput) {
  const lines = packOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const tgzLine = lines.findLast((line) => line.endsWith(".tgz"))
  return tgzLine ?? lines.at(-1)
}

/**
 * Resolve a `pnpm pack` tarball reference to an absolute path under `packsDir`.
 *
 * `pnpm pack` may print a bare filename, a relative path, or an absolute path.
 *
 * @param {string} packsDir
 * @param {string} packOutputLine
 * @returns {string}
 */
export function resolvePackTarballPath(packsDir, packOutputLine) {
  const filename = packOutputLine.trim()
  if (!filename) {
    throw new Error("pnpm pack produced no tarball path")
  }
  if (isAbsolutePackPath(filename)) {
    return filename
  }
  return join(packsDir, basename(filename))
}
