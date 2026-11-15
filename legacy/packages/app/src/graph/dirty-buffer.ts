/**
 * Whether a watched file snapshot should replace the in-memory editor buffer.
 * A dirty buffer (local text differs from the last acknowledged save) is kept.
 * @category App
 */
export function shouldApplyWatchedSource(
  localSource: string,
  acknowledgedSource: string
): boolean {
  return localSource === acknowledgedSource
}
