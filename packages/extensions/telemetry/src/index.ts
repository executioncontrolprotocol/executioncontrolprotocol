import { defineExtension, hook, globalRegistry, catalogExtension } from "@executioncontrolprotocol/core"

/** @executioncontrolprotocol/telemetry extension. @category Extensions */
export const telemetryExtension = defineExtension("@executioncontrolprotocol", "telemetry")
  .withConfig({})
  .withMetadata({
    summary: "Lifecycle hook placeholders for run and step telemetry.",
    description:
      "Registers no-op hooks on run and step lifecycle events so hosts can swap in observability backends without changing workflow manifests.",
  })
  .withCapabilities([])
  .withHooks([
    hook("run:started", async () => undefined),
    hook("step:completed", async () => undefined),
    hook("step:failed", async () => undefined),
    hook("run:finally", async () => undefined),
  ])
  .build()

catalogExtension(telemetryExtension)

export async function registerTelemetryExtension(): Promise<void> {
  if (!globalRegistry.getExtension("@executioncontrolprotocol/telemetry")) {
    await globalRegistry.registerExtension(telemetryExtension)
  }
}

export default telemetryExtension
