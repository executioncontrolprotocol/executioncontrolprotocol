/** Split headerless EQL into WORKFLOW blocks. @category Harness */
export function splitWorkflowEqlBlocks(raw: string): string[] {
  const cleaned = raw
    .replace(/```[\w-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/@executioncontrolprotocol\/demo\.summarizes\b/g, "@executioncontrolprotocol/test.summarize")
    .trim()
  const lines = cleaned.split(/\r?\n/)
  const blocks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (/^WORKFLOW\s+\S/.test(line)) {
      if (current.length > 0) blocks.push(current.join("\n"))
      current = [line]
    } else if (current.length > 0) {
      current.push(line)
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"))
  return blocks.length > 0 ? blocks : [cleaned]
}

function blockCapabilityUses(block: string): string[] {
  return [...block.matchAll(/USES\s+(@\S+)/g)].map((match) => match[1]!)
}

/** Keep only the first WORKFLOW block when the model concatenates multiple examples. @category Harness */
export function takeFirstWorkflowEqlBlock(raw: string): string {
  const blocks = splitWorkflowEqlBlocks(raw)
  return blocks[0] ?? raw.trim()
}

/** Pick the WORKFLOW block that best matches required capability ids. @category Harness */
export function selectBestWorkflowEqlBlock(raw: string, requiredCapabilityIds: readonly string[]): string {
  const blocks = splitWorkflowEqlBlocks(raw)
  if (blocks.length <= 1) return blocks[0] ?? raw.trim()
  if (requiredCapabilityIds.length === 0) return takeFirstWorkflowEqlBlock(raw)

  let best = blocks[0]!
  let bestScore = Number.NEGATIVE_INFINITY
  for (const block of blocks) {
    const uses = blockCapabilityUses(block)
    const matched = requiredCapabilityIds.filter((cap) => uses.includes(cap)).length
    const extra = uses.filter((cap) => !requiredCapabilityIds.includes(cap)).length
    let score = matched * 10 - extra * 5 - Math.abs(uses.length - requiredCapabilityIds.length)
    if (matched === requiredCapabilityIds.length && uses.length === requiredCapabilityIds.length) {
      score += 50
    }
    if (score > bestScore) {
      bestScore = score
      best = block
    }
  }
  return best
}

function isValidStepId(id: string): boolean {
  return /^[a-zA-Z][\w-]*$/.test(id)
}

function parseStepAsAlias(stepLines: readonly string[]): string | undefined {
  for (const line of stepLines) {
    const match = line.match(/^\s*AS\s+(\S+)/)
    if (match?.[1] && isValidStepId(match[1])) {
      return match[1]
    }
  }
  return undefined
}

function parseStepLabelSlug(stepLines: readonly string[]): string | undefined {
  for (const line of stepLines) {
    const match = line.match(/^\s*LABEL\s+"([^"]+)"/)
    if (!match?.[1]) continue
    const slug = match[1]
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    if (slug && isValidStepId(slug)) {
      return slug
    }
  }
  return undefined
}

function rewriteStepLineId(stepLine: string, stepId: string): string {
  return stepLine.replace(/^STEP\s+\S+/, `STEP ${stepId}`)
}

function replaceRefStepId(line: string, fromId: string, toId: string): string {
  if (fromId === toId) return line
  return line.replace(new RegExp(`REF ${fromId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`, "g"), `REF ${toId}.`)
}

/**
 * Assign unique STEP ids when the model repeats a capability suffix (e.g. generate twice).
 * Prefers each step's AS alias when present.
 * @category Harness
 */
export function deduplicateWorkflowEqlStepIds(raw: string): string {
  const block = takeFirstWorkflowEqlBlock(raw)
  const { header, steps } = parseWorkflowEqlStepBlocks(block)
  if (steps.length <= 1) {
    return raw
  }

  const usedIds = new Set<string>()
  const resolved: { originalId: string; finalId: string; lines: string[] }[] = []

  for (const step of steps) {
    const asAlias = parseStepAsAlias(step.lines)
    const labelSlug = parseStepLabelSlug(step.lines)
    let finalId = step.stepId

    if (asAlias && !usedIds.has(asAlias)) {
      finalId = asAlias
    } else if (usedIds.has(finalId)) {
      if (labelSlug && !usedIds.has(labelSlug)) {
        finalId = labelSlug
      } else {
        let suffix = 2
        while (usedIds.has(`${step.stepId}-${suffix}`)) {
          suffix += 1
        }
        finalId = `${step.stepId}-${suffix}`
      }
    }

    const lines =
      finalId === step.stepId ? [...step.lines] : [rewriteStepLineId(step.lines[0]!, finalId), ...step.lines.slice(1)]
    usedIds.add(finalId)
    resolved.push({ originalId: step.stepId, finalId, lines })
  }

  for (let i = 0; i < resolved.length; i += 1) {
    const { originalId, finalId } = resolved[i]!
    if (originalId === finalId) continue
    for (let j = i + 1; j < resolved.length; j += 1) {
      resolved[j]!.lines = resolved[j]!.lines.map((line) => replaceRefStepId(line, originalId, finalId))
    }
  }

  return [...header, ...resolved.flatMap((step) => step.lines)].join("\n")
}

/** Normalize common small-model EQL typos before decode. @category Harness */
export function normalizeCreateEqlRawOutput(raw: string): string {
  return deduplicateWorkflowEqlStepIds(
    raw
      .replace(/@executioncontrolprotocol\/demo\.summarizes\b/g, "@executioncontrolprotocol/test.summarize")
      .replace(/USES (@\S+)\s+"([^"]+)"/g, "USES $1\n  LABEL \"$2\"")
  )
}

interface WorkflowEqlStepBlock {
  /** Step id from the STEP line. */
  stepId: string
  /** Capability id from the STEP USES line. */
  uses: string
  /** Raw STEP block lines. */
  lines: string[]
}

function parseWorkflowEqlStepBlocks(block: string): {
  header: string[]
  steps: WorkflowEqlStepBlock[]
} {
  const lines = block.split(/\r?\n/)
  const header: string[] = []
  const steps: WorkflowEqlStepBlock[] = []
  let current: string[] = []
  let currentUses: string | undefined
  let currentStepId: string | undefined

  for (const line of lines) {
    if (/^WORKFLOW\s/.test(line)) {
      header.push(line)
      continue
    }
    const stepMatch = line.match(/^STEP\s+(\S+)\s+USES\s+(@\S+)/)
    if (stepMatch) {
      if (currentUses && currentStepId && current.length > 0) {
        steps.push({ stepId: currentStepId, uses: currentUses, lines: current })
      }
      current = [line]
      currentStepId = stepMatch[1]
      currentUses = stepMatch[2]
      continue
    }
    if (currentUses) {
      current.push(line)
    } else {
      header.push(line)
    }
  }
  if (currentUses && currentStepId && current.length > 0) {
    steps.push({ stepId: currentStepId, uses: currentUses, lines: current })
  }
  return { header, steps }
}

function hasSameUsesDistinctStepIds(steps: readonly WorkflowEqlStepBlock[]): boolean {
  const byUses = new Map<string, Set<string>>()
  for (const step of steps) {
    const set = byUses.get(step.uses) ?? new Set<string>()
    set.add(step.stepId)
    byUses.set(step.uses, set)
  }
  for (const ids of byUses.values()) {
    if (ids.size > 1) {
      return true
    }
  }
  return false
}

/**
 * Drop STEP blocks whose USES is not required by the user request (nano harness policy).
 * @category Harness
 */
export function filterWorkflowEqlToRequiredCapabilities(
  raw: string,
  requiredCapabilityIds: readonly string[]
): string {
  if (requiredCapabilityIds.length === 0) {
    return raw
  }
  const block = takeFirstWorkflowEqlBlock(raw)
  const { header, steps } = parseWorkflowEqlStepBlocks(block)
  const matchingSteps = steps.filter((step) => requiredCapabilityIds.includes(step.uses))

  if (hasSameUsesDistinctStepIds(matchingSteps)) {
    return [...header, ...matchingSteps.flatMap((step) => step.lines)].join("\n")
  }

  const byCap = new Map<string, WorkflowEqlStepBlock>()
  for (const step of steps) {
    if (requiredCapabilityIds.includes(step.uses) && !byCap.has(step.uses)) {
      byCap.set(step.uses, step)
    }
  }
  const hasAll = requiredCapabilityIds.every((id) => byCap.has(id))
  if (!hasAll) {
    return raw
  }
  const kept = requiredCapabilityIds.map((id) => byCap.get(id)!)
  return [...header, ...kept.flatMap((step) => step.lines)].join("\n")
}

function capabilityStepId(capabilityId: string): string {
  return capabilityId.split(".").pop() ?? "step"
}

function orderedCapabilityIdsFromRequest(
  request: string,
  requiredCapabilityIds: readonly string[]
): string[] {
  const ordered = [
    ...new Set(
      [...request.matchAll(/@executioncontrolprotocol\/[\w.-]+/g)].map((match) => match[0]!)
    ),
  ].filter((id) => requiredCapabilityIds.includes(id))
  if (ordered.length === requiredCapabilityIds.length) {
    return ordered
  }
  return [...requiredCapabilityIds]
}

function defaultStepLines(capabilityId: string, priorEchoStepId?: string): string[] {
  const stepId = capabilityStepId(capabilityId)
  const lines = [`  LABEL "${stepId.charAt(0).toUpperCase()}${stepId.slice(1)}"`]
  if (capabilityId.endsWith(".echo")) {
    lines.push(`  WITH value = "hello"`)
  } else if (capabilityId.endsWith(".validate")) {
    lines.push(`  WITH payload = {"ok": true}`)
  } else if (capabilityId.endsWith(".summarize")) {
    lines.push(`  WITH payload = REF ${priorEchoStepId ?? "echo"}.output`)
  } else if (capabilityId.endsWith(".translate")) {
    lines.push(`  WITH text = REF ${priorEchoStepId ?? "echo"}.output`)
  }
  lines.push(`  AS ${stepId}`)
  return lines
}

/**
 * Synthesize create EQL when the model omits required capability steps but the request names them explicitly.
 * @category Harness
 */
export function synthesizeCreateEqlFromRequiredCapabilities(
  request: string,
  requiredCapabilityIds: readonly string[]
): string | undefined {
  if (requiredCapabilityIds.length < 2) {
    return undefined
  }
  const mentioned = requiredCapabilityIds.filter((id) => request.includes(id))
  if (mentioned.length !== requiredCapabilityIds.length) {
    return undefined
  }
  const ordered = orderedCapabilityIdsFromRequest(request, requiredCapabilityIds)
  const workflowIdMatch = request.match(/\bworkflow\s+id\s+(\S+)/i)
  const workflowId = workflowIdMatch?.[1] ?? "generated-workflow"
  const lines = [`WORKFLOW ${workflowId} "Generated workflow"`]
  let priorEchoStepId: string | undefined
  for (const capabilityId of ordered) {
    const stepId = capabilityStepId(capabilityId)
    lines.push(`STEP ${stepId} USES ${capabilityId}`)
    lines.push(...defaultStepLines(capabilityId, priorEchoStepId))
    if (capabilityId.endsWith(".echo")) {
      priorEchoStepId = stepId
    }
  }
  return lines.join("\n")
}


/** True when every required capability appears in the selected workflow block. @category Harness */
export function createEqlIncludesRequiredCapabilities(
  raw: string,
  requiredCapabilityIds: readonly string[]
): boolean {
  if (requiredCapabilityIds.length === 0) {
    return true
  }
  const uses = blockCapabilityUses(selectBestWorkflowEqlBlock(raw, requiredCapabilityIds))
  return requiredCapabilityIds.every((id) => uses.includes(id))
}
