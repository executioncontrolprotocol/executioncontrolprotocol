import type { HandlerContext } from "@executioncontrolprotocol/plugin-sdk"

/** Delay handler. */
export default async function handler(
  input: { ms: number },
  ctx: HandlerContext,
): Promise<{ waitedMs: number }> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, input.ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
    }
    if (ctx.signal.aborted) {
      onAbort()
      return
    }
    ctx.signal.addEventListener("abort", onAbort, { once: true })
  })
  return { waitedMs: input.ms }
}
