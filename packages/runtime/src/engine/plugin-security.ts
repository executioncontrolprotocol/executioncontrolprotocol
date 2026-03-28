/**
 * Host policy checks for installed and dynamically loaded plugins.
 *
 * @category Engine
 */

import type {
  EcpPluginManifest,
  ExtensionSourceType,
  PluginInstallSource,
  PluginSecurityPolicy,
  PluginKind,
} from "@executioncontrolprotocol/spec";
import { extensionSourceTypeFromInstallSource } from "@executioncontrolprotocol/spec";

/**
 * Returns true when the policy requires explicit allow-lists to permit a plugin.
 *
 * @category Engine
 */
export function pluginPolicyIsRestrictive(policy: PluginSecurityPolicy | undefined): boolean {
  if (!policy) return false;
  if (policy.strict) return true;
  if (policy.allowIds && policy.allowIds.length > 0) return true;
  if (policy.allowKinds && policy.allowKinds.length > 0) return true;
  if (policy.allowSourceTypes && policy.allowSourceTypes.length > 0) return true;
  if (policy.allowThirdParty === false) return true;
  return false;
}

/**
 * Throws when a plugin manifest + source is not permitted by {@link PluginSecurityPolicy}.
 *
 * @category Engine
 */
export function assertPluginPermittedByPolicy(
  manifest: EcpPluginManifest,
  source: PluginInstallSource,
  policy: PluginSecurityPolicy | undefined,
): void {
  if (!policy) return;

  const srcType: ExtensionSourceType = extensionSourceTypeFromInstallSource(source);
  if (policy.denyIds?.includes(manifest.id)) {
    throw new Error(
      `Plugin "${manifest.id}" is denied by system config security.plugins.denyIds.`,
    );
  }

  if (
    policy.allowThirdParty === false &&
    (manifest.kind === "third-party" || srcType !== "builtin")
  ) {
    throw new Error(
      `Plugin "${manifest.id}" is blocked because security.plugins.allowThirdParty is false (kind "${manifest.kind}", source "${srcType}").`,
    );
  }

  if (policy.allowKinds?.length) {
    if (!policy.allowKinds.includes(manifest.kind as PluginKind)) {
      throw new Error(
        `Plugin kind "${manifest.kind}" for "${manifest.id}" is not in security.plugins.allowKinds.\n` +
          `Allowed: ${policy.allowKinds.join(", ")}`,
      );
    }
  }

  if (policy.allowSourceTypes?.length) {
    if (!policy.allowSourceTypes.includes(srcType)) {
      throw new Error(
        `Plugin source type "${srcType}" for "${manifest.id}" is not in security.plugins.allowSourceTypes.\n` +
          `Allowed: ${policy.allowSourceTypes.join(", ")}`,
      );
    }
  }

  if (policy.allowIds?.length) {
    if (!policy.allowIds.includes(manifest.id)) {
      throw new Error(
        `Plugin id "${manifest.id}" is not in security.plugins.allowIds.\n` + `Allowed: ${policy.allowIds.join(", ")}`,
      );
    }
  }

}
