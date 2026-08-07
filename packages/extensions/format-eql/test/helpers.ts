import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { UtilityCapabilityContext } from "@executioncontrolprotocol/core"
import type {
  EcpPatchDocument,
  EnvironmentDescriptor,
  EnvironmentManifest,
  WorkflowManifest,
} from "@executioncontrolprotocol/types"
import { decodeFromEql } from "../src/decode/decode-eql.js"
import { encodeToEql } from "../src/encode/encode-eql.js"
import type { EqlDecodeInput, EqlEncodeInput } from "../src/schemas.js"

const testDir = dirname(fileURLToPath(import.meta.url))

export const testCtx = {} as UtilityCapabilityContext

export function loadWorkflowFixture(name: string): WorkflowManifest {
  const path = join(testDir, "fixtures", "workflows", `${name}.json`)
  return JSON.parse(readFileSync(path, "utf8")) as WorkflowManifest
}

export function loadPatchFixture(name: string): EcpPatchDocument {
  const path = join(testDir, "fixtures", "patches", `${name}.json`)
  return JSON.parse(readFileSync(path, "utf8")) as EcpPatchDocument
}

export function encodeWorkflow(
  manifest: WorkflowManifest,
  options?: EqlEncodeInput["options"]
) {
  return encodeToEql(
    { source: manifest, sourceSchema: "@executioncontrolprotocol.workflow", options },
    testCtx
  )
}

export function decodeWorkflow(text: string, options?: EqlDecodeInput["options"]) {
  return decodeFromEql(
    {
      input: text,
      targetSchema: "@executioncontrolprotocol.workflow",
      options,
    },
    testCtx
  )
}

export function encodePatch(patch: EcpPatchDocument, options?: EqlEncodeInput["options"]) {
  return encodeToEql(
    { source: patch, sourceSchema: "@executioncontrolprotocol.patch", options },
    testCtx
  )
}

export function decodePatch(text: string, options?: EqlDecodeInput["options"]) {
  return decodeFromEql(
    {
      input: text,
      targetSchema: "@executioncontrolprotocol.patch",
      options,
    },
    testCtx
  )
}

export function encodeEnvironment(
  manifest: EnvironmentManifest,
  options?: EqlEncodeInput["options"]
) {
  return encodeToEql(
    { source: manifest, sourceSchema: "@executioncontrolprotocol.environment", options },
    testCtx
  )
}

export function decodeEnvironment(text: string, options?: EqlDecodeInput["options"]) {
  return decodeFromEql(
    {
      input: text,
      targetSchema: "@executioncontrolprotocol.environment",
      options,
    },
    testCtx
  )
}

export function encodeDescribe(
  descriptor: EnvironmentDescriptor,
  options?: EqlEncodeInput["options"]
) {
  return encodeToEql(
    { source: descriptor, sourceSchema: "@executioncontrolprotocol.environment.describe", options },
    testCtx
  )
}

export function decodeDescribe(text: string, options?: EqlDecodeInput["options"]) {
  return decodeFromEql(
    {
      input: text,
      targetSchema: "@executioncontrolprotocol.environment.describe",
      options,
    },
    testCtx
  )
}
