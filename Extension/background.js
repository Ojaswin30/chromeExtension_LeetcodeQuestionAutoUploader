// LeetCode Solution Uploader - Background Service Worker

// Default Groq configuration (Keys should be set via Extension Settings)
const DEFAULT_GROQ_KEY = "";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "uploadWithReview") {
    handleUploadWithReview(message)
      .then(res => sendResponse(res || { success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open if needed
  } else if (message.action === "prepareProblemFiles") {
    handlePrepareProblemFiles(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.action === "commitBatch") {
    handleCommitBatch(message)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  } else if (message.action === "testGithubConnection") {
    testGithubConnection(message).then(sendResponse);
    return true;
  } else if (message.action === "testAiConnection") {
    testAiConnection(message).then(sendResponse);
    return true;
  }
});

async function handleUploadWithReview(message) {
  const { title, questionNumber, code, questionBody, folder, language, url, includeReview } = message;

  try {
    const config = await getAllConfig();
    const githubToken = config.GITHUB_TOKEN;
    const githubRepo = config.GITHUB_REPO || "Ojaswin30/Leetcode";
    const githubBranch = config.GITHUB_BRANCH || "";
    const pathFormat = config.PATH_FORMAT || "subfolder_readme";

    if (!githubToken) {
      throw new Error("GitHub Token not configured. Please open Extension Settings and save your GitHub Personal Access Token.");
    }

    // Format title with 4-digit zero-padded number (e.g. 0001. Two Sum)
    let paddedNumber = "";
    let cleanTitle = title || "Untitled";

    if (questionNumber) {
      paddedNumber = String(questionNumber).padStart(4, '0');
    } else {
      const match = cleanTitle.match(/^(\d+)[\.\s-]+(.*)/);
      if (match) {
        paddedNumber = match[1].padStart(4, '0');
        cleanTitle = match[2].trim();
      }
    }

    cleanTitle = sanitizeFileName(cleanTitle.replace(/^0*\d+[\.\s-]*/, '').trim() || "Untitled");
    const formattedTitle = paddedNumber ? `${paddedNumber}. ${cleanTitle}` : cleanTitle;

    const ext = getFileExtension(language);
    const langDisplayName = getLanguageDisplayName(language);

    // AI Code Review
    let reviewText = "";
    let providerName = "None";

    if (includeReview) {
      const provider = config.AI_PROVIDER || "groq";

      if (provider === "groq") {
        providerName = "Groq (gpt-oss-120b)";
        const apiKey = config.GROQ_API_KEY || DEFAULT_GROQ_KEY;
        const model = config.GROQ_MODEL || DEFAULT_GROQ_MODEL;

        if (!apiKey) {
          throw new Error("Groq API Key is missing. Please add your key in Extension Settings.");
        }

        sendProgress("Getting AI code review from Groq...");
        reviewText = await getGroqReview(code, formattedTitle, language, apiKey, model);
      } else if (provider === "openai") {
        providerName = "OpenAI (ChatGPT)";
        const apiKey = config.OPENAI_API_KEY;
        const model = config.OPENAI_MODEL || "gpt-4o-mini";

        if (!apiKey) {
          throw new Error("OpenAI API Key is missing in Extension Settings.");
        }

        sendProgress("Getting AI code review from OpenAI...");
        reviewText = await getOpenAiReview(code, formattedTitle, language, apiKey, model);
      } else if (provider === "ollama") {
        providerName = "Ollama (Local)";
        const baseUrl = config.OLLAMA_URL || "http://localhost:11434";
        const model = config.OLLAMA_MODEL || "mistral";

        sendProgress("Getting AI code review from Ollama...");
        reviewText = await getOllamaReview(code, formattedTitle, language, baseUrl, model);
      }
    }

    // Determine target file paths
    let codeFilePath = "";
    let readmeFilePath = "";

    const langPrefix = getLanguageFilePrefix(language);
    const codeFileName = `${langPrefix}_${cleanTitle}.${ext}`;

    if (pathFormat === "direct_file") {
      codeFilePath = `${folder}/${codeFileName}`;
    } else {
      // Default: subfolder (e.g. Easy/0001. Two Sum/cpp_Two Sum.cpp + README.md)
      codeFilePath = `${folder}/${formattedTitle}/${codeFileName}`;
      readmeFilePath = `${folder}/${formattedTitle}/README.md`;
    }

    const codeWithHeader = formatCodeWithHeader(code, formattedTitle, language, url);

    // Prepare README.md
    let mergedReadme = "";
    if (readmeFilePath) {
      sendProgress("Preparing README.md with problem description & review...");
      let existingReadme = "";
      try {
        const existingData = await getGitHubFile({
          filePath: readmeFilePath,
          githubToken,
          githubRepo,
          githubBranch
        });
        if (existingData && existingData.content) {
          existingReadme = decodeBase64Utf8(existingData.content);
        }
      } catch (e) {
        // New README
      }

      mergedReadme = mergeReadme(
        existingReadme,
        formattedTitle,
        questionBody,
        code,
        language,
        reviewText,
        providerName,
        url,
        folder
      );
    }

    // Single-commit: Save code file + README together in 1 atomic Git commit!
    const filesToCommit = [
      { path: codeFilePath, content: codeWithHeader }
    ];
    if (readmeFilePath && mergedReadme) {
      filesToCommit.push({ path: readmeFilePath, content: mergedReadme });
    }

    sendProgress(`Committing ${langDisplayName} solution and README in 1 commit...`);
    let finalUrl = "";
    try {
      const commitRes = await commitFilesBatch({
        files: filesToCommit,
        commitMessage: `Add ${langDisplayName} solution for ${formattedTitle}`,
        githubToken,
        githubRepo,
        githubBranch
      });
      finalUrl = commitRes.commitUrl;
    } catch (batchErr) {
      console.warn("Single-commit batch failed, falling back to uploadToGitHub:", batchErr);
      const codeResult = await uploadToGitHub({
        filePath: codeFilePath,
        commitMessage: `Add ${langDisplayName} solution for ${formattedTitle}`,
        content: codeWithHeader,
        githubToken,
        githubRepo,
        githubBranch
      });
      if (readmeFilePath && mergedReadme) {
        await uploadToGitHub({
          filePath: readmeFilePath,
          commitMessage: `Update README for ${formattedTitle} (${langDisplayName})`,
          content: mergedReadme,
          githubToken,
          githubRepo,
          githubBranch
        });
      }
      finalUrl = codeResult.fileHtmlUrl;
    }

    chrome.runtime.sendMessage({
      status: "success",
      message: `Saved ${langDisplayName} solution and updated README!`,
      url: finalUrl,
      path: codeFilePath
    }).catch(() => {});

    return { success: true, filePath: codeFilePath, url: finalUrl };

  } catch (error) {
    console.error("Upload error:", error);
    chrome.runtime.sendMessage({
      status: "error",
      message: error.message || "Failed to process solution"
    }).catch(() => {});
    throw error;
  }
}

async function handlePrepareProblemFiles(message) {
  const {
    title,
    questionNumber,
    code,
    questionBody,
    folder,
    language,
    url,
    includeReview,
    existingReadme
  } = message;

  const config = await getAllConfig();
  const pathFormat = config.PATH_FORMAT || "subfolder_readme";

  let paddedNumber = "";
  let cleanTitle = title || "Untitled";

  if (questionNumber) {
    paddedNumber = String(questionNumber).padStart(4, '0');
  } else {
    const match = cleanTitle.match(/^(\d+)[\.\s-]+(.*)/);
    if (match) {
      paddedNumber = match[1].padStart(4, '0');
      cleanTitle = match[2].trim();
    }
  }

  cleanTitle = sanitizeFileName(cleanTitle.replace(/^0*\d+[\.\s-]*/, '').trim() || "Untitled");
  const formattedTitle = paddedNumber ? `${paddedNumber}. ${cleanTitle}` : cleanTitle;

  const ext = getFileExtension(language);
  const langDisplayName = getLanguageDisplayName(language);

  // AI Code Review
  let reviewText = "";
  let providerName = "None";

  if (includeReview) {
    const provider = config.AI_PROVIDER || "groq";
    if (provider === "groq") {
      providerName = "Groq (gpt-oss-120b)";
      const apiKey = config.GROQ_API_KEY || DEFAULT_GROQ_KEY;
      const model = config.GROQ_MODEL || DEFAULT_GROQ_MODEL;
      reviewText = await getGroqReview(code, formattedTitle, language, apiKey, model);
    } else if (provider === "openai") {
      providerName = "OpenAI (ChatGPT)";
      const apiKey = config.OPENAI_API_KEY;
      const model = config.OPENAI_MODEL || "gpt-4o-mini";
      if (apiKey) {
        reviewText = await getOpenAiReview(code, formattedTitle, language, apiKey, model);
      }
    } else if (provider === "ollama") {
      providerName = "Ollama (Local)";
      const baseUrl = config.OLLAMA_URL || "http://localhost:11434";
      const model = config.OLLAMA_MODEL || "mistral";
      reviewText = await getOllamaReview(code, formattedTitle, language, baseUrl, model);
    }
  }

  const langPrefix = getLanguageFilePrefix(language);
  const codeFileName = `${langPrefix}_${cleanTitle}.${ext}`;

  let codeFilePath = "";
  let readmeFilePath = "";

  if (pathFormat === "direct_file") {
    codeFilePath = `${folder}/${codeFileName}`;
  } else {
    codeFilePath = `${folder}/${formattedTitle}/${codeFileName}`;
    readmeFilePath = `${folder}/${formattedTitle}/README.md`;
  }

  const codeWithHeader = formatCodeWithHeader(code, formattedTitle, language, url);
  const mergedReadme = mergeReadme(
    existingReadme || "",
    formattedTitle,
    questionBody,
    code,
    language,
    reviewText,
    providerName,
    url,
    folder
  );

  return {
    success: true,
    codeFilePath,
    codeContent: codeWithHeader,
    readmeFilePath,
    readmeContent: mergedReadme,
    formattedTitle,
    langDisplayName
  };
}

async function handleCommitBatch(message) {
  const { files, commitMessage } = message;
  const config = await getAllConfig();
  const githubToken = config.GITHUB_TOKEN;
  const githubRepo = config.GITHUB_REPO || "Ojaswin30/Leetcode";
  const githubBranch = config.GITHUB_BRANCH || "";

  if (!githubToken) {
    throw new Error("GitHub Token not configured. Please open Extension Settings.");
  }

  return await commitFilesBatch({
    files,
    commitMessage,
    githubToken,
    githubRepo,
    githubBranch
  });
}

function sendProgress(message) {
  chrome.runtime.sendMessage({
    status: "processing",
    message: message
  }).catch(() => {});
}

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

function getLanguageDisplayName(lang) {
  if (!lang) return 'Code';
  const l = lang.toLowerCase().trim();
  const map = {
    python: 'Python', python3: 'Python 3',
    cpp: 'C++', 'c++': 'C++',
    c: 'C',
    java: 'Java',
    csharp: 'C#', 'c#': 'C#',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    go: 'Go',
    rust: 'Rust',
    swift: 'Swift',
    kotlin: 'Kotlin',
    ruby: 'Ruby',
    scala: 'Scala',
    php: 'PHP',
    sql: 'SQL'
  };
  return map[l] || lang.toUpperCase();
}

function formatCodeWithHeader(code, title, language, url) {
  const l = (language || '').toLowerCase();
  const langName = getLanguageDisplayName(language);

  if (['python', 'python3', 'ruby', 'shell', 'bash', 'sh'].includes(l)) {
    return `# Problem: ${title}\n# Language: ${langName}\n# LeetCode: ${url}\n\n${code.trim()}\n`;
  }
  if (['sql', 'mysql'].includes(l)) {
    return `-- Problem: ${title}\n-- Language: ${langName}\n-- LeetCode: ${url}\n\n${code.trim()}\n`;
  }
  return `/*\n * Problem: ${title}\n * Language: ${langName}\n * LeetCode: ${url}\n */\n\n${code.trim()}\n`;
}

function mergeReadme(existingContent, formattedTitle, questionBody, code, language, reviewText, providerName, url, folder) {
  const langName = getLanguageDisplayName(language);

  const solutionBlock = `### ${langName}\n\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n\n${reviewText ? `#### 🤖 AI Code Review (${providerName})\n\n${reviewText.trim()}\n\n` : ''}`;

  if (!existingContent || !existingContent.trim()) {
    return `# ${formattedTitle}

- **Difficulty**: ${folder}
- **LeetCode Link**: [${formattedTitle}](${url})

---

## 📖 Problem Description

${questionBody || "[Description not available]"}

---

## 💻 Solutions

${solutionBlock}
---
*Automated solution upload via [LeetCode Solution Uploader](https://github.com/Ojaswin30/chromeExtension_QuestionAutoUploader)*
`;
  }

  // If already contains this language header, replace that section
  const langHeaderRegex = new RegExp(`###\\s+${escapeRegex(langName)}[\\s\\S]*?(?=###|---\\s*\\*Automated|$)`, 'i');
  if (langHeaderRegex.test(existingContent)) {
    return existingContent.replace(langHeaderRegex, solutionBlock);
  }

  // If "## 💻 Solutions" section exists, append before the footer
  if (existingContent.includes("## 💻 Solutions")) {
    const parts = existingContent.split("## 💻 Solutions");
    const footerMarker = "---\n*Automated";
    if (parts[1].includes(footerMarker)) {
      const subParts = parts[1].split(footerMarker);
      return `${parts[0]}## 💻 Solutions\n\n${subParts[0].trim()}\n\n${solutionBlock}\n${footerMarker}${subParts[1]}`;
    }
    return `${parts[0]}## 💻 Solutions\n\n${parts[1].trim()}\n\n${solutionBlock}`;
  }

  // Fallback: append at end
  return `${existingContent.trim()}\n\n---\n\n## 💻 Solutions\n\n${solutionBlock}`;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeBase64Utf8(base64Str) {
  const cleanBase64 = base64Str.replace(/\s/g, '');
  const binary = atob(cleanBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// GitHub API functions
async function getGitHubFile({ filePath, githubToken, githubRepo, githubBranch }) {
  const encodedPath = filePath.split('/').map(seg => encodeURIComponent(seg)).join('/');
  const branchParam = githubBranch ? `?ref=${encodeURIComponent(githubBranch)}` : '';
  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${encodedPath}${branchParam}`;

  const res = await fetch(apiUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (res.ok) {
    return await res.json();
  }
  return null;
}

async function uploadToGitHub({ filePath, commitMessage, content, githubToken, githubRepo, githubBranch }) {
  const encodedPath = filePath.split('/').map(seg => encodeURIComponent(seg)).join('/');
  const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${encodedPath}`;
  const branchParam = githubBranch ? `?ref=${encodeURIComponent(githubBranch)}` : '';

  // 1. Check if file already exists to get SHA
  let sha = null;
  try {
    const existing = await getGitHubFile({ filePath, githubToken, githubRepo, githubBranch });
    if (existing && existing.sha) {
      sha = existing.sha;
    }
  } catch (e) {}

  // 2. Safe Base64 encoding
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const contentBase64 = btoa(binary);

  const payload = {
    message: commitMessage || `Update ${filePath}`,
    content: contentBase64
  };
  if (sha) payload.sha = sha;
  if (githubBranch) payload.branch = githubBranch;

  const putRes = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify(payload)
  });

  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    let msg = errData.message || `HTTP ${putRes.status}`;
    if (putRes.status === 401) msg = "Invalid GitHub Token. Please check extension settings.";
    if (putRes.status === 404) msg = `Repository "${githubRepo}" not found, or token lacks access.`;
    if (putRes.status === 403) msg = "Permission denied. Ensure your token has 'repo' scope.";
    throw new Error(msg);
  }

  const resultData = await putRes.json();
  const fileHtmlUrl = resultData.content?.html_url || `https://github.com/${githubRepo}/blob/${githubBranch || 'main'}/${filePath}`;
  return { fileHtmlUrl, filePath };
}

// Commit multiple files in 1 single atomic Git commit using GitHub Git Database Trees & Commits API
async function commitFilesBatch({ files, commitMessage, githubToken, githubRepo, githubBranch }) {
  if (!files || files.length === 0) {
    throw new Error("No files provided for commit.");
  }

  let branch = (githubBranch || "").trim();

  // 1. Detect default branch if not specified
  if (!branch) {
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${githubRepo}`, {
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        branch = repoData.default_branch || "main";
      } else {
        branch = "main";
      }
    } catch (e) {
      branch = "main";
    }
  }

  // 2. Fetch current commit SHA of target branch
  let refRes = await fetch(`https://api.github.com/repos/${githubRepo}/git/ref/heads/${branch}`, {
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  // Fallback: If 'main' was not found, try 'master'
  if (!refRes.ok && branch === "main") {
    const masterRes = await fetch(`https://api.github.com/repos/${githubRepo}/git/ref/heads/master`, {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (masterRes.ok) {
      refRes = masterRes;
      branch = "master";
    }
  }

  if (!refRes.ok) {
    const errData = await refRes.json().catch(() => ({}));
    throw new Error(`Could not access branch '${branch}' on repository '${githubRepo}': ${errData.message || refRes.status}`);
  }

  const refData = await refRes.json();
  const baseCommitSha = refData.object.sha;

  // 3. Fetch base tree SHA from base commit
  const commitRes = await fetch(`https://api.github.com/repos/${githubRepo}/git/commits/${baseCommitSha}`, {
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!commitRes.ok) {
    throw new Error(`Failed to read commit ${baseCommitSha}`);
  }
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  // 4. Create new Git Tree containing all files
  const treeEntries = files.map(file => ({
    path: file.path,
    mode: "100644",
    type: "blob",
    content: file.content
  }));

  const treeRes = await fetch(`https://api.github.com/repos/${githubRepo}/git/trees`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeEntries
    })
  });

  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new Error(`GitHub Git Tree error: ${err.message || treeRes.status}`);
  }
  const treeData = await treeRes.json();
  const newTreeSha = treeData.sha;

  // 5. Create new Git Commit pointing to new tree
  const newCommitRes = await fetch(`https://api.github.com/repos/${githubRepo}/git/commits`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      message: commitMessage || `Bulk sync ${files.length} file(s)`,
      tree: newTreeSha,
      parents: [baseCommitSha]
    })
  });

  if (!newCommitRes.ok) {
    const err = await newCommitRes.json().catch(() => ({}));
    throw new Error(`GitHub Commit error: ${err.message || newCommitRes.status}`);
  }
  const newCommitData = await newCommitRes.json();
  const newCommitSha = newCommitData.sha;

  // 6. Update branch reference (points branch to new commit)
  const updateRefRes = await fetch(`https://api.github.com/repos/${githubRepo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      sha: newCommitSha,
      force: false
    })
  });

  if (!updateRefRes.ok) {
    const err = await updateRefRes.json().catch(() => ({}));
    throw new Error(`GitHub Update Ref error: ${err.message || updateRefRes.status}`);
  }

  return {
    success: true,
    commitSha: newCommitSha,
    commitUrl: `https://github.com/${githubRepo}/commit/${newCommitSha}`,
    filesCount: files.length,
    branch
  };
}

