import type { PolicyContext } from "@executioncontrolprotocol/core"
import type { PolicyDecision } from "@executioncontrolprotocol/types"
import { definePolicy, globalRegistry, hook } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { evaluateImageRefsPost, evaluateImageRefsPre } from "./image-policy-eval.js"

type PolicyHookFn = (
  ctx: PolicyContext & { config: Record<string, unknown> }
) => PolicyDecision | void | Promise<PolicyDecision | void>

function policyHook(
  event: import("@executioncontrolprotocol/types").PolicyLifecycleEvent,
  fn: PolicyHookFn
) {
  return hook(event, (lifecycleCtx) =>
    fn(lifecycleCtx as unknown as PolicyContext & { config: Record<string, unknown> })
  )
}

/** @executioncontrolprotocol/image-policy — generic ImageRef governance. @category Policies */
export const imagePolicy = definePolicy("@executioncontrolprotocol", "image-policy")
  .withConfig({
    allowedInputKinds: z
      .array(z.enum(["artifact", "file", "url", "buffer"]))
      .optional(),
    allowedOutputFormats: z
      .array(z.enum(["jpeg", "png", "webp", "avif", "tiff", "gif", "raw"]))
      .optional(),
    maxImageRefsPerStep: z.number().optional(),
    maxInputBytes: z.number().optional(),
    maxOutputBytes: z.number().optional(),
    maxPixels: z.number().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    allowSvg: z.boolean().optional(),
    allowRemoteUrls: z.boolean().optional(),
    allowedUrlDomains: z.array(z.string()).optional(),
    requireStripMetadata: z.boolean().optional(),
    denyRawOutput: z.boolean().optional(),
  })
  .withHooks([
    policyHook("policy:pre", (ctx) => {
      const reason = evaluateImageRefsPre(ctx.input, ctx.config)
      if (reason) {
        return { type: "deny", reason, code: "IMAGE_POLICY_DENIED" }
      }
      return { type: "allow" }
    }),
    policyHook("policy:post", (ctx) => {
      if (ctx.output === undefined) return { type: "allow" }
      const reason = evaluateImageRefsPost(ctx.output, ctx.config)
      if (reason) {
        return { type: "deny", reason, code: "IMAGE_POLICY_DENIED" }
      }
      return { type: "allow" }
    }),
  ])
  .build()

export { evaluateImageRefsPre, evaluateImageRefsPost } from "./image-policy-eval.js"
export type { ImagePolicyConfig } from "./image-policy-eval.js"

/** Register `@executioncontrolprotocol/image-policy`. @category Policies */
export async function registerImagePolicy(registry = globalRegistry): Promise<void> {
  if (!registry.getPolicy("@executioncontrolprotocol/image-policy")) {
    await registry.registerPolicy(imagePolicy)
  }
}
