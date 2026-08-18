import {
  CHROME_LANGUAGE_MODEL_TEXT_OPTIONS,
  type ChromeLanguageModelApi,
  type ChromeLanguageModelCreateOptions,
} from "./prompt-session.js"

/** Chrome LanguageModel availability status from the browser API. @category Extensions */
export type ChromeAvailabilityStatus =
  | "unsupported"
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available"

/** Install lifecycle phase for UI polling. @category Extensions */
export type ChromeModelInstallPhase =
  | "idle"
  | "checking"
  | "downloading"
  | "loading"
  | "ready"
  | "error"

/** Snapshot of Chrome model download/install progress. @category Extensions */
export interface ChromeModelInstallState {
  /** Current install phase. */
  phase: ChromeModelInstallPhase
  /** Raw availability status from LanguageModel.availability(). */
  status?: ChromeAvailabilityStatus
  /** Progress numerator (normalized 0..100 when fraction-based). */
  loaded?: number
  /** Progress denominator. */
  total?: number
  /** Error message when phase is error. */
  error?: string
  /**
   * Soft guidance when the install looks stuck (no hard failure yet).
   * Typical cause: Chrome on-device runtime wedged until browser/OS restart.
   */
  hint?: string
}

/** How long to wait with no progress before surfacing a restart hint. @category Extensions */
export const CHROME_MODEL_STALL_MS = 45_000

/**
 * User-facing guidance when availability stays `downloading` / install shows
 * no byte progress. Often cleared by quitting Chrome or an OS restart.
 * @category Extensions
 */
export const CHROME_MODEL_STALL_HINT =
  "Download looks stuck with no progress. Fully quit and reopen Chrome (check for a pending Chrome update), or restart your PC."

/** Inputs for {@link isChromeModelInstallStalled}. @category Extensions */
export interface ChromeModelStallCheckInput {
  /** Current install phase. */
  phase: string
  /** Raw LanguageModel availability status. */
  status?: string
  /** Last known progress numerator. */
  loaded?: number
  /** Timestamp (ms) when we last saw progress advance. */
  lastProgressAt: number
  /** Clock now (ms); injectable for tests. */
  now?: number
  /** Stall threshold override (ms). */
  stallMs?: number
}

/**
 * True when install has been downloading without progress long enough to
 * suggest a Chrome restart rather than more app retries.
 * @category Extensions
 */
export function isChromeModelInstallStalled(input: ChromeModelStallCheckInput): boolean {
  if (input.phase === "ready" || input.phase === "error" || input.phase === "idle") {
    return false
  }
  const inFlight =
    input.phase === "downloading" ||
    input.phase === "checking" ||
    input.status === "downloading" ||
    input.status === "downloadable"
  if (!inFlight) return false
  const now = input.now ?? Date.now()
  const stallMs = input.stallMs ?? CHROME_MODEL_STALL_MS
  return now - input.lastProgressAt >= stallMs
}

/**
 * Session options that last reported the best availability.
 * `bare` means `LanguageModel.create()` / `availability()` with no expectedInputs.
 * @category Extensions
 */
export type PreferredChromeCreateOptions =
  | { kind: "bare" }
  | { kind: "options"; options: ChromeLanguageModelCreateOptions }

interface ChromeAiGlobal {
  LanguageModel?: ChromeLanguageModelApi
  /** Shared across Vite/bundler duplicate module copies. */
  __ecpChromeAiInstall?: {
    state: ChromeModelInstallState
    downloadPromise: Promise<void> | null
    preferredCreate: PreferredChromeCreateOptions
  }
}

/** Max wait for LanguageModel.create() / background download. */
const DOWNLOAD_TIMEOUT_MS = 180_000

/** How often to re-check availability while create() is in flight. */
const AVAILABILITY_POLL_MS = 750

const STATUS_RANK: Record<ChromeAvailabilityStatus, number> = {
  available: 4,
  downloading: 3,
  downloadable: 2,
  unavailable: 1,
  unsupported: 0,
}

const INSTALL_STORE_KEY = "__ecpChromeAiInstall" as const

function installStore(): NonNullable<ChromeAiGlobal["__ecpChromeAiInstall"]> {
  const g = globalThis as ChromeAiGlobal
  if (!g[INSTALL_STORE_KEY]) {
    g[INSTALL_STORE_KEY] = {
      state: { phase: "idle" },
      downloadPromise: null,
      preferredCreate: { kind: "bare" },
    }
  }
  return g[INSTALL_STORE_KEY]!
}

