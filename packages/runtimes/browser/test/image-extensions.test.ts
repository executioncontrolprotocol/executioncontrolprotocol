import { describe, expect, it } from "vitest"
import { createBrowserEnvironment, registerBrowserHost } from "../src/index.js"
import { registerFalExtension } from "@executioncontrolprotocol/extension-fal"
import { registerImageSharpExtension } from "@executioncontrolprotocol/extension-image-sharp"
import "@executioncontrolprotocol/extension-fal"
import "@executioncontrolprotocol/extension-image-sharp"

describe("browser app image extension composition", () => {
  it("describe includes FAL and image-sharp when the app binds them", async () => {
    await registerBrowserHost()
    await registerFalExtension()
    await registerImageSharpExtension()
    const env = createBrowserEnvironment("image-ext-test")
    env.addExtensionBinding("@executioncontrolprotocol/fal", {
      apiKey: "test",
      defaultMode: "subscribe",
    })
    env.addExtensionBinding("@executioncontrolprotocol/image-sharp", {})
    const ecp = await env.init()
    const descriptor = await ecp.describe({
      capabilities: { include: ["id", "inputSchema", "outputSchema"] },
    })
    const ids = descriptor.capabilities.map((c) => c.id)
    expect(ids).toContain("@executioncontrolprotocol/fal.generate")
    expect(ids).toContain("@executioncontrolprotocol/image-sharp.inspect")
    expect(ids).toContain("@executioncontrolprotocol/image-sharp.transform")

    const fal = descriptor.capabilities.find((c) => c.id === "@executioncontrolprotocol/fal.generate")
    expect(fal?.inputSchema).toBeDefined()

    const inspect = descriptor.capabilities.find(
      (c) => c.id === "@executioncontrolprotocol/image-sharp.inspect"
    )
    expect(inspect?.inputSchema).toBeDefined()
    await ecp.terminate()
  })
})
