import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import { z } from "zod"
import { parseCsvAcceptsSchema, parseCsvReturnsSchema } from "./schemas.js"

/**
 * Transform capability definition. Step `accepts` / `returns` and script live on the execution step.
 * @category Plugins
 */
export const transform = capability({
  contract: "step",
  code: "script",
  summary: "Run a JavaScript transform in the host sandbox.",
  description:
    "Resolves step input, evaluates the step script in QuickJS, and returns JSON matching the step returns schema. The handler is not called.",
  useCases: ["Reshape data between capability steps without a domain plugin"],
  projections: ["Take the object your step returns schema describes"],
  accepts: z.object({}).strict(),
  returns: z.object({}).strict(),
  handler: () => import("./capabilities/transform.js"),
})

/**
 * parse-csv capability definition.
 * @category Plugins
 */
export const parseCsv = capability({
  summary: "Parse a CSV file into rows.",
  description:
    "Reads the file through the host file service and parses it as RFC 4180 CSV: quoted fields, escaped quotes, line breaks inside quotes, CRLF or LF, an optional UTF-8 BOM. With a header (the default) each row is an object keyed by column; every value is a string.",
  useCases: ["Turn a spreadsheet of variants into rows a forEach can run over"],
  projections: ["Take `rows` (objects keyed by `columns`)"],
  accepts: parseCsvAcceptsSchema,
  returns: parseCsvReturnsSchema,
  handler: () => import("./capabilities/parse-csv.js"),
})

/**
 * Bundled core plugin. Registers transform and parse-csv capabilities shipped with the host.
 * @category Plugins
 */
export default definePlugin({
  id: "@executioncontrolprotocol/core",
  summary: "Core transform, step-contract and CSV capabilities bundled with the host.",
  description:
    "Supplies step-contract capabilities so executions can declare accepts, returns and scripts on the step node.",
  capabilities: {
    transform,
    "parse-csv": parseCsv,
  },
})