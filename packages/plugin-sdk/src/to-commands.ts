import { Args, Flags, type Command } from "@oclif/core"
import type {
  CapabilityDefinition,
  ExtensionDefinition,
  PolicyDefinition,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import {
  ECP_INPUT_INVALID,
  ECP_POLICY_DENIED,
  ECP_STEP_FAILED,
  EXIT_FAILED,
  EXIT_PAUSED,
  EXIT_USAGE,
} from "./codes.js"
import type { OperationDefinition } from "./define-operation.js"
import { EcpCommand } from "./ecp-command.js"
import { EcpCliError } from "./errors.js"
import { flagsFromSchema } from "./flags-from-schema.js"
import { getHost } from "./host.js"
import { descriptionFromMetadata, examplesFromFields } from "./help-text.js"
import { loadInputFile, mergeInput } from "./input-merge.js"
import { toKebabCase } from "./kebab.js"
import { schemaFieldNames } from "./schema-fields.js"

const INPUT_FLAG = Flags.string({
  description: "JSON object for the full input, from a file or stdin (`-`)",
})

function isPolicyDefinition(source: unknown): source is PolicyDefinition {
  return (
    typeof source === "object" &&
    source !== null &&
    "hooks" in source &&
    !("capabilities" in source) &&
    !("handler" in source) &&
    "id" in source
  )
}

function parseMerged(
  schema: z.ZodType | undefined,
  merged: Record<string, unknown>
): Record<string, unknown> {
  if (!schema) return merged
  const parsed = schema.safeParse(merged)
  if (parsed.success) return parsed.data as Record<string, unknown>
  const issue = parsed.error.issues[0]
  const path = issue?.path.length ? issue.path.map(String).join(".") : undefined
  throw new EcpCliError(
    ECP_INPUT_INVALID,
    issue?.message ?? "Invalid input",
    { path, exitCode: EXIT_USAGE }
  )
}

function capabilityCommand(
  extension: ExtensionDefinition,
  capability: CapabilityDefinition
): Command.Class {
  const commandId = `${extension.name}:${capability.name}`
  const schema = capability.inputSchema
  const fields = schemaFieldNames(schema)
  const generatedFlags = flagsFromSchema(schema)
  const summary = capability.metadata?.summary ?? capability.name
  const description = descriptionFromMetadata(capability.metadata)
  const examples = examplesFromFields("ecp", commandId, fields.filter((f) => generatedFlags[toKebabCase(f)]))

  class CapabilityCommand extends EcpCommand {
    static id = commandId
    static summary = summary
    static description = description
    static examples = examples
    static flags = {
      ...generatedFlags,
      input: INPUT_FLAG,
    }

    async run(): Promise<unknown> {
      const parsed = await this.parse(CapabilityCommand)
      const base = await loadInputFile(
        typeof parsed.flags.input === "string" ? parsed.flags.input : undefined
      )
      const merged = mergeInput(
        base,
        parsed.flags as Record<string, unknown>,
        this.argv,
        fields
      )
      const input = parseMerged(schema, merged)
      const host = getHost(this.config)
      const result = await host.ecp.invoke(capability.id).with(input).process()
      if (!result.success) {
        const diagnostic = result.diagnostics[0]
        const paused =
          diagnostic?.code === ECP_POLICY_DENIED ||
          /\bpaused\b/i.test(diagnostic?.message ?? "")
        throw new EcpCliError(
          diagnostic?.code ?? ECP_STEP_FAILED,
          diagnostic?.message ?? "Capability invoke did not succeed",
          {
            path: diagnostic?.path,
            suggestions: diagnostic?.suggestions,
            exitCode: paused ? EXIT_PAUSED : EXIT_FAILED,
          }
        )
      }
      this.writeSuccess(result.result)
      return result.result
    }
  }

  return CapabilityCommand
}

function operationCommand(operation: OperationDefinition): Command.Class {
  const positional = operation.metadata.cli?.args ?? []
  const schema = operation.inputSchema
  const fields = schemaFieldNames(schema)
  const args: Record<string, ReturnType<typeof Args.string>> = {}
  for (const field of positional) {
    const kebab = toKebabCase(field)
    const fieldSchema =
      schema instanceof z.ZodObject
        ? (schema.shape as Record<string, z.ZodTypeAny>)[field]
        : undefined
    args[kebab] = Args.string({
      required: fieldSchema ? !fieldSchema.isOptional() : true,
      description: field,
    })
  }
  const generatedFlags = flagsFromSchema(schema, ["json", "help"])
  for (const field of positional) delete generatedFlags[toKebabCase(field)]

  class OperationCommand extends EcpCommand {
    static id = operation.name
    static summary = operation.metadata.summary
    static description = descriptionFromMetadata(operation.metadata)
    static examples = operation.metadata.examples ?? []
    static args = args
    static flags = generatedFlags

    async run(): Promise<unknown> {
      const parsed = await this.parse(OperationCommand)
      const flagsAndArgs: Record<string, unknown> = {
        ...(parsed.flags as Record<string, unknown>),
        ...(parsed.args as Record<string, unknown>),
      }
      const merged = mergeInput({}, flagsAndArgs, this.argv, fields, [
        ...fields,
        ...fields.map(toKebabCase),
      ])
      const input = parseMerged(schema, merged)
      let host
      try {
        host = getHost(this.config)
      } catch {
        host = undefined
      }
      const data = await operation.handler(input, {
        host,
        config: this.config,
        argv: this.argv,
        json: this.jsonEnabled(),
      })
      this.writeSuccess(data)
      return data
    }
  }

  return OperationCommand
}

/**
 * Generate oclif command classes from an extension, a policy, or host operations.
 * @category CLI
 */
export function toCommands(
  source: ExtensionDefinition | PolicyDefinition | OperationDefinition[]
): Record<string, Command.Class> {
  if (Array.isArray(source)) {
    const map: Record<string, Command.Class> = {}
    for (const operation of source) {
      map[operation.name] = operationCommand(operation)
    }
    return map
  }
  if (isPolicyDefinition(source)) return {}
  const extension = source as ExtensionDefinition
  if (!Array.isArray(extension.capabilities)) return {}
  const map: Record<string, Command.Class> = {}
  for (const capability of extension.capabilities) {
    const id = `${extension.name}:${capability.name}`
    map[id] = capabilityCommand(extension, capability)
  }
  return map
}
