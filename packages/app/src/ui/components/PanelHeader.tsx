/** Props for {@link PanelHeader}. */
export interface PanelHeaderProps {
  /** Material Symbols icon name. */
  icon: string
  /** Uppercase panel title. */
  label: string
}

/** Unified 32px panel chrome header (matches {@link PaneToolbar}). */
export function PanelHeader({ icon, label }: PanelHeaderProps) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-outline-variant/60 bg-surface-container-low px-2">
      <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
      <span className="font-mono text-label uppercase tracking-widest text-on-surface-variant">
        {label}
      </span>
    </div>
  )
}
