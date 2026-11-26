import type { NodeProps } from "@xyflow/react"
import type { ReactFlowTunnelData, ReactFlowTunnelKind } from "../../graph/index.js"

const TUNNEL_TONE_STYLE: Record<ReactFlowTunnelKind, { backgroundColor: string; borderColor: string }> = {
  then: { backgroundColor: "#3fb95024", borderColor: "#3fb95073" },
  else: { backgroundColor: "#f851491f", borderColor: "#f8514966" },
  path: { backgroundColor: "#58a6ff1f", borderColor: "#58a6ff66" },
  loop: { backgroundColor: "#d8d8d80f", borderColor: "#9a9a9a73" },
}

/**
 * Decorative tunnel outline (tinted rounded rectangle; not interactive).
 * @category App
 */
interface EcpTunnelNodeData extends ReactFlowTunnelData {
  dimmed?: boolean
}

export function EcpTunnelNode({ id, data }: NodeProps) {
  const tunnel = data as unknown as EcpTunnelNodeData
  const toneClass = `ecp-rf-tunnel--${tunnel.tunnelKind}`
  const slug = id.startsWith("ecp:tunnel:") ? id.slice("ecp:tunnel:".length).replace(/:/g, "-") : id

  return (
    <div
      className={[`ecp-rf-tunnel`, toneClass, tunnel.dimmed ? "ecp-rf-tunnel--dimmed" : ""].filter(Boolean).join(" ")}
      data-testid={`ecp-tunnel-${slug}`}
      data-kind={tunnel.tunnelKind}
      data-detached={tunnel.detached ? "true" : "false"}
      style={{ width: "100%", height: "100%", ...TUNNEL_TONE_STYLE[tunnel.tunnelKind] }}
    >
      <span className="ecp-rf-tunnel-label">{tunnel.label}</span>
      {tunnel.detached ? (
        <span className="ecp-rf-detached-badge" data-testid={`ecp-detached-${tunnel.structureId}`}>
          disconnected
        </span>
      ) : null}
    </div>
  )
}