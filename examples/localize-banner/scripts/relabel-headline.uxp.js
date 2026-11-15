/**
 * UXP script body for Photoshop Actions: rewrite the headline text layer.
 * The host syntax-checks this file via `$script.path` and never runs it locally —
 * Photoshop executes it after Firefly polls the job.
 */
const headline = (typeof params !== "undefined" && params.headline) || "Hello"
// Photoshop UXP entry: find a text layer named "Headline" and set its contents.
try {
  // Photoshop UXP provides CommonJS `require` for the photoshop module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- UXP host API
  const doc = require("photoshop").app.activeDocument
  const layer = doc.layers.find((entry) => entry.name === "Headline")
  if (layer && layer.kind === "text") {
    layer.textItem.contents = String(headline)
  }
} catch (error) {
  console.error(error)
}
