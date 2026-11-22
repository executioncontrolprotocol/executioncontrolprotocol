// Parse the vision model's JSON verdict. A reply that isn't valid JSON fails the review rather than the run.

const raw = String(input.reply || "")
const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
const candidate = ((fenced && fenced[1]) || raw).trim()
const start = candidate.indexOf("{")
const end = candidate.lastIndexOf("}")
let parsed
try {
  parsed = JSON.parse(start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate)
} catch {
  return { pass: false, score: 0, artboards: [], fixes: [], note: `reply was not JSON: ${raw.slice(0, 200)}` }
}
return {
  pass: parsed.pass === true && input.structureOk === true,
  score: typeof parsed.score === "number" ? parsed.score : 0,
  artboards: Array.isArray(parsed.artboards) ? parsed.artboards : [],
  fixes: Array.isArray(parsed.fixes) ? parsed.fixes.map(String) : [],
}
