import type { EnvironmentDescriptor } from "@executioncontrolprotocol/types"
import type { EcpFormatOptions } from "@executioncontrolprotocol/types"
import type { EqlFormatOptions } from "../schemas.js"
import { isEqlTypesRecord } from "../validate-environment.js"
import { EqlWriter, formatLiteral } from "./writer.js"

function writeTypeMap(
  prefix: "WITH" | "OUT",
  types: Record<string, string> | undefined,
  depth: number,
  writer: EqlWriter
): void {
  if (!types) return
  for (const [name, type] of Object.entries(types)) {
    writer.writeln(`${prefix} ${name}:${type}`, depth)
  }
}

export function encodeDescribeToEql(
  descriptor: EnvironmentDescriptor,
  options?: EcpFormatOptions & EqlFormatOptions,
  includeHeader = true
): string {
  const writer = new EqlWriter(options)
  if (includeHeader) {
    writer.writeln(`ECP @executioncontrolprotocol.environment.describe ${descriptor.version}`)
  }

  const envLine = descriptor.environment.label
    ? `ENVIRONMENT ${descriptor.environment.id} ${formatLiteral(descriptor.environment.label, writer.quote)}`
    : `ENVIRONMENT ${descriptor.environment.id}`
  writer.writeln(envLine)

  writer.writeln(`RUNTIME ${descriptor.runtime.id}`)
  if (descriptor.runtime.label) {
    writer.writeln(`LABEL ${formatLiteral(descriptor.runtime.label, writer.quote)}`, 1)
  }
  for (const [feature, enabled] of Object.entries(descriptor.runtime.features)) {
    if (enabled) {
      writer.writeln(`FEATURE ${feature} = true`, 1)
    }
  }

  for (const ext of descriptor.extensions) {
    writer.writeln(`EXTENSION ${ext.id} ORDER ${ext.order}`)
    if (ext.label) {
      writer.writeln(`LABEL ${formatLiteral(ext.label, writer.quote)}`, 1)
    }
    if (ext.capabilities.length > 0) {
      writer.writeln(`CAPABILITIES ${ext.capabilities.join(" ")}`, 1)
    }
  }

  for (const cap of descriptor.capabilities) {
    writer.writeln(`CAPABILITY ${cap.id}`)
    if (cap.label) {
      writer.writeln(`LABEL ${formatLiteral(cap.label, writer.quote)}`, 1)
    }
    if (cap.extension) {
      writer.writeln(`EXTENSION ${cap.extension}`, 1)
    }
    const inputs = isEqlTypesRecord(cap.inputSchema) ? cap.inputSchema : undefined
    const outputs = isEqlTypesRecord(cap.outputSchema) ? cap.outputSchema : undefined
    writeTypeMap("WITH", inputs, 1, writer)
    writeTypeMap("OUT", outputs, 1, writer)
  }

  for (const pol of descriptor.policies) {
    writer.writeln(`POLICY ${pol.id}`)
    if (pol.label) {
      writer.writeln(`LABEL ${formatLiteral(pol.label, writer.quote)}`, 1)
    }
    if (pol.summary) {
      writer.writeln(`SUMMARY ${formatLiteral(pol.summary, writer.quote)}`, 1)
    }
  }

  return writer.toString()
}
