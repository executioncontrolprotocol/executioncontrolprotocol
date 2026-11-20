import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** Heap cap for one evaluation process. */
const CHILD_HEAP_MB = 64

const jsonataPath = createRequire(import.meta.url).resolve("jsonata")

/**
 * Child body (CommonJS, run with `node -e`). JSONata runs in its own process, not on the host's event
 * loop or heap: terminating it stops a runaway expression, and running out of memory kills only the child.
 * (A worker thread is not enough: V8 can abort the whole process when a worker exhausts its heap.)
 */
const CHILD_SOURCE = `
process.once("message", ({ jsonataPath, expression, input }) => {
  Promise.resolve()
    .then(() => require(jsonataPath)(expression).evaluate(input))
    .then(
      (value) => process.send({ ok: true, json: value === undefined ? undefined : JSON.stringify(value) }),
      (error) => process.send({
        ok: false,
        message: error && typeof error.message === "string" ? error.message : String(error),
        position: error && typeof error.position === "number" ? error.position : undefined,
      }),
    )
    .finally(() => process.disconnect())
})
`

type ChildReply =
  | { ok: true; json: string | undefined }
  | { ok: false; message: string; position: number | undefined }

function stepError(code: "ECP_STEP_FAILED" | "ECP_STEP_TIMEOUT", message: string): Error {
  return Object.assign(new Error(message), { code })
}

/**
 * Evaluates the step JSONata expression on resolved input in a child process. The step signal
 * (capability `timeoutMs`, or cancellation) kills the child, so evaluation never outlives the step.
 * A result of `undefined` (nothing matched) becomes `null`; the host `returns` check decides if that is valid.
 * @category Plugins
 */
export default async function handler(input: unknown, ctx: HandlerContext): Promise<unknown> {
  const expression = ctx.expression
  if (typeof expression !== "string" || expression.trim().length === 0) {
    throw stepError("ECP_STEP_FAILED", "Step expression is required for JSONata transform.")
  }
  if (ctx.signal.aborted) throw stepError("ECP_STEP_TIMEOUT", "Step timed out.")

  const child = spawn(process.execPath, [`--max-old-space-size=${CHILD_HEAP_MB}`, "-e", CHILD_SOURCE], {
    stdio: ["ignore", "ignore", "pipe", "ipc"],
    windowsHide: true,
  })
  let stderr = ""
  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderr.length < 4096) stderr += chunk.toString("utf8")
  })
  const onAbort = () => child.kill()
  ctx.signal.addEventListener("abort", onAbort, { once: true })
  try {
    const reply = await new Promise<ChildReply>((resolve, reject) => {
      child.once("message", (message) => resolve(message as ChildReply))
      child.once("error", (error) => reject(stepError("ECP_STEP_FAILED", `JSONata process failed: ${error.message}`)))
      child.once("exit", () => {
        if (ctx.signal.aborted) reject(stepError("ECP_STEP_TIMEOUT", "Step timed out."))
        else if (/heap out of memory|heap limit/i.test(stderr)) {
          reject(stepError("ECP_STEP_FAILED", "JSONata evaluation exceeded the memory limit."))
        } else reject(stepError("ECP_STEP_FAILED", "JSONata process exited without a result."))
      })
      child.send({ jsonataPath, expression, input })
    })
    if (!reply.ok) {
      const at = reply.position !== undefined && Number.isFinite(reply.position) ? ` (at position ${reply.position})` : ""
      throw stepError("ECP_STEP_FAILED", `${reply.message}${at}`)
    }
    return reply.json === undefined ? null : (JSON.parse(reply.json) as unknown)
  } finally {
    ctx.signal.removeEventListener("abort", onAbort)
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}
