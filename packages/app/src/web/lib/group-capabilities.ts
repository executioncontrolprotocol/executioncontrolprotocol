/**
 * One capability row in the capability menu.
 * @category App
 */
export interface CapabilityMenuEntry {
  /** Capability id. */
  id: string
  /** Owning plugin id. */
  plugin: string
  /** Short human summary. */
  summary: string
}

/**
 * Capability menu section grouped by plugin.
 * @category App
 */
export interface CapabilityMenuGroup {
  /** Plugin id used as the group heading. */
  plugin: string
  /** Capabilities in host list order within this plugin. */
  entries: CapabilityMenuEntry[]
}

/**
 * Group capability rows by plugin, preserving first-seen plugin order and entry order within each group.
 * @category App
 */
export function groupCapabilities(entries: readonly CapabilityMenuEntry[]): CapabilityMenuGroup[] {
  const order: string[] = []
  const byPlugin = new Map<string, CapabilityMenuEntry[]>()
  for (const entry of entries) {
    let list = byPlugin.get(entry.plugin)
    if (!list) {
      list = []
      byPlugin.set(entry.plugin, list)
      order.push(entry.plugin)
    }
    list.push(entry)
  }
  return order.map((plugin) => ({ plugin, entries: byPlugin.get(plugin) ?? [] }))
}

/**
 * Short name of a capability id (segment after the last `.`).
 * @category App
 */
export function capabilityShortName(id: string): string {
  const dot = id.lastIndexOf(".")
  return dot >= 0 ? id.slice(dot + 1) : id
}