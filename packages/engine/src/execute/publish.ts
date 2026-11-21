import type {
  CapabilityEntry,
  CapabilityPublishMetadata,
  FileRef,
  PublishRecord,
  RunStore,
} from "@executioncontrolprotocol/protocol"

/**
 * Run store methods used when recording publish entries.
 * @category Environment
 */
export type PublishRunStore = Pick<RunStore, "get" | "update">

/**
 * A run's publish entries. One ledger per run: entries change in memory and each write sends the whole current list,
 * queued so writes land in order. Parallel branches that publish at the same time can't lose each other's entries.
 * @category Environment
 */
export interface PublishLedger {
  /** After a successful step, append or close {@link PublishRecord} entries from the capability's metadata. */
  record(
    capability: CapabilityEntry | undefined,
    stepId: string,
    round: number | undefined,
    input: unknown,
    output: unknown,
  ): Promise<void>
}

/**
 * Create the publish ledger for one run. Existing entries (a resumed run) are loaded once, on first use.
 * @category Environment
 */
export function createPublishLedger(store: PublishRunStore, runId: string): PublishLedger {
  let publishes: PublishRecord[] | undefined
  let loading: Promise<PublishRecord[]> | undefined
  let writes: Promise<void> = Promise.resolve()

  const load = async (): Promise<PublishRecord[]> => {
    if (publishes) return publishes
    loading ??= store.get(runId).then((detail) => (publishes = [...(detail?.publishes ?? [])]))
    return loading
  }

  return {
    async record(capability, stepId, round, input, output) {
      if (!capability?.role || !capability.publish) return
      const entries = await load()
      const at = new Date().toISOString()
      if (capability.role === "publish") {
        const entry = buildPublishEntry(capability.publish, capability.id, stepId, round ?? null, at, input, output)
        if (!entry) return
        entries.push(entry)
      } else if (!markUnpublish(entries, capability.publish, stepId, at, input, output)) {
        return
      }
      const write = writes.then(() => store.update(runId, { publishes: entries.map((entry) => ({ ...entry })) }))
      writes = write.catch(() => {})
      await write
    },
  }
}

/**
 * Build one publish entry from a successful publish step.
 * @category Environment
 */
export function buildPublishEntry(
  meta: CapabilityPublishMetadata,
  capabilityId: string,
  stepId: string,
  round: number | null,
  at: string,
  input: unknown,
  output: unknown,
): PublishRecord | undefined {
  const fileField = meta.fileField ?? "file"
  const published = readField(output, fileField)
  if (!isUrlFileRef(published)) return undefined
  const sourceRaw = readField(input, fileField)
  const source = isFileRef(sourceRaw) ? stripHeaders(sourceRaw) : sourceRaw
  if (!isFileRef(source)) return undefined
  const locator = readLocator(meta, output, input)
  if (!locator) return undefined
  return {
    stepId,
    round,
    capabilityId,
    at,
    source,
    url: published.url,
    locator,
  }
}

/**
 * Mark publish entries whose locator matches an unpublish step.
 * @category Environment
 */
export function markUnpublish(
  publishes: PublishRecord[],
  meta: CapabilityPublishMetadata,
  stepId: string,
  at: string,
  input: unknown,
  output: unknown,
): boolean {
  const locator = readLocator(meta, output, input)
  if (!locator) return false
  let changed = false
  for (const entry of publishes) {
    if (entry.deletedAt) continue
    if (!locatorMatches(entry.locator, locator, meta.locatorFields)) continue
    entry.deletedAt = at
    entry.deleteStepId = stepId
    changed = true
  }
  return changed
}

function readLocator(
  meta: CapabilityPublishMetadata,
  output: unknown,
  input: unknown,
): Record<string, string> | undefined {
  const locator: Record<string, string> = {}
  for (const field of meta.locatorFields) {
    const fromOutput = readField(output, field)
    const fromInput = readField(input, field)
    const value = stringifyLocatorValue(fromOutput ?? fromInput)
    if (value === undefined) return undefined
    locator[field] = value
  }
  return locator
}

function locatorMatches(
  left: Record<string, string>,
  right: Record<string, string>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => left[field] === right[field])
}

function stringifyLocatorValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return undefined
}

function readField(value: unknown, field: string): unknown {
  if (!isRecord(value)) return undefined
  return value[field]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFileRef(value: unknown): value is FileRef {
  if (!isRecord(value) || typeof value.kind !== "string") return false
  if (value.kind === "file") return typeof value.path === "string"
  if (value.kind === "url") return typeof value.url === "string"
  if (value.kind === "artifact") return typeof value.uri === "string"
  return false
}

function isUrlFileRef(value: unknown): value is Extract<FileRef, { kind: "url" }> {
  return isFileRef(value) && value.kind === "url"
}

function stripHeaders(ref: FileRef): FileRef {
  if (ref.kind !== "url" || ref.headers === undefined) return ref
  const { headers: omitted, ...rest } = ref
  void omitted
  return rest
}