/**
 * Best-practices default for `ecp config init` (aligned with `config/ecp.config.example.yaml` v0.5).
 */
export const DEFAULT_ECP_SYSTEM_CONFIG_YAML = `# ECP system config — best-practices default (schema v0.5)
# Edit with: ecp config … or your editor (YAML or JSON).

version: "0.5"

security:
  models:
    allowProviders: [openai, ollama]
    defaultProviders: [openai]
    allowedModels:
      openai: [gpt-4o-mini, gpt-4o]
      ollama: [gemma3:1b, llama3.2:3b]
  loggers:
    allowEnable: []
    defaultEnable: []
  secrets:
    allowProviders: []
  plugins:
    allowKinds: [provider, executor, logger, memory, tool]
    allowSourceTypes: [builtin]
    allowIds: [openai, ollama]

models:
  providers:
    openai:
      defaultModel: gpt-4o-mini
      supportedModels: [gpt-4o-mini, gpt-4o]
      config: {}
    ollama:
      defaultModel: gemma3:1b
      supportedModels: [gemma3:1b, llama3.2:3b]
      config:
        baseURL: http://localhost:11434

tools:
  servers: {}

# loggers:
#   config: {}

# agents:
#   endpoints:
#     specialist_name:
#       url: https://example.com/a2a
#       config: {}
`;
