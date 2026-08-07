import { resolve } from "node:path";

import type { SecretPolicyMode } from "@executioncontrolprotocol/plugins";
import { DOT_PROVIDER_ID } from "./secret-provider-ids.js";

interface SecretsConfigLike {
  secrets?: {
    policy?: SecretPolicyMode;
    providers?: Record<string, { path?: string }>;
  };
}

export const DEFAULT_SECRET_POLICY: SecretPolicyMode = "warn";
export const DEFAULT_DOTENV_BASENAME = ".env";

export function resolveDotenvPathFromConfig(cwd: string, config?: SecretsConfigLike): string {
  const dotRel = config?.secrets?.providers?.[DOT_PROVIDER_ID]?.path;
  return dotRel ? resolve(cwd, dotRel) : resolve(cwd, DEFAULT_DOTENV_BASENAME);
}

export function resolveSecretPolicyFromConfig(config?: SecretsConfigLike): SecretPolicyMode {
  return config?.secrets?.policy ?? DEFAULT_SECRET_POLICY;
}

