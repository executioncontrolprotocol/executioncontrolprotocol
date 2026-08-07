import {
  defineExtension,
  hook,
  globalRegistry,
  type EnvironmentConfigResolver,
  type LifecycleContext,
} from "@executioncontrolprotocol/core"
import { z } from "zod"

const EXT_ID = "@executioncontrolprotocol/browser-local-config"

const DEFAULT_DENIED = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "SLACK_BOT_TOKEN",
  "TOKEN",
  "SECRET",
  "PASSWORD",
]

function isDeniedKey(name: string, denied: string[]): boolean {
  const u = name.toUpperCase()
  return denied.some((d) => u.includes(d.toUpperCase()))
}

function attachLocalConfigResolver(ctx: LifecycleContext): void {
  const host = ctx.environment
  if (!host) return
  const cfg = (ctx as LifecycleContext & { extensionConfig?: Record<string, unknown> })
    .extensionConfig ?? {}
  const prefix = (cfg.prefix as string | undefined) ?? "ecp:"
  const allowed = (cfg.allowedKeys as string[] | undefined) ?? []
  const denied = (cfg.deniedKeys as string[] | undefined) ?? DEFAULT_DENIED

  const resolver: EnvironmentConfigResolver = {
    id: EXT_ID,
    resolve(name: string) {
      if (isDeniedKey(name, denied)) {
        return undefined
      }
      if (!allowed.includes(name)) return undefined
      if (typeof localStorage === "undefined") return undefined
      const raw = localStorage.getItem(`${prefix}${name}`)
      if (raw === null) return undefined
      try {
        return JSON.parse(raw) as unknown
      } catch {
        return raw
      }
    },
  }
  host.registerConfigResolver(resolver)
}

/** Browser localStorage config extension (non-secret keys only). @category Extensions */
export const browserLocalConfigExtension = defineExtension("@executioncontrolprotocol", "browser-local-config")
  .withConfig({
    prefix: z.string().default("ecp:"),
    allowedKeys: z.array(z.string()).default([]),
    deniedKeys: z.array(z.string()).default(DEFAULT_DENIED),
  })
  .withHooks([hook("environment:configuring", attachLocalConfigResolver)])
  .build()

/** Register `@executioncontrolprotocol/browser-local-config`. */
export async function registerBrowserLocalConfigExtension(
  registry = globalRegistry
): Promise<void> {
  if (!registry.getExtension(EXT_ID)) {
    await registry.registerExtension(browserLocalConfigExtension)
  }
}
