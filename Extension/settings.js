// Settings management for LeetCode Solution Uploader

const DEFAULT_GROQ_KEY = "";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

const githubTokenInput = document.getElementById("githubToken");
const githubRepoInput = document.getElementById("githubRepo");
const githubBranchInput = document.getElementById("githubBranch");
const pathFormatSelect = document.getElementById("pathFormat");

const aiProviderSelect = document.getElementById("aiProvider");
const groqSettingsDiv = document.getElementById("groqSettings");
const groqKeyInput = document.getElementById("groqKey");
const groqModelSelect = document.getElementById("groqModel");

const openaiSettingsDiv = document.getElementById("openaiSettings");
const openAiKeyInput = document.getElementById("openAiKey");
const openAiModelSelect = document.getElementById("openAiModel");

const ollamaSettingsDiv = document.getElementById("ollamaSettings");
const ollamaUrlInput = document.getElementById("ollamaUrl");
const ollamaModelInput = document.getElementById("ollamaModel");

const saveBtn = document.getElementById("saveBtn");
const testGithubBtn = document.getElementById("testGithubBtn");
const testAiBtn = document.getElementById("testAiBtn");

// Dedicated inline status elements
const githubStatusDiv = document.getElementById("githubStatus");
const aiStatusDiv = document.getElementById("aiStatus");
const saveStatusDiv = document.getElementById("saveStatus");

// Provider change listener
aiProviderSelect.addEventListener("change", updateProviderVisibility);

function updateProviderVisibility() {
  const provider = aiProviderSelect.value;
  groqSettingsDiv.style.display = provider === "groq" ? "block" : "none";
  openaiSettingsDiv.style.display = provider === "openai" ? "block" : "none";
  ollamaSettingsDiv.style.display = provider === "ollama" ? "block" : "none";
  testAiBtn.style.display = provider === "none" ? "none" : "block";
  if (provider === "none") aiStatusDiv.style.display = "none";
}

// Load saved settings from both sync & local storage
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(null, (syncResult) => {
    chrome.storage.local.get(null, (localResult) => {
      const result = { ...(localResult || {}), ...(syncResult || {}) };

      if (result.GITHUB_TOKEN) githubTokenInput.value = result.GITHUB_TOKEN;
      if (result.GITHUB_REPO) githubRepoInput.value = result.GITHUB_REPO;
      if (result.GITHUB_BRANCH) githubBranchInput.value = result.GITHUB_BRANCH;
      if (result.PATH_FORMAT) pathFormatSelect.value = result.PATH_FORMAT;

      aiProviderSelect.value = result.AI_PROVIDER || "groq";

      groqKeyInput.value = result.GROQ_API_KEY || DEFAULT_GROQ_KEY;
      if (result.GROQ_MODEL) groqModelSelect.value = result.GROQ_MODEL;

      if (result.OPENAI_API_KEY) openAiKeyInput.value = result.OPENAI_API_KEY;
      if (result.OPENAI_MODEL) openAiModelSelect.value = result.OPENAI_MODEL;

      if (result.OLLAMA_URL) ollamaUrlInput.value = result.OLLAMA_URL;
      if (result.OLLAMA_MODEL) ollamaModelInput.value = result.OLLAMA_MODEL;

      updateProviderVisibility();
    });
  });
});

