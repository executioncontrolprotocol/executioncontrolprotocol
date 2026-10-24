import type { Interfaces } from "@oclif/core"
import {
  ECP_PLUGIN_DENIED,
  EcpCliError,
  EXIT_FAILED,
} from "@executioncontrolprotocol/plugin-sdk"
import { argvFlagValue, argvHasFlag } from "./argv.js"
import { confirm, wantsYes } from "./confirm.js"
import { isFirstPartyPackage } from "./npm-registry.js"
import { pluginNameFromSpec, pluginSourceKind } from "./plugin-source.js"
import { rememberTrust, rememberedTrust } from "./trust-store.js"

/** Comma-separated git/path sources allowed without `--allow-source`. @category CLI */
export const ECP_ALLOW_SOURCE_ENV = "ECP_ALLOW_SOURCE"

/**
 * Source kinds permitted by `--allow-source` and {@link ECP_ALLOW_SOURCE_ENV}.
 * @category CLI
 */
export function allowedPluginSources(argv: string[] = process.argv): Set<string> {
  const values = new Set<string>()
  const fromFlag = argvFlagValue(argv, "allow-source")
  if (fromFlag) values.add(fromFlag)
  const fromEnv = process.env[ECP_ALLOW_SOURCE_ENV]
  if (fromEnv) {
    for (const part of fromEnv.split(/[,\s]+/)) {
      if (part) values.add(part)
    }
  }
  return values
}

/** Decision from the plugin trust check. @category CLI */
export interface TrustDecision {
  /** Whether the install may proceed. */
  allowed: boolean
  /** Reason when denied. */
  reason?: string
}

/**
 * Evaluate whether a plugin install is allowed.
 * @category CLI
 */
export async function evaluateTrust(
  config: Interfaces.Config,
  spec: string,
  argv: string[] = process.argv
): Promise<TrustDecision> {
  const kind = pluginSourceKind(spec)
  const name = pluginNameFromSpec(spec)
  const sources = allowedPluginSources(argv)
  if (kind === "git" && !sources.has("git")) {
    return {
      allowed: false,
      reason: "Git plugin sources need --allow-source git or ECP_ALLOW_SOURCE=git",
    }
  }
  if (kind === "path" && !sources.has("path")) {
    return {
      allowed: false,
      reason: "Local plugin paths need --allow-source path or ECP_ALLOW_SOURCE=path",
    }
  }
  if (kind === "npm" && isFirstPartyPackage(name)) {
    return { allowed: true }
  }
  const remembered = await rememberedTrust(config, name)
  if (remembered === true) return { allowed: true }
  if (remembered === false) {
    return { allowed: false, reason: `Package ${name} was previously denied` }
  }
  if (wantsYes(argv)) {
    await rememberTrust(config, name, true)
    return { allowed: true }
  }
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const ok = await confirm(`Trust and install ${name}?`, argv)
    await rememberTrust(config, name, ok)
    return ok
      ? { allowed: true }
      : { allowed: false, reason: `User refused to trust ${name}` }
  }
  return {
    allowed: false,
    reason: `Third-party package ${name} needs --yes or ECP_TRUST_THIRD_PARTY=1`,
  }
}

/**
 * Throw {@link EcpCliError} when a trust check denies the install.
 * @category CLI
 */
export async function assertTrusted(
  config: Interfaces.Config,
  spec: string,
  argv: string[] = process.argv
): Promise<void> {
  const decision = await evaluateTrust(config, spec, argv)
  if (decision.allowed) return
  throw new EcpCliError(ECP_PLUGIN_DENIED, decision.reason ?? "Plugin install denied", {
    exitCode: EXIT_FAILED,
    suggestions: argvHasFlag(argv, "yes")
      ? undefined
      : ["Pass --yes to trust a third-party package for this install"],
  })
}
