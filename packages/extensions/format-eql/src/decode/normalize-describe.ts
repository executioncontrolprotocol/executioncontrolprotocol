import { LATEST_ECP_VERSION, type EnvironmentDescriptor } from "@executioncontrolprotocol/types"
import type { EqlDescribeDoc } from "./ast.js"

function inferExtension(capabilityId: string): string {
  const lastDot = capabilityId.lastIndexOf(".")
  if (lastDot > 0) {
    return capabilityId.slice(0, lastDot)
  }
  return capabilityId
}

export function describeFromEql(doc: EqlDescribeDoc): EnvironmentDescriptor {
  return {
    schema: "@executioncontrolprotocol.environment.describe",
    version: LATEST_ECP_VERSION,
    environment: {
      id: doc.environmentId,
      ...(doc.environmentLabel ? { label: doc.environmentLabel } : {}),
    },
    runtime: {
      id: doc.runtime?.id ?? "@executioncontrolprotocol/in-memory",
      ...(doc.runtime?.label ? { label: doc.runtime.label } : {}),
      features: doc.runtime?.features ?? {},
    },
    extensions: doc.extensions.map((e) => ({
      id: e.id,
      order: e.order,
      ...(e.label ? { label: e.label } : {}),
      capabilities: e.capabilities,
    })),
    capabilities: doc.capabilities.map((c) => ({
      id: c.id,
      ...(c.label ? { label: c.label } : {}),
      extension: c.extension ?? inferExtension(c.id),
      ...(Object.keys(c.inputs).length > 0 ? { inputSchema: c.inputs } : {}),
      ...(Object.keys(c.outputs).length > 0 ? { outputSchema: c.outputs } : {}),
    })),
    policies: doc.policies.map((p) => ({
      id: p.id,
      ...(p.label ? { label: p.label } : {}),
      ...(p.summary ? { summary: p.summary } : {}),
    })),
  }
}
