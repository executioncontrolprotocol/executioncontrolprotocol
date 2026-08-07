import type { InputValue } from "@executioncontrolprotocol/types"

/** Track which helpers are required. @category Fluent */
export interface ImportNeeds {
  workflow: boolean
  step: boolean
  ref: boolean
  state: boolean
  secrets: boolean
  browser: boolean
  expr: boolean
  loop: boolean
  parallel: boolean
  branch: boolean
}

/** @category Fluent */
export function createImportNeeds(): ImportNeeds {
  return {
    workflow: true,
    step: true,
    ref: false,
    state: false,
    secrets: false,
    browser: false,
    expr: false,
    loop: false,
    parallel: false,
    branch: false,
  }
}

/**
 * Render input value to TypeScript expression.
 * @category Fluent
 */
export function renderInputValue(value: InputValue, needs: ImportNeeds): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if ("$ref" in value) {
      needs.ref = true
      const path = (value as { $ref: string }).$ref.replace(/^state\./, "")
      return `ref(${JSON.stringify(path)})`
    }
    if ("$state" in value) {
      needs.state = true
      return `state(${JSON.stringify((value as { $state: string }).$state)})`
    }
    if ("$secret" in value) {
      needs.secrets = true
      return `secrets(${JSON.stringify((value as { $secret: string }).$secret)})`
    }
    if ("$browser" in value) {
      needs.browser = true
      return `browser(${JSON.stringify((value as { $browser: string }).$browser)})`
    }
    const entries = Object.entries(value).map(
      ([k, v]) => `${JSON.stringify(k)}: ${renderInputValue(v as InputValue, needs)}`
    )
    return `{ ${entries.join(", ")} }`
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => renderInputValue(v as InputValue, needs)).join(", ")}]`
  }
  return JSON.stringify(value)
}
