// Popup logic for LeetCode Solution Uploader

const problemTitleDiv = document.getElementById("problemTitle");
const pathPreviewDiv = document.getElementById("pathPreview");
const diffBadge = document.getElementById("diffBadge");
const langBadge = document.getElementById("langBadge");
const codeBadge = document.getElementById("codeBadge");
const folderSelect = document.getElementById("folderSelect");
const includeReviewCheck = document.getElementById("includeReviewCheck");
const reviewLabel = document.getElementById("reviewLabel");
const uploadBtn = document.getElementById("uploadBtn");
const statusDiv = document.getElementById("status");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const openBulkSyncBtn = document.getElementById("openBulkSyncBtn");
const openBulkSyncNoticeBtn = document.getElementById("openBulkSyncNoticeBtn");
const leetcodeContent = document.getElementById("leetcodeContent");
const notLeetcodeNotice = document.getElementById("notLeetcodeNotice");

// Quick Setup Elements
const quickSetupCard = document.getElementById("quickSetupCard");
const quickTokenInput = document.getElementById("quickTokenInput");
const quickRepoInput = document.getElementById("quickRepoInput");
const quickSaveBtn = document.getElementById("quickSaveBtn");

let currentData = null;
let currentPathFormat = "subfolder_readme";
let currentConfig = {};

// Settings button
openSettingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Bulk sync buttons
if (openBulkSyncBtn) {
  openBulkSyncBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "bulk-sync.html" });
  });
}
if (openBulkSyncNoticeBtn) {
  openBulkSyncNoticeBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "bulk-sync.html" });
  });
}

// Update target path preview when folder dropdown changes
folderSelect.addEventListener("change", () => {
  updatePathPreview();
});

function getFileExtension(lang) {
  if (!lang) return 'txt';
  const l = lang.toLowerCase().trim();
  const map = {
    python: 'py', python3: 'py', py: 'py',
    cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c',
    java: 'java',
    csharp: 'cs', 'c#': 'cs', cs: 'cs',
    javascript: 'js', js: 'js',
    typescript: 'ts', ts: 'ts',
    go: 'go', golang: 'go',
    rust: 'rs', rs: 'rs',
    swift: 'swift',
    kotlin: 'kt', kt: 'kt',
    ruby: 'rb', rb: 'rb',
    scala: 'scala',
    php: 'php',
    sql: 'sql', mysql: 'sql',
    r: 'r',
    dart: 'dart',
    shell: 'sh', bash: 'sh', sh: 'sh'
  };
  return map[l] || 'txt';
}

function getLanguageFilePrefix(lang) {
  if (!lang) return 'code';
  const l = lang.toLowerCase().trim();
  const map = {
    cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp',
    python: 'python', python3: 'python', py: 'python',
    java: 'java',
    javascript: 'javascript', js: 'javascript',
    typescript: 'typescript', ts: 'typescript',
    c: 'c',
    csharp: 'csharp', 'c#': 'csharp', cs: 'csharp',
    go: 'go', golang: 'go',
    rust: 'rust', rs: 'rust',
    swift: 'swift',
    kotlin: 'kotlin', kt: 'kotlin',
    ruby: 'ruby', rb: 'ruby',
    scala: 'scala',
    php: 'php',
    sql: 'sql'
  };
  return map[l] || l;
}

function updatePathPreview() {
  if (!currentData) return;
  const folder = folderSelect.value;
  const formattedTitle = currentData.formattedTitle || currentData.cleanTitle || "Problem";
  const cleanTitle = currentData.cleanTitle || "Problem";
  const langPrefix = getLanguageFilePrefix(currentData.language);
  const ext = getFileExtension(currentData.language);
  const codeFileName = `${langPrefix}_${cleanTitle}.${ext}`;

  let preview = "";
  if (currentPathFormat === "direct_file") {
    preview = `${folder}/${codeFileName}`;
  } else {
    // Default: subfolder (e.g. Easy/0001. Two Sum/cpp_Two Sum.cpp + README.md)
    preview = `${folder}/${formattedTitle}/${codeFileName} + README.md`;
  }

  pathPreviewDiv.textContent = `📁 Target: ${preview}`;
}

