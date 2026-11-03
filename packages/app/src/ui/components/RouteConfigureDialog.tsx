import { useState } from "react"
import type { ReactFlowRouteEdgeData } from "../../graph/index.js"

interface RouteConfigureDialogProps {
  /** Route edge metadata. */
  route: ReactFlowRouteEdgeData
  /** Save in flight. */
  busy?: boolean
  /** Validation / save error. */
  error?: string | null
  /** Close without saving. */
  onClose: () => void
  /** Persist configure fields. */
  onSave: (fields: {
    whenText?: string
    untilText?: string
    maxRounds?: number | undefined
  }) => void
}

/**
 * Configure a published route edge (branch `when` or loop `until` / `maxRounds`).
 */
export function RouteConfigureDialog({
  route,
  busy = false,
  error,
  onClose,
  onSave,
}: RouteConfigureDialogProps) {
  const [whenText, setWhenText] = useState(route.whenBadge ?? 'eq("flag", true)')
  const [untilText, setUntilText] = useState(route.untilBadge ?? "")
  const [maxRoundsText, setMaxRoundsText] = useState(
    route.maxRounds === undefined ? "" : String(route.maxRounds)
  )

  const title =
    route.route === "branch"
      ? "Configure branch arm"
      : route.route === "loop"
        ? "Configure loop"
        : "Configure route"

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container p-4 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="mb-3 font-display text-sm font-semibold text-on-surface">{title}</h2>
        {route.route === "branch" ? (
          <label className="mb-3 block">
            <span className="mb-1 block font-mono text-[11px] text-on-surface-variant">
              when (eq/neq)
            </span>
            <input
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono text-sm text-on-surface"
              value={whenText}
              onChange={(event) => setWhenText(event.target.value)}
              disabled={busy}
              spellCheck={false}
            />
          </label>
        ) : null}
        {route.route === "loop" ? (
          <>
            <label className="mb-3 block">
              <span className="mb-1 block font-mono text-[11px] text-on-surface-variant">
                until (eq/neq, optional)
              </span>
              <input
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono text-sm text-on-surface"
                value={untilText}
                onChange={(event) => setUntilText(event.target.value)}
                disabled={busy}
                spellCheck={false}
              />
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block font-mono text-[11px] text-on-surface-variant">
                maxRounds (optional)
              </span>
              <input
                className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono text-sm text-on-surface"
                value={maxRoundsText}
                onChange={(event) => setMaxRoundsText(event.target.value)}
                disabled={busy}
                inputMode="numeric"
              />
            </label>
          </>
        ) : null}
        {route.route === "parallel" ? (
          <p className="mb-3 font-mono text-[11px] text-on-surface-variant">
            Parallel lanes have no condition to edit.
          </p>
        ) : null}
        {error ? (
          <p className="mb-3 font-mono text-[11px] text-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 font-mono text-[11px] text-on-surface-variant hover:bg-surface-container-highest"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {route.route !== "parallel" ? (
            <button
              type="button"
              className="rounded bg-primary px-3 py-1.5 font-mono text-[11px] text-on-primary disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                if (route.route === "branch") {
                  onSave({ whenText })
                  return
                }
                const trimmed = maxRoundsText.trim()
                const maxRounds =
                  trimmed === ""
                    ? undefined
                    : Number.parseInt(trimmed, 10)
                if (trimmed !== "" && (!Number.isFinite(maxRounds) || (maxRounds ?? 0) < 1)) {
                  return
                }
                onSave({ untilText, maxRounds })
              }}
            >
              Save
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
