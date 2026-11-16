const PROVIDER_NAMES: Record<string, string> = {
  'claude-code': 'Claude',
  codex: 'ChatGPT',
  'gemini-cli': 'Gemini',
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
  'anthropic-api': 'Claude API',
  'openai-api': 'OpenAI API',
  'google-api': 'Google AI',
  openrouter: 'OpenRouter',
}

/** Short display name for a provider id. */
export function providerName(id: string): string {
  return PROVIDER_NAMES[id] ?? id
}
