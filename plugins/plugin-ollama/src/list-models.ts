/** Options for {@link listOllamaModels}. @category Extensions */
export interface ListOllamaModelsOptions {
  /** Optional abort signal for in-flight cancellation. */
  signal?: AbortSignal
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>
}

/**
 * List installed Ollama model tags via `GET {baseURL}/api/tags`.
 * @category Extensions
 */
export async function listOllamaModels(
  baseURL: string,
  options?: ListOllamaModelsOptions
): Promise<string[]> {
  const root = baseURL.replace(/\/$/, "").trim()
  if (!root) {
    throw new Error("Ollama base URL is required")
  }
  let res: Response
  try {
    res = await fetch(`${root}/api/tags`, {
      method: "GET",
      signal: options?.signal,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Ollama unreachable at ${root}: ${message}`)
  }
  if (!res.ok) {
    let detail = ""
    try {
      detail = (await res.text()).slice(0, 200)
    } catch {
      detail = ""
    }
    throw new Error(
      detail
        ? `Ollama API error: ${res.status} (${detail})`
        : `Ollama API error: ${res.status}`
    )
  }
  const data = (await res.json()) as OllamaTagsResponse
  const names = new Set<string>()
  for (const row of data.models ?? []) {
    if (typeof row.name === "string" && row.name.trim()) {
      names.add(row.name.trim())
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}