// Quick setup button handler inside popup
quickSaveBtn.addEventListener("click", async () => {
  const token = quickTokenInput.value.trim();
  const repo = quickRepoInput.value.trim() || "Ojaswin30/Leetcode";

  if (!token) {
    alert("Please paste your GitHub Personal Access Token.");
    return;
  }

  quickSaveBtn.disabled = true;
  quickSaveBtn.textContent = "Saving...";

  const update = { GITHUB_TOKEN: token, GITHUB_REPO: repo };

  chrome.storage.sync.set(update, () => {
    chrome.storage.local.set(update, () => {
      currentConfig.GITHUB_TOKEN = token;
      currentConfig.GITHUB_REPO = repo;

      quickSetupCard.style.display = "none";
      showStatus("success", "✅ GitHub Connected! You can now upload.");

      if (currentData && currentData.code?.trim().length > 0) {
        uploadBtn.disabled = false;
      }
    });
  });
});

// Initialize popup
document.addEventListener("DOMContentLoaded", async () => {
  currentConfig = await getAllConfig();

  // If token is missing, show inline quick setup card right in popup
  if (!currentConfig.GITHUB_TOKEN) {
    quickSetupCard.style.display = "block";
    if (currentConfig.GITHUB_REPO) {
      quickRepoInput.value = currentConfig.GITHUB_REPO;
    }
  } else {
    quickSetupCard.style.display = "none";
  }

  // Update AI provider & Path format preferences
  const provider = currentConfig.AI_PROVIDER || "groq";
  if (provider === "groq") reviewLabel.textContent = "Include AI Review (Groq - Fast)";
  else if (provider === "openai") reviewLabel.textContent = "Include AI Review (OpenAI)";
  else if (provider === "ollama") reviewLabel.textContent = "Include AI Review (Ollama Local)";
  else if (provider === "none") {
    includeReviewCheck.checked = false;
    reviewLabel.textContent = "AI Review (Disabled in settings)";
    includeReviewCheck.disabled = true;
  }

  if (currentConfig.PATH_FORMAT) {
    currentPathFormat = currentConfig.PATH_FORMAT;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes("leetcode.com/problems/")) {
    leetcodeContent.style.display = "none";
    notLeetcodeNotice.style.display = "block";
    return;
  }

  // Extract LeetCode data
  try {
    currentData = await extractDataFromTab(tab.id);

    if (!currentData || !currentData.cleanTitle) {
      problemTitleDiv.textContent = "Could not parse LeetCode problem";
      showStatus("error", "Failed to extract problem details. Please refresh the page and try again.");
      return;
    }

    // Populate Title
    problemTitleDiv.textContent = currentData.formattedTitle;

    // Populate Difficulty
    const diff = currentData.difficulty || "Medium";
    diffBadge.textContent = diff;
    diffBadge.className = `badge badge-${diff.toLowerCase()}`;
    folderSelect.value = diff;

    // Update Path Preview
    updatePathPreview();

    // Populate Language
    const lang = currentData.language || "code";
    langBadge.textContent = lang.toUpperCase();
    langBadge.className = "badge badge-neutral";

    // Populate Code status
    const code = currentData.code?.trim() || "";
    if (code.length > 0) {
      const lineCount = code.split("\n").length;
      codeBadge.textContent = `✓ ${lineCount} lines`;
      codeBadge.className = "badge badge-easy";
      if (currentConfig.GITHUB_TOKEN) {
        uploadBtn.disabled = false;
      }
    } else {
      codeBadge.textContent = "⚠️ No code found";
      codeBadge.className = "badge badge-hard";
      showStatus("error", "No solution code detected in editor. Please write or paste code first.");
      uploadBtn.disabled = true;
    }

  } catch (err) {
    console.error("Extraction error:", err);
    problemTitleDiv.textContent = "Error reading page";
    showStatus("error", err.message || "Failed to inspect tab");
  }
});

// Upload click handler
uploadBtn.addEventListener("click", async () => {
  if (!currentData) return;

  // Final check for token
  if (!currentConfig.GITHUB_TOKEN) {
    quickSetupCard.style.display = "block";
    quickTokenInput.focus();
    showStatus("error", "Please enter and save your GitHub Token first.");
    return;
  }

  const folder = folderSelect.value;
  const includeReview = includeReviewCheck.checked;

  uploadBtn.disabled = true;
  showStatus("loading", "<span class='spinner'></span> Preparing upload...");

  chrome.runtime.sendMessage({
    action: "uploadWithReview",
    title: currentData.cleanTitle,
    questionNumber: currentData.questionNumber,
    code: currentData.code,
    questionBody: currentData.questionBody,
    folder: folder,
    language: currentData.language,
    url: currentData.url,
    includeReview: includeReview
  });
});

