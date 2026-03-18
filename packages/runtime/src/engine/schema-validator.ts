/**
 * Runtime schema validator — validates executor outputs against
 * the JSON-Schema-like definitions declared in a Context.
 *
 * Uses AJV for runtime validation, converting the ECP SchemaDefinition
 * format into standard JSON Schema.
 *
 * @category Engine
 */

import _Ajv from "ajv";
import type { SchemaDefinition, SchemaProperty } from "@executioncontrolprotocol/spec";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ajv = (_Ajv as any).default ?? _Ajv;

/**
 * The result of validating data against a schema.
 *
 * @category Engine
 */
export interface ValidationResult {
  /** Whether the data conforms to the schema. */
  valid: boolean;

  /** Validation error messages (empty if valid). */
  errors: string[];
}

/**
 * Convert an ECP SchemaDefinition into a standard JSON Schema object
 * that AJV can compile.
 */
function toJsonSchema(def: SchemaDefinition): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: def.type,
  };

  if (def.required?.length) {
    schema.required = def.required;
  }

  if (def.properties) {
    schema.properties = Object.fromEntries(
      Object.entries(def.properties).map(([key, prop]) => [
        key,
        propertyToJsonSchema(prop),
      ]),
    );
    schema.additionalProperties = true;
  }

  return schema;
}

function propertyToJsonSchema(prop: SchemaProperty): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: prop.type };

  if (prop.items) {
    schema.items = propertyToJsonSchema(prop.items);
  }

  if (prop.required?.length) {
    schema.required = prop.required;
  }

  if (prop.properties) {
    schema.properties = Object.fromEntries(
      Object.entries(prop.properties).map(([key, p]) => [
        key,
        propertyToJsonSchema(p),
      ]),
    );
    schema.additionalProperties = true;
  }

  return schema;
}

/**
 * Validate data against an ECP SchemaDefinition.
 *
 * @param data - The data to validate.
 * @param schemaDef - The ECP schema definition.
 * @returns Validation result.
 *
 * @category Engine
 */
export function validateOutput(
  data: unknown,
  schemaDef: SchemaDefinition,
): ValidationResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const jsonSchema = toJsonSchema(schemaDef);
  const validate = ajv.compile(jsonSchema);

  if (validate(data)) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map(
    (err: { instancePath?: string; message?: string }) =>
      `${err.instancePath || "/"}: ${err.message ?? "unknown error"}`,
  );

  return { valid: false, errors };
}
