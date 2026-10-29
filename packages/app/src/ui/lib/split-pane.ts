/** Clamp a split-pane left width between min and max. @category App */
export function clampSplitWidth(
  width: number,
  viewportWidth: number,
  min = 280,
  maxRatio = 0.8
): number {
  const max = Math.floor(viewportWidth * maxRatio)
  return Math.min(max, Math.max(min, width))
}

const STORAGE_KEY = "ecp-app-split-width"

/** Default left pane width: half the viewport, or 480px before window exists. @category App */
export function defaultSplitWidth(viewportWidth?: number): number {
  const width = viewportWidth ?? (typeof window === "undefined" ? 960 : window.innerWidth)
  return Math.floor(width * 0.5)
}

/** Read persisted split width (localStorage so it survives pane toggles and reloads). @category App */
export function readStoredSplitWidth(): number | undefined {
  if (typeof localStorage === "undefined") return undefined
  const raw = localStorage.getItem(STORAGE_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Persist split width to localStorage. @category App */
export function storeSplitWidth(width: number): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(STORAGE_KEY, String(width))
}

export { defaultSplitWidth as SPLIT_DEFAULT_WIDTH, STORAGE_KEY as SPLIT_STORAGE_KEY }
