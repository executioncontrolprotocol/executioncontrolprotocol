import { useCallback, useEffect, useRef, useState } from "react"
import type { ExecutionManifest, OperationError, StoredExecution } from "@executioncontrolprotocol/protocol"
import {
  HostRequestError,
  parseExecutionText,
  retrieveItem,
  UnauthorizedError,
  validationFromExecute,
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
  /** Validation of the last good manifest. */
  validation?: AppValidation
  /** Why the latest load failed, until the next good load. */
  loadError?: OperationError
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

/**
 * Load, validate and hot-reload an execution. Path sources reload on file events from
 * `/v1/watch?path=`; id sources reload on storage changes for that id. Reloads that arrive
 * while one is in flight are coalesced into one more. `source` must be referentially stable.
 * @category App
 */
export function useExecutionDocument(
  client: AppHostClient,
  source: ExecutionSource,
  onUnauthorized: () => void,
): ExecutionDocumentState & { reload: () => void } {
  const [state, setState] = useState<ExecutionDocumentState>({ loading: true, loads: 0, runChanges: 0 })
  const busy = useRef(false)
  const pending = useRef(false)
  const alive = useRef(true)

  const loadOnce = useCallback(async (): Promise<void> => {
    let manifest: ExecutionManifest | undefined
    let loadError: OperationError | undefined
    if (source.kind === "path") {
      try {
        const parsed = parseExecutionText(await client.getFile(source.path))
        if (parsed.ok) manifest = parsed.manifest
        else loadError = parsed.error
      } catch (error) {
        if (error instanceof UnauthorizedError) return
        loadError = errorOf(error)
      }
    } else {
      const response = await client.retrieve({ type: "execution", id: source.id })
      const item = retrieveItem<StoredExecution>(response)
      if (item) manifest = item.manifest
      else loadError = response.ok ? { code: "ECP_NOT_FOUND", message: `Execution ${source.id} was not found.` } : response.error
    }
    if (!alive.current) return
    if (!manifest) {
      setState((prev) => ({ ...prev, loading: false, loadError }))
      return
    }
    const validation = validationFromExecute(await client.execute({ mode: "validate", execution: executionRef(source) }))
    if (!alive.current) return
    setState((prev) => ({
      ...prev,
      manifest,
      validation,
      loadError: undefined,
      loading: false,
      loads: prev.loads + 1,
    }))
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

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    reload()
    const url =
      source.kind === "path"
        ? client.watchUrl({ path: source.path, types: ["run"] })
        : client.watchUrl({ types: ["execution", "run"] })
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

  return { ...state, reload }
}
