import { useState } from "react"
import type { ReactFlowRouteEdgeData, ReactFlowRouteKind } from "../../graph/index.js"
import type { RouteConfigureFields } from "../lib/route-configure.js"

/** Edit an existing published route, or wrap a data-edge target step. @category App */
export type RouteConfigureTarget =
  | { mode: "edit"; route: ReactFlowRouteEdgeData }
  | { mode: "wrap"; targetStepId: string }

interface RouteConfigureDialogProps {
  /** Edit vs wrap target. */
  target: RouteConfigureTarget
  /** Save in flight. */
  busy?: boolean
  /** Validation / save error. */
  error?: string | null
  /** Close without saving. */
  onClose: () => void
  /** Persist configure fields. */
  onSave: (fields: RouteConfigureFields) => void
}

/**
 * Configure a published route edge, or wrap a step into branch / parallel / loop.
 * @category App
 */
export function RouteConfigureDialog({
  target,
  busy = false,
  error,
  onClose,
  onSave,
}: RouteConfigureDialogProps) {
  const initialKind: ReactFlowRouteKind =
    target.mode === "edit" ? target.route.route : "loop"
  const [routeKind, setRouteKind] = useState<ReactFlowRouteKind>(initialKind)
  const [whenText, setWhenText] = useState(
    target.mode === "edit" ? (target.route.whenBadge ?? 'eq("flag", true)') : 'eq("flag", true)'
  )
  const [untilText, setUntilText] = useState(
    target.mode === "edit" ? (target.route.untilBadge ?? "") : ""
  )
  const [maxRoundsText, setMaxRoundsText] = useState(
    target.mode === "edit" && target.route.maxRounds !== undefined
      ? String(target.route.maxRounds)
      : ""
  )

  const activeKind = target.mode === "edit" ? target.route.route : routeKind
  const title =
    target.mode === "wrap"
      ? "Wrap step in route"
      : activeKind === "branch"
        ? "Configure branch arm"
        : activeKind === "loop"
          ? "Configure loop"
          : "Configure route"

  const showWhen = activeKind === "branch"
  const showLoopFields = activeKind === "loop"
  const showParallelNote = activeKind === "parallel"
  const canSave =
    target.mode === "wrap"
      ? activeKind === "branch" || activeKind === "loop" || activeKind === "parallel"
      : activeKind !== "parallel"

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
        {target.mode === "wrap" ? (
          <label className="mb-3 block">
            <span className="mb-1 block font-mono text-[11px] text-on-surface-variant">
              Route kind
            </span>
            <select
              className="w-full rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-mono text-sm text-on-surface"
              value={routeKind}
              onChange={(event) => setRouteKind(event.target.value as ReactFlowRouteKind)}
              disabled={busy}
            >
              <option value="loop">loop</option>
              <option value="branch">branch</option>
              <option value="parallel">parallel</option>
            </select>
          </label>
        ) : null}
        {showWhen ? (
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
        {showLoopFields ? (
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
        {showParallelNote ? (
          <p className="mb-3 font-mono text-[11px] text-on-surface-variant">
            {target.mode === "wrap"
              ? "Wraps the target step in a single parallel lane."
              : "Parallel lanes have no condition to edit."}
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
          {canSave ? (
            <button
              type="button"
              className="rounded bg-primary px-3 py-1.5 font-mono text-[11px] text-on-primary disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                if (activeKind === "branch") {
                  onSave({
                    ...(target.mode === "wrap" ? { routeKind: "branch" } : {}),
                    whenText,
                  })
                  return
                }
                if (activeKind === "parallel") {
                  onSave({ routeKind: "parallel" })
                  return
                }
                const trimmed = maxRoundsText.trim()
                const maxRounds =
                  trimmed === "" ? undefined : Number.parseInt(trimmed, 10)
                if (trimmed !== "" && (!Number.isFinite(maxRounds) || (maxRounds ?? 0) < 1)) {
                  return
                }
                onSave({
                  ...(target.mode === "wrap" ? { routeKind: "loop" } : {}),
                  untilText,
                  maxRounds,
                })
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
