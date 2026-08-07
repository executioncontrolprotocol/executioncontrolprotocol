import type { ECPContext } from "@executioncontrolprotocol/spec";

export function getRequiredInputNames(context: ECPContext): string[] {
  const defs = context.inputs ?? {};
  return Object.entries(defs)
    .filter(([_name, def]) => (def as { required?: boolean }).required === true)
    .map(([name]) => name);
}

