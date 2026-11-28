/**
 * One capability row in the capability menu.
 * @category App
 */
export interface CapabilityMenuEntry {
  /** Capability id, or {@link CONTROL_NODE_ENTRY_ID} for the control node. */
  id: string
  /** Owning plugin id, or {@link CORE_GROUP_ID} for Core rows. */
  plugin: string
  /** Short human summary. */
  summary: string
  /** Capability manifest `contract`, when present. */
  contract?: "step"
  /** Capability manifest `code`, when present. */
  code?: "script" | "expression"
  /** True for the synthetic control node entry. */
  controlNode?: boolean
}

/**
 * Capability menu section grouped by plugin.
 * @category App
 */
export interface CapabilityMenuGroup {
  /** Plugin id used as the group heading. */
  plugin: string
  /** Capabilities in host list order within this group. */
  entries: CapabilityMenuEntry[]
}

/** Core group heading in the add-node menu. @category App */
export const CORE_GROUP_ID = "Core"

import { CONTROL_NODE_ENTRY_ID } from "../../graph/structure-edit.js"

export { CONTROL_NODE_ENTRY_ID }

/**
 * Whether a capability belongs in the Core group (transform script steps).
 * @category App
 */
export function isCoreTransformEntry(entry: CapabilityMenuEntry): boolean {
  return entry.contract === "step" && entry.code === "script"
}

/**
 * Group capability rows: Core (control node and transform capabilities) first, then plugin groups.
 * @category App
 */
export function groupCapabilities(entries: readonly CapabilityMenuEntry[]): CapabilityMenuGroup[] {
  const control: CapabilityMenuEntry = {
    id: CONTROL_NODE_ENTRY_ID,
    plugin: CORE_GROUP_ID,
    summary: "Control node (if, loop, parallel)",
    controlNode: true,
  }
  const coreTransforms = entries.filter((entry) => isCoreTransformEntry(entry) && !entry.controlNode)
  const pluginEntries = entries.filter((entry) => !isCoreTransformEntry(entry) && !entry.controlNode)

  const order: string[] = []
  const byPlugin = new Map<string, CapabilityMenuEntry[]>()
  for (const entry of pluginEntries) {
    let list = byPlugin.get(entry.plugin)
    if (!list) {
      list = []
      byPlugin.set(entry.plugin, list)
      order.push(entry.plugin)
    }
    list.push(entry)
  }

  const groups: CapabilityMenuGroup[] = []
  const coreRows = [control, ...coreTransforms]
  if (coreRows.length > 0) groups.push({ plugin: CORE_GROUP_ID, entries: coreRows })
  for (const plugin of order) groups.push({ plugin, entries: byPlugin.get(plugin) ?? [] })
  return groups
}

/**
 * Short name of a capability id (segment after the last `.`).
 * @category App
 */
export function capabilityShortName(id: string): string {
  if (id === CONTROL_NODE_ENTRY_ID) return "control node"
  const dot = id.lastIndexOf(".")
  return dot >= 0 ? id.slice(dot + 1) : id
}