function languageModel(): ChromeLanguageModelApi | undefined {
  return (globalThis as ChromeAiGlobal).LanguageModel
}

function normalizeStatus(raw: string): ChromeAvailabilityStatus {
  if (
    raw === "unavailable" ||
    raw === "downloadable" ||
    raw === "downloading" ||
    raw === "available"
  ) {
    return raw
  }
  return "unsupported"
}

/**
 * Prompt API `downloadprogress` reports `loaded` as a 0..1 fraction (Chrome docs).
 * Normalize to a 0..100 progress pair for UI.
 */
export function normalizeDownloadProgress(
  loaded: number,
  total?: number
): { loaded: number; total: number } {
  if (total === undefined || total <= 0) {
    if (loaded >= 0 && loaded <= 1) {
      return { loaded: Math.round(loaded * 100), total: 100 }
    }
    return { loaded, total: Math.max(loaded, 1) }
  }
  if (total <= 1 && loaded <= 1) {
    return { loaded: Math.round(loaded * 100), total: 100 }
  }
  return { loaded, total }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface AvailabilityProbe {
  status: ChromeAvailabilityStatus
  preferred: PreferredChromeCreateOptions
}

/**
 * Probe several option shapes. Availability is option-specific in Chrome;
 * an already-downloaded base model can still report `downloadable` for a
 * mismatched expectedInputs/languages config.
 */
async function probeAvailability(model: ChromeLanguageModelApi): Promise<AvailabilityProbe> {
  const probes: Array<{ preferred: PreferredChromeCreateOptions }> = [
    { preferred: { kind: "bare" } },
    { preferred: { kind: "options", options: { languages: ["en"] } } },
    { preferred: { kind: "options", options: CHROME_LANGUAGE_MODEL_TEXT_OPTIONS } },
  ]

  let best: AvailabilityProbe = {
    status: "unsupported",
    preferred: { kind: "bare" },
  }

  for (const probe of probes) {
    try {
      const availArg =
        probe.preferred.kind === "bare" ? undefined : probe.preferred.options
      const raw = await model.availability(availArg)
      const status = normalizeStatus(typeof raw === "string" ? raw : String(raw))
      if (STATUS_RANK[status] > STATUS_RANK[best.status]) {
        best = { status, preferred: probe.preferred }
      }
      if (status === "available") {
        return best
      }
    } catch {
      // Try the next probe shape.
    }
  }

  return best
}

/** Options that should be used for LanguageModel.create / generate sessions. @category Extensions */
export function getPreferredCreateOptions(): PreferredChromeCreateOptions {
  return installStore().preferredCreate
}

/** Read current LanguageModel availability. @category Extensions */
export async function readAvailability(): Promise<{
  status: ChromeAvailabilityStatus
  available: boolean
  supported: boolean
}> {
  const model = languageModel()
  if (!model?.availability) {
    return { status: "unsupported", available: false, supported: false }
  }
  const probe = await probeAvailability(model)
  installStore().preferredCreate = probe.preferred
  return {
    status: probe.status,
    available: probe.status === "available",
    supported: probe.status !== "unsupported",
  }
}

/** Snapshot install state for polling. @category Extensions */
export function getModelInstallState(): ChromeModelInstallState {
  return { ...installStore().state }
}

/** Reset install state (for tests). @category Extensions */
export function resetModelInstallState(): void {
  const store = installStore()
  store.state = { phase: "idle" }
  store.downloadPromise = null
  store.preferredCreate = { kind: "bare" }
}

function setInstallState(next: ChromeModelInstallState): void {
  installStore().state = next
}

async function settleAfterCreate(createPromise: Promise<unknown>): Promise<void> {
  const poll = (async () => {
    const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS
    while (Date.now() < deadline) {
      const phase = installStore().state.phase
      if (phase === "ready" || phase === "error") return
      try {
        const avail = await readAvailability()
        const prev = installStore().state
        setInstallState({ ...prev, status: avail.status })
        if (avail.available) {
          setInstallState({ phase: "ready", status: "available" })
          return
        }
        if (avail.status === "downloading") {
          setInstallState({
            phase: "downloading",
            status: "downloading",
            loaded: prev.loaded,
            total: prev.total,
          })
        }
      } catch {
        // Keep waiting on create / timeout.
      }
      await sleep(AVAILABILITY_POLL_MS)
    }
  })()

  const outcome = await Promise.race([
    createPromise.then(() => "created" as const).catch((err: unknown) => {
      throw err
    }),
    sleep(DOWNLOAD_TIMEOUT_MS).then(() => "timeout" as const),
    poll.then(() => "polled" as const),
  ])

  if (installStore().state.phase === "ready") return

  if (outcome === "timeout") {
    const after = await readAvailability()
    if (after.available) {
      setInstallState({ phase: "ready", status: "available" })
      return
    }
    setInstallState({
      phase: "error",
      status: after.status,
      error:
        "Chrome AI model download timed out or never started. Fully quit and reopen Chrome (or restart your PC), then try Continue again.",
    })
    return
  }

  if (outcome === "polled") {
    const after = await readAvailability()
    setInstallState(
      after.available
        ? { phase: "ready", status: "available" }
        : {
            phase: "error",
            status: after.status,
            error: "Model download did not complete",
          }
    )
    return
  }

  setInstallState({
    phase: "loading",
    status: installStore().state.status ?? "downloading",
  })
  const after = await readAvailability()
  if (after.available) {
    setInstallState({ phase: "ready", status: "available" })
  } else {
    setInstallState({
      phase: "error",
      status: after.status,
      error: "Model download did not complete",
    })
  }
}

function hasTransientUserActivation(): boolean | undefined {
  const ua = (
    globalThis as {
      navigator?: { userActivation?: { isActive?: boolean } }
    }
  ).navigator?.userActivation
  if (!ua || typeof ua.isActive !== "boolean") return undefined
  return ua.isActive
}

/**
 * Start Gemini Nano download / session warm-up if needed (idempotent).
 *
 * Call this as the first statement in a click handler (not via `ecp.invoke`,
 * and not after other awaits). Chrome requires transient user activation for
 * `LanguageModel.create()` when a download is needed.
 *
 * Install always uses bare `create({ monitor })` per Chrome Prompt API docs.
 * Option-specific sessions are used later for generate.
 *
 * @category Extensions
 */
export async function startModelDownload(): Promise<{ started: boolean }> {
  const store = installStore()
  if (store.state.phase === "ready") {
    return { started: false }
  }
  if (store.downloadPromise) {
    return { started: false }
  }

  const model = languageModel()
  if (!model?.create) {
    setInstallState({
      phase: "error",
      status: "unsupported",
      error: "LanguageModel API is not available in this browser",
    })
    return { started: false }
  }

  const active = hasTransientUserActivation()
  if (active === false) {
    setInstallState({
      phase: "error",
      status: "downloadable",
      error:
        "Chrome AI model download requires a user click. Open the provider dialog and click Continue.",
    })
    return { started: false }
  }

  // Do NOT await availability before create() — that consumes user activation.
  setInstallState({ phase: "downloading", status: "downloadable" })

  const monitor: ChromeLanguageModelCreateOptions["monitor"] = (m) => {
    m.addEventListener("downloadprogress", (e) => {
      // Chrome docs: e.loaded is a 0..1 fraction (often no total).
      const progress = normalizeDownloadProgress(e.loaded, e.total)
      if (progress.loaded <= 0) return
      setInstallState({
        phase: "downloading",
        status: "downloading",
        loaded: progress.loaded,
        total: progress.total,
      })
    })
  }

  // Prefer language-attested create (Chrome warns on bare create without
  // expectedOutputs). Still kick create synchronously from the click stack.
  let createPromise: Promise<unknown>
  try {
    createPromise = model.create({
      ...CHROME_LANGUAGE_MODEL_TEXT_OPTIONS,
      monitor,
    })
    store.preferredCreate = {
      kind: "options",
      options: CHROME_LANGUAGE_MODEL_TEXT_OPTIONS,
    }
  } catch (err) {
    try {
      createPromise = model.create({ monitor })
      store.preferredCreate = { kind: "bare" }
    } catch (bareErr) {
      setInstallState({
        phase: "error",
        status: "downloadable",
        error: bareErr instanceof Error ? bareErr.message : String(err),
      })
      return { started: false }
    }
  }

  store.downloadPromise = settleAfterCreate(createPromise)
    .catch((err: unknown) => {
      if (installStore().state.phase === "ready") return
      setInstallState({
        phase: "error",
        status: installStore().state.status,
        error: err instanceof Error ? err.message : String(err),
      })
    })
    .finally(() => {
      installStore().downloadPromise = null
    })

  return { started: true }
}

/** Whether generate can run (model ready). @category Extensions */
export async function assertModelReady(): Promise<void> {
  const avail = await readAvailability()
  if (!avail.available) {
    throw new Error(
      avail.status === "downloading" || avail.status === "downloadable"
        ? "Chrome AI model is still downloading. Wait for installation to finish."
        : "Chrome built-in AI is not available"
    )
  }
}
