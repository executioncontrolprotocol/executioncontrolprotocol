import { createGenerator } from "ts-json-schema-generator"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(pkgRoot, "dist", "schemas")
mkdirSync(outDir, { recursive: true })

const baseConfig = {
  path: join(pkgRoot, "src", "index.ts"),
  tsconfig: join(pkgRoot, "tsconfig.json"),
  skipTypeCheck: true,
  extraTags: ["category"],
}

/** @type {Array<{ type: string; file: string }>} */
const schemas = [
  { type: "WorkflowManifest", file: "workflow.manifest.json" },
  { type: "EnvironmentManifest", file: "environment.manifest.json" },
  { type: "EnvironmentDescriptor", file: "environment.describe.json" },
  { type: "RunResult", file: "run.result.json" },
  { type: "RunRequest", file: "run.request.json" },
  { type: "ValidationResult", file: "validation.result.json" },
  { type: "SearchResult", file: "environment.search.json" },
  { type: "EncodeResultDocument", file: "encode.result.json" },
  { type: "DecodeResultDocument", file: "decode.result.json" },
  { type: "EcpPatchDocumentRecord", file: "patch.json" },
  { type: "PatchResultDocument", file: "patch.result.json" },
]

for (const { type, file } of schemas) {
  const generator = createGenerator({ ...baseConfig, type })
  const schema = generator.createSchema(type)
  schema.$id = `https://ecp.dev/schemas/${file}`
  writeFileSync(join(outDir, file), `${JSON.stringify(schema, null, 2)}\n`, "utf8")
}

console.log(`Wrote ${schemas.length} schemas to ${outDir}`)
