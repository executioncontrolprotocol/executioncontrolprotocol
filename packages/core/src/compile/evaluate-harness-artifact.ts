/** Evaluate ESM harness artifact module code (Node host: temp file + dynamic import). */
export async function evaluateHarnessArtifactModule(
  code: string,
  _filename = "artifact.js"
): Promise<Record<string, unknown>> {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { pathToFileURL } = await import("node:url")

  const dir = await mkdtemp(join(tmpdir(), "ecp-compile-artifact-"))
  const file = join(dir, "artifact.mjs")
  try {
    await writeFile(file, code, "utf8")
    return (await import(pathToFileURL(file).href)) as Record<string, unknown>
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
