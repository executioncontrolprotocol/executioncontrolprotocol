const payload = { texts: input.texts || {}, headline: input.headline ?? null };
const body = JSON.stringify(payload);
return {
  prompt: `Translate every string value in this JSON into locale "${input.locale}". Keep the same JSON shape and keys. Return only JSON, no markdown.\n${body}`,
};