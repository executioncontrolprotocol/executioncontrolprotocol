import { useCallback, useEffect, useRef, useState } from "react"
import type { ExecutionManifest, OperationError, ExecutionItem } from "@executioncontrolprotocol/protocol"
import {
  applyCommitSuccess,
  applyRetrieveItem,
  applyRetrieveRefusal,
  VERSION_CONFLICT_NOTE,
} from "../../client/document-state.js"
import {
  HostRequestError,
  retrieveItem,
  UnauthorizedError,
  watchSse,
  type AppHostClient,
  type AppValidation,
} from "../../client/index.js"

/**
 * Where the open execution comes from.
 * @category App
 */
export type ExecutionSource = { kind: "path"; path: string } | { kind: "id"; id: string }

/**
 * Loaded execution plus its validation. On a failed reload the last good manifest and
 * validation stay and `loadError` is set.
 * @category App
 */
export interface ExecutionDocumentState {
  /** Last manifest that parsed. */
  manifest?: ExecutionManifest
  /** Version for optimistic concurrency (string for paths, number for ids). */
  version?: number | string
  /** Validation of the last good manifest. */
  validation?: AppValidation
  /** Why the latest load failed, until the next good load. */
  loadError?: OperationError
  /** Shown after `ECP_VERSION_CONFLICT` until the next successful commit. */
  versionConflictNote?: string
  /** True until the first load attempt finishes. */
  loading: boolean
  /** Count of good loads (1 after the first). */
  loads: number
  /** Count of run storage changes seen on the watch stream. */
  runChanges: number
}

/**
 * `execution` value for `execute` that names the open execution.
 * @category App
 */
export function executionRef(source: ExecutionSource): { path: string } | { id: string } {
  return source.kind === "path" ? { path: source.path } : { id: source.id }
}

function errorOf(error: unknown): OperationError {
  if (error instanceof HostRequestError) return error.error
  return { code: "ECP_INTERNAL", message: error instanceof Error ? error.message : String(error) }
}

function retrieveInput(source: ExecutionSource): { type: "execution"; path: string } | { type: "execution"; id: string } {
  return source.kind === "path"
    ? { type: "execution", path: source.path }
    : { type: "execution", id: source.id }
}

/**
 * Load and hot-reload an execution via `retrieve`. Path sources reload on file events from
 * `/v1/watch?path=`; id sources reload on storage changes for that id. Reloads that arrive
 * while one is in flight are coalesced into one more. `source` must be referentially stable.
 * @category App
 */
export function useExecutionDocument(
  client: AppHostClient,
  source: ExecutionSource,
  onUnauthorized: () => void,
): ExecutionDocumentState & {
  reload: () => void
  noteVersionConflict: () => void
  applyCommit: (manifest: ExecutionManifest, version: number | string, issues: readonly import("@executioncontrolprotocol/protocol").ValidationIssue[]) => void
} {
  const [state, setState] = useState<ExecutionDocumentState>({ loading: true, loads: 0, runChanges: 0 })
  const busy = useRef(false)
  const pending = useRef(false)
  const alive = useRef(true)

  const loadOnce = useCallback(async (): Promise<void> => {
    let response
    try {
      response = await client.retrieve(retrieveInput(source))
    } catch (error) {
      if (error instanceof UnauthorizedError) return
      if (!alive.current) return
      setState((prev) => ({
        ...prev,
        loading: false,
        loadError: errorOf(error),
      }))
      return
    }
    if (!alive.current) return
    const item = retrieveItem<ExecutionItem>(response)
    if (!item) {
      if (!response.ok) {
        setState((prev) => ({
          ...prev,
          ...applyRetrieveRefusal(prev, response.error),
          loading: false,
        }))
        return
      }
      setState((prev) => ({
        ...prev,
        loading: false,
        loadError: {
          code: "ECP_NOT_FOUND",
          message:
            source.kind === "id"
              ? `Execution ${source.id} was not found.`
              : `Execution ${source.path} was not found.`,
        },
      }))
      return
    }
    setState((prev) => {
      const mapped = applyRetrieveItem(prev, item, { keepConflictNote: Boolean(prev.versionConflictNote) })
      return {
        ...prev,
        manifest: mapped.manifest ?? prev.manifest,
        version: mapped.version ?? prev.version,
        validation: mapped.validation,
        loadError: mapped.loadError,
        versionConflictNote: mapped.versionConflictNote ?? prev.versionConflictNote,
        loading: false,
        loads: prev.loads + 1,
      }
    })
  }, [client, source])

  const reload = useCallback(() => {
    if (busy.current) {
      pending.current = true
      return
    }
    busy.current = true
    void (async () => {
      try {
        do {
          pending.current = false
          try {
            await loadOnce()
          } catch (error) {
            if (error instanceof UnauthorizedError || !alive.current) return
            setState((prev) => ({ ...prev, loading: false, loadError: errorOf(error) }))
          }
        } while (pending.current && alive.current)
      } finally {
        busy.current = false
      }
    })()
  }, [loadOnce])

  const noteVersionConflict = useCallback(() => {
    setState((prev) => ({ ...prev, versionConflictNote: VERSION_CONFLICT_NOTE }))
    reload()
  }, [reload])

  const applyCommit = useCallback(
    (
      manifest: ExecutionManifest,
      version: number | string,
      issues: readonly import("@executioncontrolprotocol/protocol").ValidationIssue[],
    ) => {
      setState((prev) => ({ ...prev, ...applyCommitSuccess(manifest, version, issues) }))
    },
    [],
  )

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    reload()
    const url =
      source.kind === "path"
        ? client.watchUrl({ path: source.path, types: ["run"] })
        : client.watchUrl({ id: source.id, types: ["execution", "run"] })
    void watchSse(
      url,
      client.token,
      {
        onFile: () => reload(),
        onStorage: (change) => {
          if (change.type === "run") {
            setState((prev) => ({ ...prev, runChanges: prev.runChanges + 1 }))
            return
          }
          if (source.kind === "id" && change.type === "execution" && change.id === source.id) reload()
        },
        onOpen: (reconnected) => {
          if (reconnected) reload()
        },
        onUnauthorized,
      },
      controller.signal,
      { fetch: client.fetch },
    )
    return () => {
      alive.current = false
      controller.abort()
    }
  }, [client, source, reload, onUnauthorized])

  return { ...state, reload, noteVersionConflict, applyCommit }
}