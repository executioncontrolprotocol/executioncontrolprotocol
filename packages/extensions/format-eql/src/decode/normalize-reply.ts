import {
  ECP_HARNESS_REPLY_CITATION_KINDS,
  ECP_HARNESS_REPLY_SCHEMA,
  type HarnessReply,
} from "@executioncontrolprotocol/types"
import type { EqlReplyDoc } from "./ast.js"

const citationKinds = new Set<string>(Object.values(ECP_HARNESS_REPLY_CITATION_KINDS))

export function replyFromEql(doc: EqlReplyDoc): HarnessReply {
  return {
    schema: ECP_HARNESS_REPLY_SCHEMA,
    answer: doc.answer,
    ...(doc.citations.length > 0
      ? {
          citations: doc.citations.map((c) => ({
            kind: (citationKinds.has(c.kind) ? c.kind : "step") as "step",
            ...(c.id ? { id: c.id } : {}),
            ...(c.detail ? { detail: c.detail } : {}),
          })),
        }
      : {}),
  }
}
