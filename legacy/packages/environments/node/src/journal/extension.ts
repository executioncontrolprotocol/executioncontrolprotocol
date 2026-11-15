import {
  defineExtension,
  hook,
  NODE_ENVIRONMENT_ID,
} from "@executioncontrolprotocol/core"
import type { LifecycleContext } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { journalRunEnd, journalRunStart, journalStep } from "./writer.js"

function onRunStart(ctx: LifecycleContext): Promise<void> {
  return journalRunStart(ctx)
}

function onRunEnd(ctx: LifecycleContext): Promise<void> {
  return journalRunEnd(ctx)
}

function onStepCompleted(ctx: LifecycleContext): Promise<void> {
  return journalStep(ctx, "completed")
}

function onStepFailed(ctx: LifecycleContext): Promise<void> {
  return journalStep(ctx, "failed")
}

function onStepPaused(ctx: LifecycleContext): Promise<void> {
  return journalStep(ctx, "paused")
}

/** Built-in Node journal writer. @category Journal */
export const journalExtension = defineExtension("@executioncontrolprotocol", "journal")
  .supports(NODE_ENVIRONMENT_ID)
  .withConfig(z.object({}))
  .withMetadata({
    summary: "Writes run journals under .ecp/runs.",
    description:
      "Host hook that records every workflow run as run.json plus per-step files, with secret values redacted.",
    isAuthorable: false,
  })
  .withHooks([
    hook("run:started", onRunStart, { priority: 1000 }),
    hook("step:completed", onStepCompleted, { priority: 1000 }),
    hook("step:failed", onStepFailed, { priority: 1000 }),
    hook("step:paused", onStepPaused, { priority: 1000 }),
    hook("run:finally", onRunEnd, { priority: 1000 }),
  ])
  .build()
