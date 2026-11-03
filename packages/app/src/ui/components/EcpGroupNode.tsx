import type { NodeProps } from "@xyflow/react"
import type { ReactFlowGroupData } from "../../graph/index.js"

/** Visual-only frame for parallel / branch / loop structure. */
export function EcpGroupNode({ data }: NodeProps) {
  const group = data as unknown as ReactFlowGroupData
  return (
    <div
      data-testid={`ecp-group-${group.kind}`}
      className="ecp-rf-group h-full w-full rounded-lg border border-dashed border-outline-variant bg-surface-container/40 px-2 py-1"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-display text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">
          {group.kind}
        </span>
        {group.label && group.label !== group.kind ? (
          <span className="font-mono text-[10px] text-on-surface">{group.label}</span>
        ) : null}
        {group.untilBadge ? (
          <span
            className="rounded border border-outline-variant bg-surface-container-high px-1.5 py-0.5 font-mono text-[9px] text-tertiary-fixed-dim"
            title={group.untilBadge}
          >
            until {group.untilBadge}
          </span>
        ) : null}
      </div>
      {group.arms && group.arms.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {group.arms.map((arm, index) => (
            <span
              key={`${arm.whenBadge}-${index}`}
              className="rounded border border-outline-variant bg-surface-container-high px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant"
              title={arm.whenBadge}
            >
              {arm.label ? `${arm.label}: ` : ""}
              {arm.whenBadge}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
