/** Mermaid flowchart direction (first line: `flowchart <direction>`). @category Encoding */
export type MermaidFlowchartDirection = "TD" | "LR" | "RL" | "BT"

/** Options for `@executioncontrolprotocol/format-mermaid` encode (via `ecp.encode(...).uses("@executioncontrolprotocol/format-mermaid").with({...})`). @category Encoding */
export interface MermaidEncodeOptions {
  /** Flowchart direction. Default `TD`. Use `LR` for left-to-right. */
  direction?: MermaidFlowchartDirection
}

/** Resolve Mermaid header line from encode options. @category Encoding */
export function mermaidFlowchartHeader(options?: MermaidEncodeOptions): string {
  return `flowchart ${resolveMermaidDirection(options)}`
}

/** Flow direction for chart and subgraph layout. @category Encoding */
export function resolveMermaidDirection(options?: MermaidEncodeOptions): MermaidFlowchartDirection {
  return options?.direction ?? "TD"
}