// Runtime message listener for progress & success
chrome.runtime.onMessage.addListener((response) => {
  if (response.status === "processing") {
    showStatus("loading", `<span class='spinner'></span> ${response.message}`);
  } else if (response.status === "success") {
    const link = response.url ? `<br><a href="${response.url}" target="_blank">View on GitHub ↗</a>` : '';
    showStatus("success", `✅ ${response.message}${link}`);
    uploadBtn.disabled = false;
  } else if (response.status === "error") {
    let extra = '';
    if (response.message.includes("Token") || response.message.includes("settings") || response.message.includes("configured")) {
      quickSetupCard.style.display = "block";
      quickTokenInput.focus();
      extra = `<br><a href="#" id="openSettingsLink">Open Extension Settings</a>`;
    }
    showStatus("error", `❌ ${response.message}${extra}`);
    uploadBtn.disabled = false;

    const linkEl = document.getElementById("openSettingsLink");
    if (linkEl) {
      linkEl.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    }
  }
});

function showStatus(type, html) {
  statusDiv.className = type;
  statusDiv.innerHTML = html;
}

async function getAllConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (syncItems) => {
      chrome.storage.local.get(null, (localItems) => {
        resolve({ ...(localItems || {}), ...(syncItems || {}) });
      });
    });
  });
}

// Extraction orchestration
async function extractDataFromTab(tabId) {
  // First try Main World (gives access to window.monaco)
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: scrapeLeetCodeInMainWorld
    });
    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
  } catch (err) {
    console.warn("Main world extraction failed, falling back to isolated:", err);
  }

  // Fallback: Isolated World
  const fallbackResults = await chrome.scripting.executeScript({
    target: { tabId },
    func: scrapeLeetCodeInIsolatedWorld
  });
  return fallbackResults?.[0]?.result || null;
}

