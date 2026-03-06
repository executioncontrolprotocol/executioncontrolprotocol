/**
 * Default policy enforcer implementation.
 *
 * Enforces tool access controls, budget limits, and write barriers
 * as declared in an executor's {@link Policies} definition.
 *
 * @category Policies
 */

import type { Policies } from "@ecp/spec";
import type { BudgetUsage } from "../engine/types.js";
import type {
  PolicyEnforcer,
  ToolAccessDecision,
  BudgetCheckResult,
  WriteDecision,
} from "./types.js";

/**
 * Creates a {@link PolicyEnforcer} from an executor's declared policies.
 *
 * The enforcer is stateless — it evaluates each check against the
 * executor's policy declaration and the current budget usage.
 *
 * @param policies - The executor's declared policies.
 * @returns A policy enforcer bound to those policies.
 *
 * @category Policies
 */
export function createPolicyEnforcer(policies: Policies): PolicyEnforcer {
  return new DefaultPolicyEnforcer(policies);
}

class DefaultPolicyEnforcer implements PolicyEnforcer {
  constructor(private readonly policies: Policies) {}

  checkToolAccess(toolName: string): ToolAccessDecision {
    const access = this.policies.toolAccess;
    if (!access) {
      return { allowed: true };
    }

    if (access.default === "deny") {
      const allowed = access.allow ?? [];
      if (allowed.includes(toolName)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        reason: `Tool "${toolName}" is not in the allow list (default: deny).`,
      };
    }

    if (access.default === "allow") {
      const denied = access.deny ?? [];
      if (denied.includes(toolName)) {
        return {
          allowed: false,
          reason: `Tool "${toolName}" is explicitly denied.`,
        };
      }
      return { allowed: true };
    }

    return { allowed: true };
  }

  checkBudget(usage: BudgetUsage): BudgetCheckResult {
    const budgets = this.policies.budgets;
    if (!budgets) {
      return { withinBudget: true };
    }

    if (budgets.maxToolCalls !== undefined && usage.toolCalls > budgets.maxToolCalls) {
      return {
        withinBudget: false,
        exceededLimit: "tool-calls",
        message: `Tool call limit exceeded: ${usage.toolCalls} > ${budgets.maxToolCalls}`,
      };
    }

    if (
      budgets.maxRuntimeSeconds !== undefined &&
      usage.runtimeSeconds > budgets.maxRuntimeSeconds
    ) {
      return {
        withinBudget: false,
        exceededLimit: "runtime-seconds",
        message: `Runtime limit exceeded: ${usage.runtimeSeconds}s > ${budgets.maxRuntimeSeconds}s`,
      };
    }

    if (budgets.maxCostUsd !== undefined && usage.costUsd > budgets.maxCostUsd) {
      return {
        withinBudget: false,
        exceededLimit: "cost-usd",
        message: `Cost limit exceeded: $${usage.costUsd} > $${budgets.maxCostUsd}`,
      };
    }

    return { withinBudget: true };
  }

  checkWrite(toolName: string): WriteDecision {
    const controls = this.policies.writeControls;
    if (!controls) {
      return { allowed: true, requiresApproval: false };
    }

    switch (controls.mode) {
      case "forbid":
        return {
          allowed: false,
          requiresApproval: false,
          reason: `Write operations are forbidden for this executor.`,
        };

      case "propose-only": {
        const needsApproval = controls.requireApprovalFor ?? [];
        if (needsApproval.includes(toolName)) {
          return {
            allowed: false,
            requiresApproval: true,
            reason: `Tool "${toolName}" requires approval before execution.`,
          };
        }
        return {
          allowed: false,
          requiresApproval: true,
          reason: `Write operations require approval (mode: propose-only).`,
        };
      }

      case "execute-if-allowed":
        return { allowed: true, requiresApproval: false };

      default:
        return { allowed: true, requiresApproval: false };
    }
  }
}
