import {
  defineExtension,
  hook,
  PROCESS_ENV_RESOLVER_ID,
  NODE_ENVIRONMENT_ID,
  type EnvironmentConfigResolver,
  type LifecycleContext,
} from "@executioncontrolprotocol/core"
import { z } from "zod"

function keyAllowed(name: string, allowed: string[], denied: string[]): boolean {
  if (denied.includes(name)) return false
  if (allowed.includes("*")) return true
  return allowed.includes(name)
}

function attachProcessEnvResolver(ctx: LifecycleContext): void {
  const host = ctx.environment
  if (!host) return
  const cfg = (ctx as LifecycleContext & { extensionConfig?: Record<string, unknown> })
    .extensionConfig ?? {}
  const allowed = (cfg.allowedKeys as string[] | undefined) ?? ["*"]
  const denied = (cfg.deniedKeys as string[] | undefined) ?? []
  const prefix = (cfg.prefix as string | undefined) ?? ""

  const resolver: EnvironmentConfigResolver = {
    id: PROCESS_ENV_RESOLVER_ID,
    resolve(name: string) {
      if (!keyAllowed(name, allowed, denied)) return undefined
      const envKey = prefix ? `${prefix}${name}` : name
      return process.env[envKey]
    },
  }
  host.registerConfigResolver(resolver)
}

/** Process environment config extension. @category Extensions */
export const processEnvExtension = defineExtension("@executioncontrolprotocol", "process-env")
  .supports(NODE_ENVIRONMENT_ID)
  .withConfig({
    allowedKeys: z.array(z.string()).default(["*"]),
    deniedKeys: z.array(z.string()).default([]),
    prefix: z.string().optional(),
  })
  .withMetadata({
    summary: "Process environment variable resolution for Node hosts.",
    description:
      "Registers a config resolver that reads allowlisted keys from process.env during environment configuration. Supports optional key prefixing and explicit deny lists.",
    isAuthorable: false,
  })
  .withHooks([hook("environment:configuring", attachProcessEnvResolver)])
  .build()

export default processEnvExtension
