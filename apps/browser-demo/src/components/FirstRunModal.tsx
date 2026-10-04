import { useEffect, useState } from "react"
import {
  getBrowserSecret,
  hasBrowserVault,
  isBrowserVaultUnlocked,
} from "@executioncontrolprotocol/browser"
import type { ProviderMode } from "../lib/provider-mode.js"
import { canContinueFirstRun, preferredModalProviderMode } from "../lib/provider-mode.js"
import type { OllamaSettings } from "../lib/ollama-settings.js"
import type { AnthropicSettings } from "../lib/anthropic-settings.js"
import type { BridgeSettings } from "../lib/ecp-bridge.js"
import {
  DEMO_PROVIDERS_DOCS_URL,
  DEMO_PROVIDERS_OLLAMA_DOCS_URL,
} from "../lib/external-links.js"
import { ProviderApiKeyFields } from "./ProviderApiKeyFields.js"
import { OllamaSettingsFields } from "./OllamaSettingsFields.js"
import { AnthropicSettingsFields } from "./AnthropicSettingsFields.js"

/** Props for {@link FirstRunModal}. */
export interface FirstRunModalProps {
  /** Chrome LanguageModel API is present (may still need download). */
  chromeSupported: boolean
  /** Chrome model is already available. */
  chromeReady: boolean
  /** Local `ecp up` is reachable and Ollama is up. */
  ollamaBridgeAvailable: boolean
  /** Last selected provider (from app state / localStorage). */
  initialMode?: ProviderMode
  onExplore: () => void
  onComplete: (mode: ProviderMode, ollama?: OllamaSettings) => void
  /** User chose Chrome but model must download first. */
  onChromeInstall: () => void
  /** Open vault setup when user wants encrypted API key storage. */
  onRequestVaultSetup: () => void
  /** Current Ollama settings (editable when Ollama selected). */
  ollamaSettings: OllamaSettings
  onOllamaSettingsChange: (settings: OllamaSettings) => void
  /** Current Anthropic settings (editable when Anthropic selected). */
  anthropicSettings: AnthropicSettings
  onAnthropicSettingsChange: (settings: AnthropicSettings) => void
  bridgeSettings: BridgeSettings
  onBridgeSettingsChange: (settings: BridgeSettings) => void
}

