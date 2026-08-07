/**
 * Repair common 1B workflow JSON mistakes before decode.
 * @category Harness
 */
export function repairWorkflowJsonSyntax(raw: string): string {
  let next = raw.trim()

  next = next.replace(/(\})\s*\]+\s*$/, "$1")

  try {
    JSON.parse(next)
  } catch {
    const withClose = next + "}"
    try {
      JSON.parse(withClose)
      next = withClose
    } catch {
      // fall through
    }
  }

  next = hoistWorkflowStepsInRawJson(next)

  try {
    JSON.parse(next)
  } catch {
    const fixed = fixFloatingAsInSteps(next)
    if (fixed !== next) next = fixed
  }

  next = next.replace(
    /"id":"([^"]+)"([\s\S]*?"input":\{[^}]*\})\},\s*\{"type":"step"/g,
    '"id":"$1"$2,"as":"$1"},\{"type":"step"'
  )

  next = next.replace(/\]\s*\)\s*\}\s*\)\s*$/g, "]}")
  next = next.replace(/"steps":\s*\[[^\]]*],\s*"steps":/g, '"steps":')
  next = next.replace(/\}"\s*,/g, "},")
  return next
}

function fixFloatingAsInSteps(raw: string): string {
  return fixFloatingAsInArray(raw, '"steps":[')
}

function fixFloatingAsInArray(raw: string, marker: string): string {
  const stepsIdx = raw.indexOf(marker)
  if (stepsIdx < 0) return raw

  const arrayOpen = stepsIdx + marker.length - 1
  let i = arrayOpen + 1
  let result = raw.slice(0, i)

  let depth = 0
  let inString = false
  let escape = false

  while (i < raw.length) {
    const ch = raw[i]

    if (escape) {
      escape = false
      result += ch
      i++
      continue
    }
    if (inString) {
      if (ch === "\\") {
        escape = true
        result += ch
        i++
        continue
      }
      if (ch === '"') inString = false
      result += ch
      i++
      continue
    }
    if (ch === '"') {
      inString = true
      result += ch
      i++
      continue
    }
    if (ch === "{") {
      depth++
      result += ch
      i++
      continue
    }
    if (ch === "}") {
      depth--
      if (depth < 0) {
        result += raw.slice(i)
        return result
      }
      result += ch
      i++
      continue
    }
    if (ch === "]" && depth === 0) {
      result += raw.slice(i)
      return result
    }

    if (ch === "," && depth === 0) {
      const rest = raw.slice(i + 1)
      const trimmed = rest.trimStart()
      const leadingWs = rest.length - trimmed.length
      const floatMatch = trimmed.match(/^"as"\s*:\s*"([^"]*)"\s*\}/)
      if (floatMatch) {
        result = result.slice(0, -1)
        result += `,"as":"${floatMatch[1]}"}`
        i += 1 + leadingWs + floatMatch[0].length
        continue
      }
    }

    result += ch
    i++
  }

  return result
}

/**
 * Repair common 1B patch JSON mistakes before decode.
 * @category Harness
 */
export function repairPatchJsonSyntax(raw: string): string {
  let next = raw.trim()

  try {
    JSON.parse(next)
  } catch {
    const fixed = fixFloatingAsInArray(next, '"value":[')
    if (fixed !== next) next = fixed
  }

  try {
    JSON.parse(next)
  } catch {
    const stripped = next.replace(/\)\s*\}/g, "}")
    try {
      JSON.parse(stripped)
      next = stripped
    } catch {
      // fall through
    }
  }

  next = next.replace(/\}"\s*,/g, "},")

  return next
}

/**
 * Hoist steps nested under workflow into top-level steps array.
 * @category Harness
 */
export function hoistWorkflowStepsInRawJson(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.includes('"workflow"') || !trimmed.includes('"steps"')) {
    return raw
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const workflow = parsed.workflow
    if (
      workflow !== null &&
      typeof workflow === "object" &&
      !Array.isArray(workflow) &&
      Array.isArray((workflow as Record<string, unknown>).steps) &&
      parsed.steps === undefined
    ) {
      const wf = workflow as Record<string, unknown>
      const { steps, ...rest } = wf
      return JSON.stringify({ ...parsed, workflow: rest, steps })
    }
  } catch {
    // fall through to regex hoist
  }

  const match = trimmed.match(
    /"workflow"\s*:\s*\{("id"\s*:\s*"[^"]*"(?:\s*,\s*"label"\s*:\s*"[^"]*")?)\s*,\s*"steps"\s*:\s*(\[[\s\S]*\])\s*\}\s*,\s*"steps"\s*:/
  )
  if (match) {
    return trimmed
  }

  const nested = trimmed.match(
    /"workflow"\s*:\s*\{("id"\s*:\s*"[^"]*"(?:\s*,\s*"label"\s*:\s*"[^"]*")?)\s*,\s*"steps"\s*:\s*(\[[\s\S]*?\])\s*\}/
  )
  if (nested) {
    const wfMeta = `{${nested[1]}}`
    const stepsArray = nested[2]
    const withoutNested = trimmed.replace(nested[0], `"workflow":${wfMeta}`)
    if (!withoutNested.includes('"steps":')) {
      return withoutNested.replace(
        `"workflow":${wfMeta}`,
        `"workflow":${wfMeta},"steps":${stepsArray}`
      )
    }
  }

  return raw
}
