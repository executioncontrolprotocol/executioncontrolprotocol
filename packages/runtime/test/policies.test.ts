import { describe, it, expect } from "vitest";
import { createPolicyEnforcer } from "../src/policies/enforcer.js";
import type { Policies } from "@executioncontrolprotocol/spec";

describe("Policy enforcer", () => {
  describe("tool access — default deny", () => {
    const policies: Policies = {
      toolAccess: {
        default: "deny",
        allow: ["jira:issues.search", "shopify:orders.list"],
      },
    };
    const enforcer = createPolicyEnforcer(policies);

    it("allows tools in the allowlist", () => {
      expect(enforcer.checkToolAccess("jira:issues.search").allowed).toBe(true);
      expect(enforcer.checkToolAccess("shopify:orders.list").allowed).toBe(true);
    });

    it("denies tools not in the allowlist", () => {
      const result = enforcer.checkToolAccess("slack:messages.post");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in the allow list");
    });
  });

  describe("tool access — default allow", () => {
    const policies: Policies = {
      toolAccess: {
        default: "allow",
        deny: ["dangerous:nuke"],
      },
    };
    const enforcer = createPolicyEnforcer(policies);

    it("allows tools not in the denylist", () => {
      expect(enforcer.checkToolAccess("jira:issues.search").allowed).toBe(true);
    });

    it("denies tools in the denylist", () => {
      const result = enforcer.checkToolAccess("dangerous:nuke");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("explicitly denied");
    });
  });

  describe("tool access — no policy", () => {
    const enforcer = createPolicyEnforcer({});

    it("allows everything when no tool access policy is set", () => {
      expect(enforcer.checkToolAccess("anything:goes").allowed).toBe(true);
    });
  });

  describe("budget enforcement", () => {
    const policies: Policies = {
      budgets: {
        maxToolCalls: 10,
        maxRuntimeSeconds: 30,
      },
    };
    const enforcer = createPolicyEnforcer(policies);

    it("passes when within all limits", () => {
      const result = enforcer.checkBudget({
        toolCalls: 5,
        runtimeSeconds: 10,
      });
      expect(result.withinBudget).toBe(true);
    });

    it("fails when tool calls exceeded", () => {
      const result = enforcer.checkBudget({
        toolCalls: 10,
        runtimeSeconds: 10,
      });
      expect(result.withinBudget).toBe(false);
      expect(result.exceededLimit).toBe("tool-calls");
    });

    it("fails when runtime exceeded", () => {
      const result = enforcer.checkBudget({
        toolCalls: 5,
        runtimeSeconds: 30,
      });
      expect(result.withinBudget).toBe(false);
      expect(result.exceededLimit).toBe("runtime-seconds");
    });

    it("passes with no budget policy", () => {
      const e = createPolicyEnforcer({});
      expect(
        e.checkBudget({ toolCalls: 999, runtimeSeconds: 999 })
          .withinBudget,
      ).toBe(true);
    });
  });

  describe("write controls", () => {
    it("forbid mode denies all writes", () => {
      const enforcer = createPolicyEnforcer({
        writeControls: { mode: "forbid" },
      });
      const result = enforcer.checkWrite("jira:issues.create");
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(false);
    });

    it("propose-only requires approval", () => {
      const enforcer = createPolicyEnforcer({
        writeControls: {
          mode: "propose-only",
          requireApprovalFor: ["slack:messages.post"],
        },
      });
      const result = enforcer.checkWrite("slack:messages.post");
      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
    });

    it("execute-if-allowed permits writes", () => {
      const enforcer = createPolicyEnforcer({
        writeControls: { mode: "execute-if-allowed" },
      });
      const result = enforcer.checkWrite("jira:issues.create");
      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
    });
  });
});