/** First-run provider selection modal. */
export function FirstRunModal({
  chromeSupported,
  chromeReady,
  ollamaBridgeAvailable,
  initialMode = "chrome-ai",
  onExplore,
  onComplete,
  onChromeInstall,
  onRequestVaultSetup,
  ollamaSettings,
  onOllamaSettingsChange,
  anthropicSettings,
  onAnthropicSettingsChange,
  bridgeSettings,
  onBridgeSettingsChange,
}: FirstRunModalProps) {
  const [mode, setMode] = useState<ProviderMode>(() =>
    preferredModalProviderMode(initialMode, { chromeSupported, ollamaBridgeAvailable })
  )
  const [ollamaReady, setOllamaReady] = useState(false)
  const [anthropicVaultReady, setAnthropicVaultReady] = useState(false)
  const [anthropicKeyPresent, setAnthropicKeyPresent] = useState(false)

  useEffect(() => {
    if (!ollamaBridgeAvailable && mode === "ollama") {
      setMode(
        preferredModalProviderMode("ollama", {
          chromeSupported,
          ollamaBridgeAvailable: false,
        })
      )
    }
  }, [ollamaBridgeAvailable, mode, chromeSupported])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const vaultReady = hasBrowserVault() && isBrowserVaultUnlocked()
      if (!vaultReady) {
        if (!cancelled) {
          setAnthropicVaultReady(false)
          setAnthropicKeyPresent(false)
        }
        return
      }
      const key = await getBrowserSecret("ANTHROPIC_API_KEY")
      if (!cancelled) {
        setAnthropicVaultReady(true)
        setAnthropicKeyPresent(Boolean(key?.trim()))
      }
    }
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [mode])

  const canContinue = canContinueFirstRun(mode, {
    chromeSupported,
    ollamaBridgeAvailable,
    ollamaReady,
    ollamaModel: ollamaSettings.model,
    anthropicVaultReady,
    anthropicKeyPresent,
    anthropicModel: anthropicSettings.model,
  })

  const submit = () => {
    if (!canContinue) return
    if (mode === "chrome-ai" && chromeSupported && !chromeReady) {
      onChromeInstall()
      return
    }
    onComplete(mode, mode === "ollama" ? ollamaSettings : undefined)
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-title"
    >
      <div className="modal-panel">
        <header className="modal-panel-header">
          <button
            type="button"
            onClick={onExplore}
            className="modal-close-btn"
            aria-label="Explore without choosing a provider"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
          <h2 id="first-run-title" className="pr-8 font-display text-headline text-on-surface">
            Select a model provider
          </h2>
        </header>

        <div className="modal-panel-scroll flex flex-col gap-4">
          <p className="text-body text-on-surface-variant">
            Select a model provider using hosted models or local models.{" "}
            <a
              href={DEMO_PROVIDERS_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              Learn More
            </a>
          </p>
          <div className="space-y-3">
            <label
              className={`flex items-start gap-2 text-body ${chromeSupported ? "cursor-pointer" : "text-on-surface-variant"}`}
            >
              <input
                type="radio"
                name="provider"
                className="mt-1"
                checked={mode === "chrome-ai"}
                disabled={!chromeSupported}
                onChange={() => setMode("chrome-ai")}
              />
              <span>
                Chrome AI (Basic Demo)
                {!chromeSupported
                  ? " (unavailable)"
                  : !chromeReady
                    ? " (download required)"
                    : ""}
              </span>
            </label>
            <div className="space-y-1">
              <label
                className={`flex items-start gap-2 text-body ${ollamaBridgeAvailable ? "cursor-pointer" : "text-on-surface-variant"}`}
              >
                <input
                  type="radio"
                  name="provider"
                  className="mt-1"
                  checked={mode === "ollama"}
                  disabled={!ollamaBridgeAvailable}
                  onChange={() => setMode("ollama")}
                />
                <span>
                  Ollama (Stronger local Model, requires local installation)
                  {!ollamaBridgeAvailable ? " (unavailable)" : ""}
                </span>
              </label>
              <p className="pl-6 text-body text-on-surface-variant">
                <a
                  href={DEMO_PROVIDERS_OLLAMA_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Learn More
                </a>
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-body">
              <input
                type="radio"
                name="provider"
                className="mt-1"
                checked={mode === "anthropic"}
                onChange={() => setMode("anthropic")}
              />
              <span>Claude (Faster and Stronger, Advanced Demo)</span>
            </label>
            <label className="flex items-start gap-2 text-body text-on-surface-variant">
              <input
                type="radio"
                name="provider"
                className="mt-1"
                checked={mode === "openai"}
                disabled
              />
              <span>OpenAI (Coming Soon)</span>
            </label>
          </div>
          {mode === "ollama" && ollamaBridgeAvailable ? (
            <OllamaSettingsFields
              value={ollamaSettings}
              onChange={onOllamaSettingsChange}
              bridge={bridgeSettings}
              onBridgeChange={onBridgeSettingsChange}
              onReadyChange={setOllamaReady}
            />
          ) : null}
          {mode === "anthropic" ? (
            <AnthropicSettingsFields
              value={anthropicSettings}
              onChange={onAnthropicSettingsChange}
            />
          ) : null}
          <ProviderApiKeyFields onRequestVaultSetup={onRequestVaultSetup} />
        </div>

        <footer className="modal-panel-footer">
          <button
            type="button"
            onClick={submit}
            disabled={!canContinue}
            className="w-full rounded bg-primary py-2.5 font-mono text-label font-bold text-on-primary transition-[filter] hover:brightness-110 disabled:opacity-50"
          >
            Continue
          </button>
        </footer>
      </div>
    </div>
  )
}
