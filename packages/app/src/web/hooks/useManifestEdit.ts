import { useCallback, useState } from "react"
import type { ExecutionManifest, ValidationIssue } from "@executioncontrolprotocol/protocol"
import { UnauthorizedError, type AppHostClient } from "../../client/index.js"
import { executionUpdateInput, interpretCommitResponse, isExecutionUpdateRefusal } from "../../client/document-state.js"
import type { StructureEditResult } from "../../graph/index.js"
import type { ExecutionSource } from "./useExecutionDocument.js"

/**
 * Persist structural manifest edits through draft `commit`.
 * @category App
 */
export function useManifestEdit(
  client: AppHostClient,
  source: ExecutionSource,
  version: number | string | undefined,
  manifest: ExecutionManifest | undefined,
  onUnauthorized: () => void,
  readOnly: boolean,
  applyCommit: (manifest: ExecutionManifest, nextVersion: number | string, issues: readonly ValidationIssue[]) => void,
  onVersionConflict: () => void,
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
      const input = executionUpdateInput(source, result.manifest, version)
      if (isExecutionUpdateRefusal(input)) {
        setError(input.error)
        return false
      }
      try {
        const response = await client.commit(input)
        const outcome = interpretCommitResponse(response)
        if (!outcome.ok) {
          if ("versionConflict" in outcome && outcome.versionConflict) {
            onVersionConflict()
            return false
          }
          setError("message" in outcome ? outcome.message : "Commit refused.")
          return false
        }
        applyCommit(result.manifest, outcome.version, outcome.issues)
        return true
      } catch (cause) {
        if (cause instanceof UnauthorizedError) onUnauthorized()
        else setError(cause instanceof Error ? cause.message : String(cause))
        return false
      }
    },
    [applyCommit, client, manifest, onUnauthorized, onVersionConflict, readOnly, source, version],
  )

  return { apply, error, clearError: () => setError(undefined) }
}