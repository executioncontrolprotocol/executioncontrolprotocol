import type { ECPContext, Executor, Orchestrator } from "@executioncontrolprotocol/spec";

import { modelProviderIdFromConfig } from "@executioncontrolprotocol/runtime";

/**
 * Infer single model provider id from Context executors, or throw if ambiguous.
 *
 * @category CLI
 */
export function inferModelProviderFromContext(context: ECPContext): string | undefined {
  const providers = new Set<string>();

  const visitExecutor = (executor: Executor): void => {
    const providerName = modelProviderIdFromConfig(executor.model);
    if (providerName) providers.add(providerName);
  };

  const visitOrchestrator = (orchestrator: Orchestrator): void => {
    visitExecutor(orchestrator);
    for (const executor of orchestrator.executors ?? []) {
      visitExecutor(executor);
    }
    for (const child of orchestrator.orchestrators ?? []) {
      visitOrchestrator(child);
    }
  };

  if (context.orchestrator) visitOrchestrator(context.orchestrator);
  for (const executor of context.executors ?? []) {
    visitExecutor(executor);
  }

  if (providers.size === 1) return [...providers][0];
  if (providers.size === 0) return undefined;
  throw new Error(
    `Context declares multiple model providers (${[...providers].join(", ")}). Please pass --provider.`,
  );
}
