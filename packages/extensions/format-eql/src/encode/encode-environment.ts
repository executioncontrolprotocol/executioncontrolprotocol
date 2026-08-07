import type { EnvironmentManifest } from "@executioncontrolprotocol/types"
import type { EcpFormatOptions } from "@executioncontrolprotocol/types"
import type { EqlFormatOptions } from "../schemas.js"
import { EqlWriter, formatLiteral } from "./writer.js"

function writeBindingConfig(
  config: Record<string, unknown> | undefined,
  depth: number,
  writer: EqlWriter
): void {
  if (!config) return
  for (const [key, value] of Object.entries(config)) {
    writer.writeln(`WITH ${key} = ${formatLiteral(value, writer.quote)}`, depth)
  }
}

export function encodeEnvironmentToEql(
  manifest: EnvironmentManifest,
  options?: EcpFormatOptions & EqlFormatOptions,
  includeHeader = true
): string {
  const writer = new EqlWriter(options)
  if (includeHeader) {
    writer.writeln(`ECP @executioncontrolprotocol.environment ${manifest.version}`)
  }
  const envLine = manifest.environment.label
    ? `ENVIRONMENT ${manifest.environment.id} ${formatLiteral(manifest.environment.label, writer.quote)}`
    : `ENVIRONMENT ${manifest.environment.id}`
  writer.writeln(envLine)

  if (manifest.runtime) {
    writer.writeln(`RUNTIME ${manifest.runtime.id}`)
    if (manifest.runtime.label) {
      writer.writeln(`LABEL ${formatLiteral(manifest.runtime.label, writer.quote)}`, 1)
    }
    writeBindingConfig(manifest.runtime.config, 1, writer)
  }

  for (const ext of manifest.extensions ?? []) {
    writer.writeln(`EXTENSION ${ext.id} ORDER ${ext.order}`)
    if (ext.label) {
      writer.writeln(`LABEL ${formatLiteral(ext.label, writer.quote)}`, 1)
    }
    writeBindingConfig(ext.config, 1, writer)
  }

  for (const pol of manifest.policies ?? []) {
    writer.writeln(`POLICY ${pol.id} ORDER ${pol.order}`)
    if (pol.label) {
      writer.writeln(`LABEL ${formatLiteral(pol.label, writer.quote)}`, 1)
    }
    writeBindingConfig(pol.config, 1, writer)
  }

  return writer.toString()
}
