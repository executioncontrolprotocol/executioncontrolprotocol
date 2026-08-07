import type {
  BranchNode,
  LoopNode,
  ParallelNode,
  StepNode,
  WorkflowNode,
} from "@executioncontrolprotocol/types"
import { slugify } from "../util/slug.js"
import { renderExprValue } from "./render-expr.js"
import { renderInputValue, type ImportNeeds } from "./render-value.js"

function renderStep(step: StepNode, needs: ImportNeeds, indent: string): string {
  const lines: string[] = []
  const labelArg = step.label ? `, ${JSON.stringify(step.label)}` : ""
  lines.push(`${indent}step(${JSON.stringify(step.uses)}${labelArg})`)
  const defaultId = slugify(step.label ?? String(step.uses))
  if (step.id && (step.id !== defaultId || step.as !== undefined)) {
    lines.push(`${indent}  .id(${JSON.stringify(step.id)})`)
  }
  if (step.when) {
    needs.expr = true
    lines.push(`${indent}  .when(${renderExprValue(step.when)})`)
  }
  if (step.input && Object.keys(step.input).length > 0) {
    const inputParts = Object.entries(step.input).map(
      ([k, v]) => `${JSON.stringify(k)}: ${renderInputValue(v, needs)}`
    )
    lines.push(`${indent}  .with({ ${inputParts.join(", ")} })`)
  }
  if (step.as) {
    if (step.mode) {
      lines.push(
        `${indent}  .as(${JSON.stringify(step.as)}, { mode: ${JSON.stringify(step.mode)} })`
      )
    } else {
      lines.push(`${indent}  .as(${JSON.stringify(step.as)})`)
    }
  }
  return lines.join("\n")
}

function renderNodes(nodes: WorkflowNode[], needs: ImportNeeds, indent: string): string {
  return nodes
    .map((node) => {
      if (!node.type || node.type === "step") {
        return renderStep(node as StepNode, needs, indent)
      }
      if (node.type === "loop") {
        needs.loop = true
        const loop = node as LoopNode
        const opts: string[] = []
        if (loop.label) opts.push(`label: ${JSON.stringify(loop.label)}`)
        if (loop.id) opts.push(`id: ${JSON.stringify(loop.id)}`)
        if (loop.until) {
          needs.expr = true
          opts.push(`until: ${renderExprValue(loop.until)}`)
        }
        if (loop.maxRounds !== undefined) opts.push(`maxRounds: ${loop.maxRounds}`)
        const inner = renderNodes(loop.steps, needs, indent + "    ")
        return `${indent}loop(\n${indent}  { ${opts.join(", ")} },\n${indent}  [\n${inner},\n${indent}  ],\n${indent})`
      }
      if (node.type === "parallel") {
        needs.parallel = true
        const par = node as ParallelNode
        const opts: string[] = []
        if (par.id) opts.push(`id: ${JSON.stringify(par.id)}`)
        if (par.label) opts.push(`label: ${JSON.stringify(par.label)}`)
        const branches = par.branches
          .map((b) => {
            const inner = renderNodes(b, needs, indent + "      ")
            return `${indent}    [\n${inner},\n${indent}    ]`
          })
          .join(",\n")
        const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : ""
        return `${indent}parallel(\n${indent}  [\n${branches},\n${indent}  ]${optStr},\n${indent})`
      }
      needs.branch = true
      const branch = node as BranchNode
      const steps = branch.branches
        .flatMap((b) =>
          b.steps.map((s) => {
            const stepNode = s as StepNode
            const withWhen = b.when ? { ...stepNode, when: b.when } : stepNode
            if (b.when) needs.expr = true
            return renderStep(withWhen, needs, indent + "    ")
          })
        )
        .join(",\n")
      const opts: string[] = []
      if (branch.id) opts.push(`id: ${JSON.stringify(branch.id)}`)
      if (branch.label) opts.push(`label: ${JSON.stringify(branch.label)}`)
      const optStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : ""
      return `${indent}branch(\n${indent}  [\n${steps},\n${indent}  ]${optStr},\n${indent})`
    })
    .join(",\n")
}

export { renderNodes, renderStep }
