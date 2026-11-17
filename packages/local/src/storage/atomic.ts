import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"

const RENAME_BACKOFF_MS = [20, 40, 80, 160, 320] as const
const LOCK_STALE_MS = 10_000

/** Rename implementation (overridable in tests). */
let renameImpl: typeof renameSync = renameSync

/**
 * Override rename for tests that simulate `EPERM`/`EBUSY`.
 * @category Storage
 */
export function setRenameImplForTests(impl: typeof renameSync | undefined): void {
  renameImpl = impl ?? renameSync
}

/**
 * Atomically write UTF-8 text: temp file, fsync, rename (with Windows retry).
 * @category Storage
 */
export async function atomicWriteText(targetPath: string, text: string): Promise<void> {
  mkdirSync(path.dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`
  const fd = openSync(tmp, "w")
  try {
    writeFileSync(fd, text, "utf8")
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    await renameWithRetry(tmp, targetPath)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // best-effort cleanup
    }
    throw error
  }
}

/**
 * Rename with Windows EPERM/EBUSY backoff.
 * @category Storage
 */
export async function renameWithRetry(from: string, to: string): Promise<void> {
  let last: unknown
  for (let attempt = 0; attempt <= RENAME_BACKOFF_MS.length; attempt++) {
    try {
      renameImpl(from, to)
      return
    } catch (error) {
      last = error
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EPERM" && code !== "EBUSY") throw error
      if (attempt >= RENAME_BACKOFF_MS.length) break
      await delay(RENAME_BACKOFF_MS[attempt]!)
    }
  }
  throw last
}

/**
 * Options for {@link withFileLock}.
 * @category Storage
 */
export interface WithFileLockOptions {
  /** Called once when waiting on an existing lock file (tests). */
  onWaiting?: () => void
}

/**
 * Hold an exclusive lock file for the duration of `fn`. Stale locks (>10 s) are reclaimed.
 * @category Storage
 */
export async function withFileLock<T>(
  targetPath: string,
  fn: () => Promise<T>,
  options?: WithFileLockOptions,
): Promise<T> {
  const lockPath = `${targetPath}.lock`
  mkdirSync(path.dirname(targetPath), { recursive: true })
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx")
      try {
        writeFileSync(fd, `${process.pid}\n${Date.now()}\n`, "utf8")
      } finally {
        closeSync(fd)
      }
      break
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EEXIST") throw error
      try {
        const age = Date.now() - statSync(lockPath).mtimeMs
        if (age > LOCK_STALE_MS) {
          unlinkSync(lockPath)
          continue
        }
      } catch {
        // race: lock disappeared
      }
      options?.onWaiting?.()
      await delay(20)
    }
  }
  try {
    return await fn()
  } finally {
    try {
      unlinkSync(lockPath)
    } catch {
      // ignore
    }
  }
}

/**
 * Constants exported for unit tests.
 * @category Storage
 */
export const ATOMIC_CONSTANTS = {
  RENAME_BACKOFF_MS,
  LOCK_STALE_MS,
} as const