// Save Settings to both sync and local storage
saveBtn.addEventListener("click", () => {
  const githubToken = githubTokenInput.value.trim();
  const githubRepo = githubRepoInput.value.trim();
  const githubBranch = githubBranchInput.value.trim();
  const pathFormat = pathFormatSelect.value;
  const aiProvider = aiProviderSelect.value;

  if (!githubToken) {
    showInlineStatus(saveStatusDiv, "error", "⚠️ Please enter your GitHub Personal Access Token.");
    return;
  }

  if (!githubRepo) {
    showInlineStatus(saveStatusDiv, "error", "⚠️ Please enter your GitHub Repository (username/repo).");
    return;
  }

  const settingsToSave = {
    GITHUB_TOKEN: githubToken,
    GITHUB_REPO: githubRepo,
    GITHUB_BRANCH: githubBranch,
    PATH_FORMAT: pathFormat,
    AI_PROVIDER: aiProvider,
    GROQ_API_KEY: groqKeyInput.value.trim() || DEFAULT_GROQ_KEY,
    GROQ_MODEL: groqModelSelect.value,
    OPENAI_API_KEY: openAiKeyInput.value.trim(),
    OPENAI_MODEL: openAiModelSelect.value,
    OLLAMA_URL: ollamaUrlInput.value.trim() || "http://localhost:11434",
    OLLAMA_MODEL: ollamaModelInput.value.trim() || "mistral"
  };

  chrome.storage.sync.set(settingsToSave, () => {
    chrome.storage.local.set(settingsToSave, () => {
      showInlineStatus(saveStatusDiv, "success", "✅ Settings saved successfully!");
    });
  });
});

// Test GitHub (Banner right beneath GitHub test button + Auto-save)
testGithubBtn.addEventListener("click", async () => {
  const token = githubTokenInput.value.trim();
  const repo = githubRepoInput.value.trim();

  if (!token) {
    showInlineStatus(githubStatusDiv, "error", "⚠️ Please enter a GitHub token to test.");
    return;
  }
  if (!repo) {
    showInlineStatus(githubStatusDiv, "error", "⚠️ Please enter a repository to test.");
    return;
  }

  showInlineStatus(githubStatusDiv, "info", "Testing GitHub connection...");
  testGithubBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "testGithubConnection",
      token,
      repo
    });

    if (response && response.success) {
      // Auto-save verified token and repo immediately so the user never gets an unconfigured error
      chrome.storage.sync.set({ GITHUB_TOKEN: token, GITHUB_REPO: repo });
      chrome.storage.local.set({ GITHUB_TOKEN: token, GITHUB_REPO: repo });

      showInlineStatus(githubStatusDiv, "success", `✅ ${response.message} (Auto-saved!)`);
    } else {
      showInlineStatus(githubStatusDiv, "error", `❌ ${response?.message || "Failed to reach GitHub"}`);
    }
  } catch (err) {
    showInlineStatus(githubStatusDiv, "error", `❌ Error: ${err.message}`);
  } finally {
    testGithubBtn.disabled = false;
  }
});

// Test AI Reviewer (Banner right beneath AI test button)
testAiBtn.addEventListener("click", async () => {
  const provider = aiProviderSelect.value;
  showInlineStatus(aiStatusDiv, "info", `Testing ${provider.toUpperCase()} connection...`);
  testAiBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      action: "testAiConnection",
      provider,
      groqKey: groqKeyInput.value.trim() || DEFAULT_GROQ_KEY,
      groqModel: groqModelSelect.value,
      openAiKey: openAiKeyInput.value.trim(),
      openAiModel: openAiModelSelect.value,
      ollamaUrl: ollamaUrlInput.value.trim(),
      ollamaModel: ollamaModelInput.value.trim()
    });

    if (response && response.success) {
      showInlineStatus(aiStatusDiv, "success", `✅ ${response.message}`);
    } else {
      showInlineStatus(aiStatusDiv, "error", `❌ ${response?.message || "Connection failed"}`);
    }
  } catch (err) {
    showInlineStatus(aiStatusDiv, "error", `❌ Error: ${err.message}`);
  } finally {
    testAiBtn.disabled = false;
  }
});

const openBulkSyncFromSettingsBtn = document.getElementById("openBulkSyncFromSettingsBtn");
if (openBulkSyncFromSettingsBtn) {
  openBulkSyncFromSettingsBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "bulk-sync.html" });
  });
}

function showInlineStatus(element, type, message) {
  element.className = `inline-status ${type}`;
  element.innerHTML = message;
  element.style.display = "block";
}