// Executed in the webpage's MAIN world
function scrapeLeetCodeInMainWorld() {
  // 1. Title & Problem Number
  let rawTitle = "";
  let questionNumber = "";

  const titleSelectors = [
    'div[data-cy="question-title"]',
    'div.text-title-large',
    'a[href*="/problems/"][class*="title"]',
    '[class*="text-title-"]',
    'h4[data-cy="question-title"]'
  ];
  for (const s of titleSelectors) {
    const el = document.querySelector(s);
    if (el && el.textContent.trim()) {
      rawTitle = el.textContent.trim();
      break;
    }
  }

  if (!rawTitle) {
    rawTitle = document.title.replace(/- LeetCode.*/i, '').trim();
  }

  let cleanTitle = rawTitle;
  const numMatch = rawTitle.match(/^(\d+)[\.\s-]+(.*)/);
  if (numMatch) {
    questionNumber = numMatch[1];
    cleanTitle = numMatch[2].trim();
  }

  if (!cleanTitle) {
    const slugMatch = window.location.pathname.match(/\/problems\/([^\/]+)/);
    if (slugMatch && slugMatch[1]) {
      cleanTitle = slugMatch[1]
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  cleanTitle = cleanTitle.trim() || "Untitled Problem";
  const paddedNumber = questionNumber ? questionNumber.padStart(4, '0') : "";
  const formattedTitle = paddedNumber ? `${paddedNumber}. ${cleanTitle}` : cleanTitle;

  // 2. Difficulty
  let difficulty = "Medium";
  const diffElem = document.querySelector('[class*="text-difficulty-"], [class*="text-easy"], [class*="text-medium"], [class*="text-hard"], div[class*="text-olive"], div[class*="text-yellow"], div[class*="text-pink"], span[data-degree]');
  if (diffElem) {
    const text = diffElem.textContent.trim().toLowerCase();
    if (text.includes("easy")) difficulty = "Easy";
    else if (text.includes("hard")) difficulty = "Hard";
    else if (text.includes("medium")) difficulty = "Medium";
  } else {
    const badges = Array.from(document.querySelectorAll('span, div')).filter(el => 
      el.children.length === 0 && ["Easy", "Medium", "Hard"].includes(el.textContent.trim())
    );
    if (badges.length > 0) {
      difficulty = badges[0].textContent.trim();
    }
  }

  // 3. Problem Description
  let questionBody = "";
  const descSelectors = [
    '[data-track-load="description_content"]',
    'div[class*="elfjS"]',
    'div[data-key="description-content"]',
    'div.question-content__JfgR',
    'div.content__uRqi',
    'article'
  ];
  for (const s of descSelectors) {
    const el = document.querySelector(s);
    if (el && el.innerText.trim().length > 20) {
      questionBody = el.innerText.trim();
      break;
    }
  }

  // 4. Monaco Code Extraction
  let code = "";
  let language = "python";

  if (window.monaco && window.monaco.editor) {
    const models = window.monaco.editor.getModels();
    let bestModel = null;
    for (const m of models) {
      const val = m.getValue();
      if (val && (!bestModel || val.length > bestModel.getValue().length)) {
        bestModel = m;
      }
    }
    if (bestModel) {
      code = bestModel.getValue();
      language = bestModel.getLanguageId() || "python";
    }
  }

  // DOM lines fallback
  if (!code) {
    const lines = document.querySelectorAll('.monaco-editor .view-line');
    if (lines.length > 0) {
      code = Array.from(lines).map(line => line.textContent).join('\n');
    }
  }

  // Language selector button fallback
  if (!language || language === "plaintext") {
    const langBtn = document.querySelector('button[id*="headlessui-listbox-button"], [data-cy="lang-select"]');
    if (langBtn) {
      const txt = langBtn.textContent.trim().toLowerCase();
      if (txt.includes("python")) language = "python";
      else if (txt.includes("c++") || txt.includes("cpp")) language = "cpp";
      else if (txt.includes("java") && !txt.includes("javascript")) language = "java";
      else if (txt.includes("javascript")) language = "javascript";
      else if (txt.includes("typescript")) language = "typescript";
      else if (txt.includes("go") || txt.includes("golang")) language = "go";
      else if (txt.includes("rust")) language = "rust";
      else if (txt.includes("c#") || txt.includes("csharp")) language = "csharp";
      else if (txt.includes("sql")) language = "sql";
    }
  }

  return {
    cleanTitle,
    questionNumber,
    formattedTitle,
    difficulty,
    questionBody,
    code,
    language,
    url: window.location.href
  };
}

// Fallback in ISOLATED world
function scrapeLeetCodeInIsolatedWorld() {
  let rawTitle = "";
  const titleSelectors = ['div[data-cy="question-title"]', 'div.text-title-large', '[class*="text-title-"]'];
  for (const s of titleSelectors) {
    const el = document.querySelector(s);
    if (el && el.textContent.trim()) {
      rawTitle = el.textContent.trim();
      break;
    }
  }
  if (!rawTitle) {
    rawTitle = document.title.replace(/- LeetCode.*/i, '').trim();
  }

  let cleanTitle = rawTitle;
  let questionNumber = "";
  const numMatch = rawTitle.match(/^(\d+)[\.\s-]+(.*)/);
  if (numMatch) {
    questionNumber = numMatch[1];
    cleanTitle = numMatch[2].trim();
  }

  cleanTitle = cleanTitle.trim() || "Untitled Problem";
  const paddedNumber = questionNumber ? questionNumber.padStart(4, '0') : "";
  const formattedTitle = paddedNumber ? `${paddedNumber}. ${cleanTitle}` : cleanTitle;

  let difficulty = "Medium";
  const diffElem = document.querySelector('[class*="text-difficulty-"], [class*="text-easy"], [class*="text-medium"], [class*="text-hard"]');
  if (diffElem) {
    const text = diffElem.textContent.trim().toLowerCase();
    if (text.includes("easy")) difficulty = "Easy";
    else if (text.includes("hard")) difficulty = "Hard";
    else if (text.includes("medium")) difficulty = "Medium";
  }

  let questionBody = "";
  const descContainer = document.querySelector('[data-track-load="description_content"], article, div[class*="elfjS"]');
  if (descContainer) questionBody = descContainer.innerText.trim();

  let code = "";
  const lines = document.querySelectorAll('.monaco-editor .view-line');
  if (lines.length > 0) {
    code = Array.from(lines).map(line => line.textContent).join('\n');
  }

  return {
    cleanTitle,
    questionNumber,
    formattedTitle,
    difficulty,
    questionBody,
    code,
    language: "python",
    url: window.location.href
  };
}
