/**
 * Types for the policy enforcement system.
 *
 * Policies are checked at the executor level before every tool call
 * and throughout the executor's runtime to enforce budgets, tool
 * access controls, and write barriers.
 *
 * @category Policies
 */

import type { Policies } from "@ecp/spec";
import type { BudgetUsage } from "../engine/types.js";

/**
 * The result of checking whether a tool call is allowed.
 *
 * @category Policies
 */
export interface ToolAccessDecision {
  /** Whether the tool call is permitted. */
  allowed: boolean;

  /** If denied, the reason. */
  reason?: string;
}

/**
 * The result of checking whether budget limits have been exceeded.
 *
 * @category Policies
 */
export interface BudgetCheckResult {
  /** Whether the executor is still within budget. */
  withinBudget: boolean;

  /** Which limit was exceeded, if any. */
  exceededLimit?: "tool-calls" | "runtime-seconds";

  /** Human-readable message. */
  message?: string;
}

/**
 * The result of checking whether a write operation is allowed.
 *
 * @category Policies
 */
export interface WriteDecision {
  /** Whether the write is permitted. */
  allowed: boolean;

  /** Whether the write requires human approval. */
  requiresApproval: boolean;

  /** If denied or requiring approval, the reason. */
  reason?: string;
}

/**
 * Interface for the policy enforcement service.
 *
 * Created per-executor with the executor's declared policies.
 *
 * @category Policies
 */
export interface PolicyEnforcer {
  /**
   * Check whether a specific tool call is allowed by the executor's
   * tool access policy.
   *
   * @param toolName - The fully-qualified tool name (e.g. `"jira:issues.search"`).
   * @returns The access decision.
   */
  checkToolAccess(toolName: string): ToolAccessDecision;

  /**
   * Check whether the executor is still within its budget limits.
   *
   * @param usage - The current budget consumption.
   * @returns Whether the executor is within budget.
   */
  checkBudget(usage: BudgetUsage): BudgetCheckResult;

  /**
   * Check whether a write operation is allowed.
   *
   * @param toolName - The tool that would perform the write.
   * @returns The write decision.
   */
  checkWrite(toolName: string): WriteDecision;
}

/**
 * Factory function type for creating a {@link PolicyEnforcer} from
 * an executor's declared policies.
 *
 * @category Policies
 */
export type PolicyEnforcerFactory = (policies: Policies) => PolicyEnforcer;
