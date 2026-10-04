/** Distance from the bottom (px) still treated as "stuck to bottom". */
export const CHAT_STICK_BOTTOM_THRESHOLD_PX = 64

/**
 * Whether the scroll container is near enough to the bottom to keep auto-scrolling.
 */
export function isChatNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  thresholdPx: number = CHAT_STICK_BOTTOM_THRESHOLD_PX
): boolean {
  const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
  return distanceFromBottom <= thresholdPx
}
