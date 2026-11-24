/**
 * Debounced text-edit scheduler for autosave (pure timer state).
 * @category App
 */

/** Milliseconds after the last keystroke before a text edit commits. */
export const AUTOSAVE_TEXT_MS = 500

export interface TextSchedulerState {
  /** Timer handle id when scheduled (browser) or deadline ms (tests). */
  deadline?: number
}

/**
 * Create an empty scheduler.
 * @category App
 */
export function createTextScheduler(): TextSchedulerState {
  return {}
}

/**
 * True when a flush has not yet fired.
 * @category App
 */
export function textSchedulerPending(state: TextSchedulerState): boolean {
  return state.deadline !== undefined
}

/**
 * Record that a new keystroke reset the deadline to `now + AUTOSAVE_TEXT_MS`.
 * @category App
 */
export function textSchedulerSchedule(_state: TextSchedulerState, nowMs: number): TextSchedulerState {
  return { deadline: nowMs + AUTOSAVE_TEXT_MS }
}

/**
 * Clear the deadline without firing (discard pending text debounce).
 * @category App
 */
export function textSchedulerDiscard(_state: TextSchedulerState): TextSchedulerState {
  return {}
}

/**
 * Clear the deadline after an immediate flush.
 * @category App
 */
export function textSchedulerFlush(_state: TextSchedulerState): TextSchedulerState {
  return {}
}

/**
 * True when `nowMs` has reached the scheduled deadline.
 * @category App
 */
export function textSchedulerDue(state: TextSchedulerState, nowMs: number): boolean {
  return state.deadline !== undefined && nowMs >= state.deadline
}