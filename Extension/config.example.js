// Configuration reference for LeetCode Solution Uploader Extension
// Note: Settings can be configured directly in the Extension Settings UI.

export const CONFIG = {
  // GitHub Personal Access Token (requires 'repo' scope)
  // Create at https://github.com/settings/tokens
  GITHUB_TOKEN: "YOUR_GITHUB_TOKEN_HERE",

  // Target GitHub repository
  GITHUB_REPO: "Ojaswin30/Leetcode",

  // Target branch (leave empty for default)
  GITHUB_BRANCH: "main",

  // AI Provider: "groq" | "openai" | "ollama" | "none"
  AI_PROVIDER: "groq",

  // Groq API Key (get from https://console.groq.com/keys)
  GROQ_API_KEY: "YOUR_GROQ_API_KEY_HERE",
  GROQ_MODEL: "openai/gpt-oss-120b",

  // OpenAI API Key (optional)
  OPENAI_API_KEY: "YOUR_OPENAI_API_KEY_HERE",
  OPENAI_MODEL: "gpt-4o-mini",

  // Ollama local endpoint (optional)
  OLLAMA_URL: "http://localhost:11434",
  OLLAMA_MODEL: "mistral"
};
