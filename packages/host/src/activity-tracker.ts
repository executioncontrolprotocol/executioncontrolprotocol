/**
 * Host-side activity tracking for idle shutdown (not touched by supervisor health polls).
 * @category Host
 */
export class HostActivityTracker {
  private lastActivityAt: string
  private openStreams = 0

  /**
   * @param startedAt Initial activity timestamp (typically host healthy time).
   */
  constructor(startedAt = new Date().toISOString()) {
    this.lastActivityAt = startedAt
  }

  /** Record API activity that resets the idle clock. */
  touch(): void {
    this.lastActivityAt = new Date().toISOString()
  }

  /** A watch stream opened. */
  streamOpened(): void {
    this.openStreams += 1
  }

  /** A watch stream closed; resets the idle clock. */
  streamClosed(): void {
    this.openStreams = Math.max(0, this.openStreams - 1)
    this.touch()
  }

  /** Current snapshot for `/v1/health`. */
  snapshot(): { lastActivityAt: string; openStreams: number } {
    return { lastActivityAt: this.lastActivityAt, openStreams: this.openStreams }
  }
}