function sanitizeFileName(title) {
  return title
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getGroqReview(code, title, language, apiKey, modelName) {
  const model = modelName || DEFAULT_GROQ_MODEL;
  const prompt = `Review this LeetCode solution for "${title}" (${language || "code"}):

\`\`\`${language || ""}
${code}
\`\`\`

Provide concise, high-value code review feedback:
1. **Complexity Analysis**: Time and Space Complexity with Big-O.
2. **Approach & Quality**: Key strengths and readability.
3. **Edge Cases**: Notable edge cases handled or missed.
4. **Optimizations / Suggestions**: Actionable improvements (if any).
Keep it punchy, practical, and under 250 words.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are an expert senior software engineer providing concise LeetCode code reviews."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `Groq API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) msg = `Groq error: ${parsed.error.message}`;
    } catch (e) {}
    throw new Error(msg);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "[No response from Groq]";
}

async function getOpenAiReview(code, title, language, apiKey, modelName) {
  const model = modelName || "gpt-4o-mini";
  const prompt = `Review this LeetCode solution for "${title}" (${language || "code"}):\n\n\`\`\`${language || ""}\n${code}\n\`\`\`\n\nProvide brief feedback on: time/space complexity, edge cases, code quality, and potential improvements. Keep it concise.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: "You are an expert senior software engineer providing concise LeetCode code reviews." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1024
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "[No response from OpenAI]";
}

async function getOllamaReview(code, title, language, baseUrl, modelName) {
  const url = `${(baseUrl || "http://localhost:11434").replace(/\/$/, '')}/api/generate`;
  const model = modelName || "mistral";
  const prompt = `Review this LeetCode solution for "${title}" (${language || "code"}):\n\n${code}\n\nProvide brief feedback on: time/space complexity, edge cases, code quality, and potential improvements. Keep it concise.`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false
      })
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Ollama model "${model}" not found. Run: ollama pull ${model}`);
      }
      throw new Error(`Ollama error HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.response?.trim() || "[No response from Ollama]";
  } catch (err) {
    if (err.message.includes("Failed to fetch")) {
      throw new Error("Cannot reach local Ollama. Ensure 'ollama serve' is running at localhost:11434.");
    }
    throw err;
  }
}

// Connection test helpers
async function testGithubConnection({ token, repo }) {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json"
      }
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, message: `Connected! Repo: "${data.full_name}" (Default branch: ${data.default_branch})` };
    }
    if (res.status === 401) return { success: false, message: "Invalid GitHub Token." };
    if (res.status === 404) return { success: false, message: `Repository "${repo}" not found or token lacks 'repo' scope.` };
    return { success: false, message: `GitHub returned status ${res.status}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function testAiConnection({ provider, groqKey, groqModel, openAiKey, openAiModel, ollamaUrl, ollamaModel }) {
  try {
    if (provider === "groq") {
      const key = groqKey || DEFAULT_GROQ_KEY;
      if (!key) return { success: false, message: "Groq API Key is empty. Please enter your API key from console.groq.com/keys" };
      const model = groqModel || DEFAULT_GROQ_MODEL;
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: "Reply with the single word 'CONNECTED'" }],
          max_tokens: 10
        })
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, message: `Groq error: ${text}` };
      }
      return { success: true, message: `Connected to Groq! Model: ${model}` };
    } else if (provider === "openai") {
      if (!openAiKey) return { success: false, message: "OpenAI API Key is empty." };
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${openAiKey}` }
      });
      if (!res.ok) return { success: false, message: `OpenAI returned status ${res.status}` };
      return { success: true, message: "Connected to OpenAI successfully!" };
    } else if (provider === "ollama") {
      const url = `${(ollamaUrl || "http://localhost:11434").replace(/\/$/, '')}/api/tags`;
      const res = await fetch(url);
      if (!res.ok) return { success: false, message: `Ollama returned status ${res.status}` };
      const data = await res.json();
      const models = (data.models || []).map(m => m.name).join(", ");
      return { success: true, message: `Connected to Ollama! Available models: ${models || 'none'}` };
    }
    return { success: true, message: "AI Review disabled." };
  } catch (err) {
    return { success: false, message: err.message };
  }
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
