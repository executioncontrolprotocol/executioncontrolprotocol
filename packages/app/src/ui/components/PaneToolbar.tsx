import type { ReactNode } from "react"

/**
 * Props for {@link PaneToolbar}.
 * @category App
 */
export interface PaneToolbarProps {
  /** Toolbar contents (chips, labels, actions). */
  children: ReactNode
}

/**
 * Shared 32px second-row chrome under {@link PaneTabBar}.
 * @category App
 */
export function PaneToolbar({ children }: PaneToolbarProps) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-outline-variant/60 bg-surface-container-low px-2">
      {children}
    </div>
  )
}
