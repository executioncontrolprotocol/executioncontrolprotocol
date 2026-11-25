import { registerXEcpFileKeyword } from "@executioncontrolprotocol/engine"
import Ajv2020 from "ajv/dist/2020.js"
import addFormatsModule from "ajv-formats"
import type { JsonSchema } from "@executioncontrolprotocol/protocol"

interface AjvValidator {
  (data: unknown): boolean
  errors?: Array<{ instancePath?: string; message?: string }> | null
}

interface AjvLike {
  compile(schema: object): AjvValidator
  addKeyword(def: object): unknown
}

const Ajv = Ajv2020 as unknown as new (options?: object) => AjvLike
const addFormats = addFormatsModule as unknown as (ajv: AjvLike) => AjvLike

const ajvInstance = addFormats(new Ajv({ allErrors: true, strict: false }))
registerXEcpFileKeyword(ajvInstance)
const ajv = ajvInstance
const cache = new WeakMap<object, AjvValidator>()

/**
 * Validate capability input against an `accepts` JSON Schema.
 * @category Plugins
 */
export function validateCapabilityInput(accepts: JsonSchema, input: unknown): void {
  let validator = cache.get(accepts)
  if (!validator) {
    validator = ajv.compile(accepts)
    cache.set(accepts, validator)
  }
  if (validator(input)) return
  const first = validator.errors?.[0]
  const detail = first?.message ?? "Input is invalid."
  const path = first?.instancePath ?? ""
  throw Object.assign(new Error(`ECP_INPUT_INVALID: ${detail}`), {
    code: "ECP_INPUT_INVALID",
    path,
  })
}
