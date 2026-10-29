/**
 * One tab in {@link PaneTabBar}.
 * @category App
 */
export interface PaneTabBarTab<T extends string> {
  /** Tab id (also used as React key). */
  id: T
  /** Visible label. */
  label: string
  /** Optional `data-testid`. Defaults to `ecp-tab-${id}`. */
  testId?: string
}

/**
 * Props for {@link PaneTabBar}.
 * @category App
 */
export interface PaneTabBarProps<T extends string> {
  /** Tabs, left to right. */
  tabs: readonly PaneTabBarTab<T>[]
  /** Selected tab id. */
  active: T
  /** Called when the user selects a tab. */
  onChange: (id: T) => void
}

/**
 * Shared 32px tab strip for the split-pane columns.
 * Inactive tabs keep a transparent bottom border so the active underline does not shift layout.
 *
 * @category App
 */
export function PaneTabBar<T extends string>({ tabs, active, onChange }: PaneTabBarProps<T>) {
  return (
    <nav className="flex h-8 shrink-0 items-center border-b border-outline-variant bg-surface-container-low px-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-testid={tab.testId ?? `ecp-tab-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={`inline-flex h-full items-center px-4 font-mono text-label uppercase leading-none tracking-widest transition-colors ${
            active === tab.id
              ? "border-b-2 border-primary text-primary"
              : "border-b-2 border-transparent text-on-surface-variant hover:text-primary"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
