import { useCallback, useState } from "react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { UnauthorizedError, type AppHostClient } from "../../client/index.js"
import type { StructureEditResult } from "../../graph/index.js"
import type { ExecutionSource } from "./useExecutionDocument.js"

/**
 * Persist structural manifest edits through the App's current save path.
 * @category App
 */
export function useManifestEdit(
  client: AppHostClient,
  source: ExecutionSource,
  storedVersion: number | undefined,
  manifest: ExecutionManifest | undefined,
  onUnauthorized: () => void,
  readOnly: boolean,
) {
  const [error, setError] = useState<string | undefined>(undefined)

  const apply = useCallback(
    async (edit: (current: ExecutionManifest) => StructureEditResult): Promise<boolean> => {
      if (readOnly || !manifest) return false
      setError(undefined)
      const result = edit(manifest)
      if (!result.ok) {
        setError(result.reason)
        return false
      }
      try {
        if (source.kind === "path") {
          await client.putFile(source.path, `${JSON.stringify(result.manifest, null, 2)}\n`)
        } else if (storedVersion !== undefined) {
          const response = await client.commit({
            type: "execution",
            action: "update",
            object: result.manifest,
            ifVersion: storedVersion,
          })
          if (!response.ok) {
            setError(response.error.message)
            return false
          }
        } else {
          setError("Stored version is not loaded.")
          return false
        }
        return true
      } catch (cause) {
        if (cause instanceof UnauthorizedError) onUnauthorized()
        else setError(cause instanceof Error ? cause.message : String(cause))
        return false
      }
    },
    [client, manifest, onUnauthorized, readOnly, source, storedVersion],
  )

  return { apply, error, clearError: () => setError(undefined) }
}