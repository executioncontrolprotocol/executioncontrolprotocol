import {
  CHROME_LANGUAGE_MODEL_TEXT_OPTIONS,
  type ChromeLanguageModelApi,
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
  /** Bytes loaded (when reported by downloadprogress). */
  loaded?: number
  /** Total bytes (when reported by downloadprogress). */
  total?: number
  /** Error message when phase is error. */
  error?: string
}

interface ChromeAiGlobal {
  LanguageModel?: ChromeLanguageModelApi
}

let installState: ChromeModelInstallState = { phase: "idle" }
let downloadPromise: Promise<void> | null = null

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
  const status = normalizeStatus(await model.availability(CHROME_LANGUAGE_MODEL_TEXT_OPTIONS))
  return {
    status,
    available: status === "available",
    supported: status !== "unsupported",
  }
}

/** Snapshot install state for polling. @category Extensions */
export function getModelInstallState(): ChromeModelInstallState {
  return { ...installState }
}

/** Reset install state (for tests). @category Extensions */
export function resetModelInstallState(): void {
  installState = { phase: "idle" }
  downloadPromise = null
}

async function runModelDownload(): Promise<void> {
  const model = languageModel()
  if (!model?.create) {
    installState = { phase: "error", status: "unsupported", error: "LanguageModel API not supported" }
    return
  }

  installState = { phase: "checking", status: installState.status ?? "downloadable" }

  const avail = await readAvailability()
  installState = { ...installState, status: avail.status }

  if (avail.status === "available") {
    installState = { phase: "ready", status: "available" }
    return
  }

  if (avail.status === "unavailable" || avail.status === "unsupported") {
    installState = {
      phase: "error",
      status: avail.status,
      error: "Chrome built-in AI is not available on this device",
    }
    return
  }

  installState = { phase: "downloading", status: avail.status, loaded: 0 }

  try {
    await model.create({
      ...CHROME_LANGUAGE_MODEL_TEXT_OPTIONS,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          installState = {
            phase: "downloading",
            status: "downloading",
            loaded: e.loaded,
            total: e.total,
          }
        })
      },
    })
    installState = { phase: "loading", status: "downloading" }
    const after = await readAvailability()
    if (after.available) {
      installState = { phase: "ready", status: "available" }
    } else {
      installState = {
        phase: "error",
        status: after.status,
        error: "Model download did not complete",
      }
    }
  } catch (err) {
    installState = {
      phase: "error",
      status: installState.status,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Start Gemini Nano download if needed (idempotent).
 * @category Extensions
 */
export async function startModelDownload(): Promise<{ started: boolean }> {
  if (installState.phase === "ready") {
    return { started: false }
  }
  if (downloadPromise) {
    return { started: false }
  }

  const avail = await readAvailability()
  if (avail.available) {
    installState = { phase: "ready", status: "available" }
    return { started: false }
  }

  downloadPromise = runModelDownload().finally(() => {
    downloadPromise = null
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
