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
  const allowSource = argvFlagValue(argv, "allow-source")
  if (kind === "git" && allowSource !== "git") {
    return {
      allowed: false,
      reason: "Git plugin sources need --allow-source git",
    }
  }
  if (kind === "path" && allowSource !== "path") {
    return {
      allowed: false,
      reason: "Local plugin paths need --allow-source path",
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
