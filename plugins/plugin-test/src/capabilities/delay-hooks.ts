/**
 * Test-only hooks for the delay capability (inert unless a test calls them).
 * @category Plugins
 */

let holdArmed = false
let holdGate: Promise<void> | undefined
let holdGateResolve: (() => void) | undefined

/** Fired once when a delay handler begins awaiting (tests only). */
let onDelayEntered: (() => void) | undefined

/**
 * Block delay handlers until {@link releaseDelayForTests}.
 * @category Plugins
 */
export function holdDelayForTests(): void {
  holdArmed = true
  holdGate = new Promise<void>((resolve) => {
    holdGateResolve = resolve
  })
}

/**
 * Release a held delay (no-op when not held).
 * @category Plugins
 */
export function releaseDelayForTests(): void {
  holdArmed = false
  holdGateResolve?.()
  holdGateResolve = undefined
  holdGate = undefined
}

/**
 * Clear hold state and entry callback (call from test teardown).
 * @category Plugins
 */
export function resetDelayForTests(): void {
  holdArmed = false
  releaseDelayForTests()
  onDelayEntered = undefined
}

/**
 * Register a one-shot callback when a delay handler starts.
 * @category Plugins
 */
export function onDelayEnteredForTests(callback: () => void): void {
  onDelayEntered = callback
}

function abortError(): Error {
  return Object.assign(new Error("aborted"), { name: "AbortError" })
}

async function raceAbort<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  if (signal.aborted) throw abortError()
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort)
      reject(abortError())
    }
    signal.addEventListener("abort", onAbort, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

/**
 * Shared delay path for the handler and in-process test mocks.
 * @category Plugins
 */
export async function awaitTestDelay(ms: number, signal: AbortSignal, testHold?: boolean): Promise<void> {
  if (signal.aborted) throw abortError()
  onDelayEntered?.()
  onDelayEntered = undefined

  if (testHold && holdArmed && holdGate) {
    await raceAbort(signal, holdGate)
  }

  if (ms > 0) {
    await raceAbort(
      signal,
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, ms)
        const onAbort = (): void => {
          clearTimeout(timer)
          reject(abortError())
        }
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener("abort", onAbort, { once: true })
      }),
    )
  }
}