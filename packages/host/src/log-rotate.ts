import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, type WriteStream } from "node:fs"
import path from "node:path"

const MAX_BYTES = 5 * 1024 * 1024
const KEEP = 3

/**
 * Append-only log stream with 5 MB / keep-3 rotation.
 * @category Host
 */
export function openRotatingLog(filePath: string): WriteStream {
  mkdirSync(path.dirname(filePath), { recursive: true })
  rotateIfNeeded(filePath)
  const stream = createWriteStream(filePath, { flags: "a" })
  const originalWrite = stream.write.bind(stream)
  stream.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    rotateIfNeeded(filePath)
    return originalWrite(chunk as never, encoding as never, cb as never)
  }) as typeof stream.write
  return stream
}

function rotateIfNeeded(filePath: string): void {
  if (!existsSync(filePath)) return
  if (statSync(filePath).size < MAX_BYTES) return
  for (let i = KEEP - 1; i >= 1; i--) {
    const from = `${filePath}.${i}`
    const to = `${filePath}.${i + 1}`
    if (existsSync(from)) renameSync(from, to)
  }
  renameSync(filePath, `${filePath}.1`)
}
