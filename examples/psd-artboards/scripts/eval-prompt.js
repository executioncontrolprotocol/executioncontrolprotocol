// Build the vision-model review prompt: what each image is, what was planned, what the structure check found,
// and what to judge.

const lines = input.plan.artboards.map((a) => `- ${a.name}: ${a.width}x${a.height} px`)
const images = input.labels.map((label, i) => `Image ${i + 1}: ${label}`)
const structure = input.structure.ok
  ? "The structural check passed: every artboard exists at its size and holds its layers, text inside the bounds."
  : `The structural check found problems:\n${[...input.structure.errors, ...input.structure.problems].map((p) => `- ${p}`).join("\n")}`

return {
  system:
    "You are a senior production designer reviewing banner resizes. Judge only what you can see in the images. " +
    "Reply with one JSON object and nothing else: " +
    '{"pass": boolean, "score": 0-10, "artboards": [{"name": string, "ok": boolean, "issues": [string]}], "fixes": [string]}.',
  prompt:
    `A ${input.plan.source.width}x${input.plan.source.height} banner (background image, a headline and a subhead) was ` +
    `reflowed into new artboards:\n${lines.join("\n")}\n\n${images.join("\n")}\n\n${structure}\n\n` +
    "Judge each new artboard from its own image. Check: the background fills the whole artboard with no gaps; the " +
    "headline and subhead are both present, fully inside the artboard with comfortable margins, in the same order and " +
    "alignment as the original, and sized in proportion to the artboard; the text contrasts clearly with what is behind " +
    "it. Text is best placed over a calm, even area of the image (sky, plain space) rather than over busy or dark detail; " +
    "do not suggest moving text onto busy or low-contrast areas just to balance the composition. Pass only if every " +
    "artboard is ready to ship. In fixes, give concrete layout changes per artboard.",
}
