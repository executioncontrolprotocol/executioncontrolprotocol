import { capability, definePlugin } from "@executioncontrolprotocol/plugin-sdk"
import { z } from "zod"

/**
 * Echo capability definition (for handler typing).
 * @category Plugins
 */
export const echo = capability({
  summary: "Echo a value.",
  description: "Returns the input value under `echo`.",
  useCases: ["Round-trip a value through the executor"],
  projections: ["Take `echo`"],
  accepts: z.object({ value: z.unknown().optional() }),
  returns: z.object({ echo: z.unknown() }),
  handler: () => import("./capabilities/echo.js"),
})

/**
 * Fail capability definition.
 * @category Plugins
 */
export const fail = capability({
  summary: "Fail with a code.",
  description: "Throws with the given code and message.",
  useCases: ["Exercise step failure paths"],
  projections: ["Expect the step to fail"],
  accepts: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }),
  returns: z.object({}),
  handler: () => import("./capabilities/fail.js"),
})

/**
 * Delay capability definition.
 * @category Plugins
 */
export const delay = capability({
  summary: "Wait for milliseconds.",
  description: "Sleeps for `ms` and honours `signal`.",
  useCases: ["Exercise cancel and timeout"],
  projections: ["Take `waitedMs`"],
  accepts: z.object({ ms: z.number().int().min(0) }),
  returns: z.object({ waitedMs: z.number().int() }),
  /** Long enough for A6 interruption / resume scenarios. */
  timeoutMs: 60_000,
  handler: () => import("./capabilities/delay.js"),
})

/**
 * Bounded string capability (maxLength on `text` for `$script` acceptance).
 * @category Plugins
 */
export const bounded = capability({
  summary: "Echo a length-limited string.",
  description: "Returns `text` under `text`. Accepts strings up to 40 characters.",
  useCases: ["Exercise $script into a maxLength field"],
  projections: ["Take `text`"],
  accepts: z.object({ text: z.string().max(40) }),
  returns: z.object({ text: z.string() }),
  handler: () => import("./capabilities/bounded.js"),
})

/**
 * Stage capability definition.
 * @category Plugins
 */
export const stage = capability({
  summary: "Stage a state write.",
  description: "Writes through a `$state` handle using the handler store.",
  useCases: ["Exercise staged commits"],
  projections: ["Take `ok`"],
  accepts: z.object({
    handle: z.object({ $state: z.string().optional() }).passthrough(),
    op: z.enum(["set", "merge", "append"]),
    value: z.unknown(),
    fail: z.boolean().optional(),
  }),
  returns: z.object({ ok: z.boolean() }),
  handler: () => import("./capabilities/stage.js"),
})

/**
 * Config-echo capability definition.
 * @category Plugins
 */
export const configEcho = capability({
  summary: "Echo config metadata.",
  description: "Returns config keys and the length of `secret`, never the value.",
  useCases: ["Exercise config and secret resolution"],
  projections: ["Take `keys` and `secretLength`"],
  accepts: z.object({}).strict(),
  returns: z.object({
    keys: z.array(z.string()),
    secretLength: z.number().int(),
  }),
  handler: () => import("./capabilities/config-echo.js"),
})

/**
 * File-roundtrip capability definition.
 * @category Plugins
 */
export const fileRoundtrip = capability({
  summary: "Read a file ref and write an artifact.",
  description: "Reads `file` and writes the bytes as a run artifact.",
  useCases: ["Exercise files.read and writeArtifact"],
  projections: ["Take `artifact`"],
  accepts: z.object({
    file: z.object({
      kind: z.enum(["file", "url", "artifact"]),
      path: z.string().optional(),
      url: z.string().optional(),
      uri: z.string().optional(),
      mediaType: z.string().optional(),
      name: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
      sizeBytes: z.number().optional(),
    }),
  }),
  returns: z.object({
    artifact: z.object({
      kind: z.literal("artifact"),
      uri: z.string(),
      mediaType: z.string().optional(),
      name: z.string().optional(),
      sizeBytes: z.number().optional(),
    }),
  }),
  handler: () => import("./capabilities/file-roundtrip.js"),
})

/**
 * Call capability definition.
 * @category Plugins
 */
export const call = capability({
  summary: "Call another capability.",
  description: "Invokes `capabilityId` through `ctx.call` with the given input.",
  useCases: ["Exercise nested capability calls"],
  projections: ["Take `result`"],
  accepts: z.object({
    capabilityId: z.string(),
    input: z.unknown().optional(),
    config: z.string().optional(),
  }),
  returns: z.object({ result: z.unknown() }),
  handler: () => import("./capabilities/call.js"),
})

/**
 * Test harness plugin. Exercises every handler-context feature.
 * @category Plugins
 */
export default definePlugin({
  id: "@executioncontrolprotocol/test",
  summary: "Fixture capabilities for engine and host tests.",
  description:
    "Echo, fail, delay, stage, config-echo, file-roundtrip, call and bounded for every executor and handler-context feature.",
  config: z
    .object({
      secret: z.string().optional(),
      label: z.string().optional(),
    })
    .strict(),
  capabilities: {
    echo,
    fail,
    delay,
    stage,
    "config-echo": configEcho,
    "file-roundtrip": fileRoundtrip,
    call,
    bounded,
  },
})