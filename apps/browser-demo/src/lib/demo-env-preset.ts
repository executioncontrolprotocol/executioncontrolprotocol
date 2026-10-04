/** Demo environment preset ids (finite mountable envs). @category Demo */
export const DEMO_ENV_PRESETS = ["default", "extended"] as const

/** Browser demo environment preset. @category Demo */
export type DemoEnvPreset = (typeof DEMO_ENV_PRESETS)[number]

/** localStorage key for the selected demo env preset. */
export const DEMO_ENV_PRESET_STORAGE_KEY = "ecp:browser-demo:env-preset"

/** Whether `value` is a known {@link DemoEnvPreset}. */
export function isDemoEnvPreset(value: unknown): value is DemoEnvPreset {
  return value === "default" || value === "extended"
}

/** Read the persisted demo env preset (defaults to `default`). */
export function readDemoEnvPreset(): DemoEnvPreset {
  if (typeof localStorage === "undefined") return "default"
  const raw = localStorage.getItem(DEMO_ENV_PRESET_STORAGE_KEY)
  return isDemoEnvPreset(raw) ? raw : "default"
}

/** Persist the demo env preset. */
export function storeDemoEnvPreset(preset: DemoEnvPreset): void {
  if (typeof localStorage === "undefined") return
  localStorage.setItem(DEMO_ENV_PRESET_STORAGE_KEY, preset)
}

/**
 * Parse `?env=extended|default` from a query string.
 * Returns undefined when the param is absent or invalid.
 */
export function parseDemoEnvPresetQuery(search: string): DemoEnvPreset | undefined {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const raw = params.get("env")?.trim()
  return isDemoEnvPreset(raw) ? raw : undefined
}

/**
 * Apply `?env=` from `ecp up` into localStorage and strip it from the URL.
 * Safe to call once at app boot (start-time decision, not settings).
 */
export function consumeDemoEnvPresetQuery(
  locationLike?: Pick<Location, "search" | "pathname" | "hash">,
  historyLike?: Pick<History, "replaceState">
): DemoEnvPreset {
  const loc =
    locationLike ??
    (typeof window !== "undefined"
      ? window.location
      : { search: "", pathname: "/", hash: "" })
  const hist =
    historyLike ?? (typeof window !== "undefined" ? window.history : undefined)
  const stored = readDemoEnvPreset()
  const fromQuery = parseDemoEnvPresetQuery(loc.search)
  if (!fromQuery) return stored

  storeDemoEnvPreset(fromQuery)

  if (hist && typeof hist.replaceState === "function") {
    const params = new URLSearchParams(
      loc.search.startsWith("?") ? loc.search.slice(1) : loc.search
    )
    params.delete("env")
    const qs = params.toString()
    const next = `${loc.pathname}${qs ? `?${qs}` : ""}${loc.hash}`
    hist.replaceState(null, "", next)
  }

  return fromQuery
}
