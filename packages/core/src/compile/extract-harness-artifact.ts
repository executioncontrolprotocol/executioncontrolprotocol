import {
  ECP_HARNESS_REPLY_SCHEMA,
  ECP_INTENT_SCHEMA,
  ecpIntentSchema,
  harnessReplySchema,
  type EcpIntent,
  type HarnessReply,
} from "@executioncontrolprotocol/types"
import { zodIssuesToValidationIssues } from "../validate/zod-mapper.js"

/** Schema ids supported by {@link extractArtifactFromModule}. @category Compile */
export type HarnessArtifactSchema =
  | typeof ECP_INTENT_SCHEMA
  | typeof ECP_HARNESS_REPLY_SCHEMA

const ARTIFACT_EXPORT_NAMES = ["default", "intent", "reply", "result"] as const

function schemaValidator(
  expectedSchema: HarnessArtifactSchema
): typeof ecpIntentSchema | typeof harnessReplySchema {
  if (expectedSchema === ECP_INTENT_SCHEMA) {
    return ecpIntentSchema
  }
  return harnessReplySchema
}

/**
 * Extract and validate a harness artifact from evaluated module exports.
 * @category Compile
 */
export function extractArtifactFromModule<T extends EcpIntent | HarnessReply>(
  mod: Record<string, unknown>,
  expectedSchema: HarnessArtifactSchema
): T {
  const validator = schemaValidator(expectedSchema)
  for (const name of ARTIFACT_EXPORT_NAMES) {
    const exp = mod[name]
    if (!exp || typeof exp !== "object") continue
    const candidate = exp as Record<string, unknown>
    if (candidate.schema !== expectedSchema) continue
    const parsed = validator.safeParse(candidate)
    if (parsed.success) {
      return parsed.data as T
    }
    const issues = zodIssuesToValidationIssues(parsed.error.issues)
    const detail = issues.map((i) => i.message).join("; ")
    throw new Error(`Invalid ${expectedSchema} export "${name}": ${detail}`)
  }
  throw new Error(
    `Module must export ${expectedSchema} (default, intent, reply, or result)`
  )
}
