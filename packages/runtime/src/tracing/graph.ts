/**
 * Execution graph renderer — produces an ASCII tree visualization
 * of a Context execution for `ecp graph`.
 *
 * @category Tracing
 */

import type { ExecutionTrace, TraceSpan } from "./types.js";

interface TreeNode {
  label: string;
  detail?: string;
  children: TreeNode[];
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function spanLabel(span: TraceSpan): string {
  switch (span.type) {
    case "executor":
      return `${span.executorName}`;

    case "model-generation": {
      const tok = span.tokens ? `, ${span.tokens.total} tok` : "";
      return `model: ${span.model ?? "?"}${tok}, ${span.durationMs}ms`;
    }

    case "tool-call":
      return `tool: ${span.toolName} (${span.durationMs}ms)`;

    case "mount-hydration":
      return `mount: ${span.mountName} [${span.mountStage}] → ${span.mountItemCount ?? 0} items`;

    case "delegation":
      return `delegate → ${span.executorName}`;

    default:
      return span.type;
  }
}

function spanDetail(span: TraceSpan): string | undefined {
  if (span.reasoning) {
    return `reasoning: ${truncate(span.reasoning, 120)}`;
  }
  if (span.output) {
    return `output: ${truncate(JSON.stringify(span.output), 120)}`;
  }
  if (span.error) {
    return `error: ${span.error}`;
  }
  return undefined;
}

function buildTree(trace: ExecutionTrace): TreeNode {
  const root: TreeNode = {
    label: `${trace.executionId} — ${trace.contextName} v${trace.contextVersion} (${trace.strategy}, ${trace.durationMs}ms)`,
    children: [],
  };

  const executorNodes = new Map<string, TreeNode>();
  const executorSpanIds = new Map<string, string>();

  for (const span of trace.spans) {
    if (span.type === "executor") {
      const node: TreeNode = {
        label: `${span.executorName} (${span.durationMs}ms)`,
        detail: span.error ? `error: ${span.error}` : undefined,
        children: [],
      };
      executorNodes.set(span.executorName, node);
      executorSpanIds.set(span.id, span.executorName);
      root.children.push(node);
    }
  }

  for (const span of trace.spans) {
    if (span.type === "executor") continue;

    let parent = executorNodes.get(span.executorName);
    if (!parent) {
      parent = {
        label: `${span.executorName}`,
        children: [],
      };
      executorNodes.set(span.executorName, parent);
      root.children.push(parent);
    }

    const node: TreeNode = {
      label: spanLabel(span),
      detail: spanDetail(span),
      children: [],
    };
    parent.children.push(node);
  }

  return root;
}

function renderTree(node: TreeNode, prefix: string, isLast: boolean): string[] {
  const lines: string[] = [];
  const connector = isLast ? "└── " : "├── ";
  const childPrefix = isLast ? "    " : "│   ";

  lines.push(prefix + connector + node.label);
  if (node.detail) {
    lines.push(prefix + childPrefix + node.detail);
  }

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const last = i === node.children.length - 1;
    lines.push(...renderTree(child, prefix + childPrefix, last));
  }

  return lines;
}

/**
 * Render an execution trace as an ASCII tree.
 *
 * @param trace - The trace to render.
 * @returns Multi-line string with tree visualization.
 *
 * @category Tracing
 */
export function renderGraph(trace: ExecutionTrace): string {
  const tree = buildTree(trace);
  const lines: string[] = [];

  lines.push("");
  lines.push(tree.label);

  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    const last = i === tree.children.length - 1;
    lines.push(...renderTree(child, "", last));
  }

  lines.push("");
  return lines.join("\n");
}
