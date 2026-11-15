import type { Sharp } from "sharp"
import type { CapabilityContext } from "@executioncontrolprotocol/core"
import { readImageToBuffer } from "./artifact.js"
import type { SharpPipelineOperation } from "./schemas.js"

type Ctx = CapabilityContext & { extensionConfig?: Record<string, unknown> }

/** Apply a single declarative pipeline operation to a Sharp instance. @category Extensions */
export async function applyOperation(
  image: Sharp,
  op: SharpPipelineOperation,
  ctx: Ctx
): Promise<Sharp> {
  switch (op.op) {
    case "resize":
      return image.resize(op.width, op.height, {
        fit: op.fit,
        position: op.position,
        background: op.background,
        kernel: op.kernel,
        withoutEnlargement: op.withoutEnlargement,
        withoutReduction: op.withoutReduction,
        fastShrinkOnLoad: op.fastShrinkOnLoad,
      })
    case "extract":
      return image.extract({
        left: op.left,
        top: op.top,
        width: op.width,
        height: op.height,
      })
    case "crop":
      return image.extract({
        left: op.left ?? 0,
        top: op.top ?? 0,
        width: op.width,
        height: op.height,
      })
    case "extend":
      return image.extend({
        top: op.top ?? 0,
        bottom: op.bottom ?? 0,
        left: op.left ?? 0,
        right: op.right ?? 0,
        background: op.background,
      })
    case "trim":
      return image.trim({
        background: op.background,
        threshold: op.threshold,
      })
    case "rotate":
      return op.auto ? image.rotate() : image.rotate(op.angle, { background: op.background })
    case "flip":
      return image.flip()
    case "flop":
      return image.flop()
    case "affine":
      return image.affine(op.matrix as [[number, number], [number, number]], {
        background: op.background,
        idx: op.idx,
        idy: op.idy,
        odx: op.odx,
        ody: op.ody,
      })
    case "composite": {
      const overlays = await Promise.all(
        op.images.map(async (overlay) => ({
          input: (await readImageToBuffer(overlay.image, ctx)).buffer,
          left: overlay.left,
          top: overlay.top,
          gravity: overlay.gravity as import("sharp").Gravity | undefined,
          blend: overlay.blend as import("sharp").Blend | undefined,
          tile: overlay.tile,
          premultiplied: overlay.premultiplied,
          density: overlay.density,
        }))
      )
      return image.composite(overlays)
    }
    case "flatten":
      return image.flatten({ background: op.background })
    case "ensureAlpha":
      return image.ensureAlpha(op.alpha)
    case "removeAlpha":
      return image.removeAlpha()
    case "background":
      return image.flatten({ background: op.color })
    case "blur":
      return image.blur(op.sigma)
    case "sharpen":
      return op.sigma !== undefined
        ? image.sharpen(op.sigma, op.m1, op.m2)
        : image.sharpen()
    case "median":
      return image.median(op.size)
    case "greyscale":
      return image.greyscale()
    case "negate":
      return image.negate({ alpha: op.alpha })
    case "normalize":
      return image.normalize({ lower: op.lower, upper: op.upper })
    case "linear":
      return image.linear(op.a, op.b)
    case "modulate":
      return image.modulate({
        brightness: op.brightness,
        saturation: op.saturation,
        hue: op.hue,
        lightness: op.lightness,
      })
    case "tint":
      return image.tint(op.color)
    case "gamma":
      return image.gamma(op.gamma, op.gammaOut)
    case "threshold":
      return image.threshold(op.threshold, { greyscale: op.greyscale })
    case "boolean": {
      const operand = await readImageToBuffer(op.image, ctx)
      return image.boolean(operand.buffer, op.operator)
    }
    case "convolve":
      return image.convolve({
        width: op.width,
        height: op.height,
        kernel: op.kernel,
        scale: op.scale,
        offset: op.offset,
      })
    case "recomb":
      return image.recomb(op.matrix as [[number, number, number], [number, number, number], [number, number, number]])
    case "colorspace":
      return image.toColourspace(op.space)
    case "metadata":
      return image.withMetadata({
        orientation: op.orientation,
        density: op.density,
      })
    default: {
      const _exhaustive: never = op
      throw new Error(`Unsupported pipeline operation: ${(_exhaustive as { op: string }).op}`)
    }
  }
}
