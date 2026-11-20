const fallbackTexts = input.texts || {};
const fallbackHeadline = input.headline ?? null;
if (input.locale === "en" || !(input.translation && input.translation.text)) {
  return { texts: fallbackTexts, headline: fallbackHeadline };
}
const raw = String(input.translation.text);
const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
const candidate = ((fenced && fenced[1]) || raw).trim();
try {
  const parsed = JSON.parse(candidate || "{}");
  const texts = parsed.texts && typeof parsed.texts === "object" ? parsed.texts : fallbackTexts;
  const headline = parsed.headline !== undefined ? parsed.headline : fallbackHeadline;
  return { texts, headline };
} catch {
  return { texts: fallbackTexts, headline: fallbackHeadline };
}