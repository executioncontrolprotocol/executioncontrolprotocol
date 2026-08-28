import { readFile } from "node:fs/promises"

/**
 * Read a host file path into bytes for {@link resolveMedia} on Node.
 * @category Loaders
 */
export async function readMediaFileFromPath(path: string): Promise<Uint8Array> {
  const buf = await readFile(path)
  return new Uint8Array(buf)
}
