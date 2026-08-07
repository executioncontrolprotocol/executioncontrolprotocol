import { LATEST_ECP_VERSION, type EnvironmentManifest } from "@executioncontrolprotocol/types"
import type { EqlEnvironmentDoc } from "./ast.js"

export function environmentFromEql(doc: EqlEnvironmentDoc): EnvironmentManifest {
  return {
    schema: "@executioncontrolprotocol.environment",
    version: LATEST_ECP_VERSION,
    environment: {
      id: doc.environmentId,
      ...(doc.environmentLabel ? { label: doc.environmentLabel } : {}),
    },
    ...(doc.runtime
      ? {
          runtime: {
            id: doc.runtime.id,
            ...(doc.runtime.label ? { label: doc.runtime.label } : {}),
            ...(Object.keys(doc.runtime.config).length > 0
              ? { config: doc.runtime.config }
              : {}),
          },
        }
      : {}),
    ...(doc.extensions.length > 0
      ? {
          extensions: doc.extensions.map((e) => ({
            id: e.id,
            order: e.order,
            ...(e.label ? { label: e.label } : {}),
            ...(Object.keys(e.config).length > 0 ? { config: e.config } : {}),
          })),
        }
      : {}),
    ...(doc.policies.length > 0
      ? {
          policies: doc.policies.map((p) => ({
            id: p.id,
            order: p.order,
            ...(p.label ? { label: p.label } : {}),
            ...(Object.keys(p.config).length > 0 ? { config: p.config } : {}),
          })),
        }
      : {}),
  }
}
