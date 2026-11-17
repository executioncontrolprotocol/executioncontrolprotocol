import type { Command } from "@oclif/core"

/**
 * Help quality problem for one command.
 * @category CLI
 */
export interface HelpQualityIssue {
  /** Command id or path. */
  commandId: string
  /** What failed. */
  message: string
}

/**
 * Validate oclif help fields on an ECP command class.
 * @category CLI
 */
export function checkCommandHelp(commandId: string, command: typeof Command): HelpQualityIssue[] {
  const issues: HelpQualityIssue[] = []
  const description = command.description
  if (!description || description.trim().length === 0) {
    issues.push({ commandId, message: "missing description" })
  }
  const examples = command.examples ?? []
  if (examples.length === 0) {
    issues.push({ commandId, message: "missing examples" })
  }
  for (const [index, example] of examples.entries()) {
    if (typeof example === "string") {
      if (example.trim().length === 0) issues.push({ commandId, message: `example ${index} has empty command` })
      continue
    }
    if (!example.command || example.command.trim().length === 0) {
      issues.push({ commandId, message: `example ${index} has empty command` })
    }
  }
  const flags = Object.values(command.flags ?? {})
  for (const flag of flags) {
    if (!flag.description || flag.description.trim().length === 0) {
      issues.push({ commandId, message: `flag ${flag.name ?? "?"} missing description` })
    }
  }
  const args = Object.values(command.args ?? {})
  for (const arg of args) {
    if (!arg.description || arg.description.trim().length === 0) {
      issues.push({ commandId, message: `arg missing description` })
    }
  }
  // Help is read by people and agents using the published CLI, who don't have the repo's specs.
  const texts = [
    description ?? "",
    ...examples.map((example) => (typeof example === "string" ? example : (example.description ?? ""))),
    ...flags.map((flag) => flag.description ?? ""),
    ...args.map((arg) => arg.description ?? ""),
  ]
  for (const text of texts) {
    if (INTERNAL_REFERENCE.test(text)) {
      issues.push({ commandId, message: `help text refers to internal docs: "${text.slice(0, 60)}"` })
    }
  }
  return issues
}

/** Wording that only makes sense inside this repository (spec numbers, the error catalogue). */
const INTERNAL_REFERENCE = /\bspec\s*\d+|\bcatalogue\b/i