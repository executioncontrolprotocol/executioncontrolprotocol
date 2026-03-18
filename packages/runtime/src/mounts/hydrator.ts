/**
 * Mount hydration service.
 *
 * Evaluates mounts by calling tool servers via the {@link ToolInvoker},
 * respecting stage ordering, limits, and selectors.
 *
 * @category Mounts
 */

import type { Mount, MountStage } from "@executioncontrolprotocol/spec";
import type { ToolInvoker } from "../protocols/tool-invoker.js";
import type { MountOutput, ResolvedInputs } from "../engine/types.js";
import type { InterpolationContext, SelectorResult } from "./types.js";
import { interpolateArgs } from "./interpolation.js";

/**
 * Resolve the selected IDs from a plan output for focus/deep mount expansion.
 *
 * @param selectorPath - Dot-path into the plan output (e.g. `"plan.selectedIssueIds"`).
 * @param planOutput - The orchestrator's plan output.
 * @param maxSelected - Maximum items to select.
 * @returns The resolved selector result.
 *
 * @category Mounts
 */
export function resolveSelector(
  selectorPath: string,
  planOutput: Record<string, unknown>,
  maxSelected?: number,
): SelectorResult {
  const parts = selectorPath.split(".");
  let current: unknown = planOutput;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return { ids: [], wasCapped: false, originalCount: 0 };
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (!Array.isArray(current)) {
    return { ids: [], wasCapped: false, originalCount: 0 };
  }

  const allIds = current.map(String);
  const max = maxSelected ?? allIds.length;
  const capped = allIds.length > max;

  return {
    ids: allIds.slice(0, max),
    wasCapped: capped,
    originalCount: allIds.length,
  };
}

/**
 * Default mount hydrator backed by a {@link ToolInvoker}.
 *
 * @category Mounts
 */
export class DefaultMountHydrator {
  constructor(
    private readonly toolInvoker: ToolInvoker,
  ) {}

  /**
   * Hydrate a set of mounts for a specific stage.
   *
   * @param mounts - The mount definitions to hydrate.
   * @param stage - The stage to hydrate (`"seed"`, `"focus"`, or `"deep"`).
   * @param inputs - Resolved Context inputs for interpolation.
   * @param planOutput - The orchestrator's plan output (for focus/deep selectors).
   * @returns Hydrated mount outputs.
   */
  async hydrateStage(
    mounts: Mount[],
    stage: MountStage,
    inputs: ResolvedInputs,
    planOutput?: Record<string, unknown>,
  ): Promise<MountOutput[]> {
    const stageMounts = mounts.filter((m) => m.stage === stage);
    const results: MountOutput[] = [];

    for (const mount of stageMounts) {
      const output = await this.hydrateMount(mount, inputs, planOutput);
      results.push(output);
    }

    return results;
  }

  private async hydrateMount(
    mount: Mount,
    inputs: ResolvedInputs,
    planOutput?: Record<string, unknown>,
  ): Promise<MountOutput> {
    const { from } = mount;

    if (mount.when?.selectorFrom && planOutput) {
      return this.hydrateFocusDeepMount(mount, inputs, planOutput);
    }

    const ctx: InterpolationContext = { inputs };
    const args = from.args ? interpolateArgs(from.args, ctx) : {};

    try {
      const result = await this.toolInvoker.callTool(
        from.server,
        from.tool,
        args,
      );

      if (result.isError) {
        return {
          mountName: mount.name,
          stage: mount.stage,
          data: [],
          itemCount: 0,
        };
      }

      const data = this.enforceLimit(result.content, mount.limits?.maxItems);
      const itemCount = Array.isArray(data) ? data.length : 1;

      return {
        mountName: mount.name,
        stage: mount.stage,
        data,
        itemCount,
      };
    } catch {
      return {
        mountName: mount.name,
        stage: mount.stage,
        data: [],
        itemCount: 0,
      };
    }
  }

  private async hydrateFocusDeepMount(
    mount: Mount,
    inputs: ResolvedInputs,
    planOutput: Record<string, unknown>,
  ): Promise<MountOutput> {
    const selector = resolveSelector(
      mount.when!.selectorFrom!,
      planOutput,
      mount.when!.maxSelected,
    );

    if (selector.ids.length === 0) {
      return {
        mountName: mount.name,
        stage: mount.stage,
        data: [],
        itemCount: 0,
      };
    }

    const allItems: unknown[] = [];

    for (const id of selector.ids) {
      const ctx: InterpolationContext = { inputs, item: id };
      const args = mount.from.args ? interpolateArgs(mount.from.args, ctx) : {};

      try {
        const result = await this.toolInvoker.callTool(
          mount.from.server,
          mount.from.tool,
          args,
        );

        if (!result.isError) {
          allItems.push(result.content);
        }
      } catch {
        // skip failed items
      }
    }

    const limited = this.enforceLimit(allItems, mount.limits?.maxItems) as unknown[];

    return {
      mountName: mount.name,
      stage: mount.stage,
      data: limited,
      itemCount: limited.length,
    };
  }

  private enforceLimit(data: unknown, maxItems?: number): unknown {
    if (!maxItems || !Array.isArray(data)) return data;
    return data.slice(0, maxItems);
  }
}
