import { describe, expect, it } from "vitest"
import * as fireflySchemas from "../src/generated/firefly/schemas.js"
import * as photoshopSchemas from "../src/generated/photoshop/schemas.js"

describe("nested url FileRef accepts schemas", () => {
  it("accepts a layer image url FileRef and rejects legacy Adobe envelopes", () => {
      const layerShape = {
      name: "Bg",
      type: "layer",
      operation: { type: "edit" },
      image: { kind: "url", url: "https://store.test/a.png" },
    }
    const layerUnion = photoshopSchemas.In_OneOf_AddAdjustmentLayer_and_15_more_6ae795
    expect(layerUnion.safeParse(layerShape).success).toBe(true)
    expect(
      layerUnion.safeParse({
        ...layerShape,
        image: { source: { url: "https://store.test/a.png" } },
      }).success,
    ).toBe(false)
  })

  it("accepts style imageReference as a url FileRef", () => {
    expect(
      fireflySchemas.In_StylesV3.safeParse({
        imageReference: { kind: "url", url: "https://cdn.test/style.png" },
      }).success,
    ).toBe(true)
  })
})