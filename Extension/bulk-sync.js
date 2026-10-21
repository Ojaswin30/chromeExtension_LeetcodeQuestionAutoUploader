// Bulk Sync Engine for LeetCode Solution Uploader

const sessionStatus = document.getElementById("sessionStatus");
const limitSelect = document.getElementById("limitSelect");
const delaySelect = document.getElementById("delaySelect");
const targetRepoInput = document.getElementById("targetRepoInput");
const includeAiReviewCheck = document.getElementById("includeAiReviewCheck");
const fetchSubmissionsBtn = document.getElementById("fetchSubmissionsBtn");

const problemCard = document.getElementById("problemCard");
const problemCountLabel = document.getElementById("problemCountLabel");
const problemsTableBody = document.getElementById("problemsTableBody");
const masterCheck = document.getElementById("masterCheck");
const selectNewOnlyBtn = document.getElementById("selectNewOnlyBtn");
const selectAllBtn = document.getElementById("selectAllBtn");
const deselectAllBtn = document.getElementById("deselectAllBtn");

const startSyncBtn = document.getElementById("startSyncBtn");
const cancelSyncBtn = document.getElementById("cancelSyncBtn");
const progressBox = document.getElementById("progressBox");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const progressBarFill = document.getElementById("progressBarFill");
const progressSubtext = document.getElementById("progressSubtext");
const logConsole = document.getElementById("logConsole");

let currentUsername = "";
let currentConfig = {};
let discoveredProblems = [];
let allProblemCatalog = new Map(); // slug -> { id, title, difficulty }
let isSyncRunning = false;
let shouldStopSync = false;

// 1. Initialize page and check LeetCode session
document.addEventListener("DOMContentLoaded", async () => {
  currentConfig = await getAllConfig();
  if (currentConfig.GITHUB_REPO) {
    targetRepoInput.value = currentConfig.GITHUB_REPO;
  }

  checkLeetCodeLogin();
});

async function checkLeetCodeLogin() {
  try {
    sessionStatus.textContent = "Checking LeetCode login...";
    const res = await callLeetCodeGraphQL(`
      query globalData {
        userStatus {
          username
          isSignedIn
        }
      }
    `);

    const userStatus = res?.data?.userStatus;
    if (userStatus && userStatus.isSignedIn && userStatus.username) {
      currentUsername = userStatus.username;
      sessionStatus.className = "status-pill pill-green";
      sessionStatus.textContent = `🟢 Logged in as: ${currentUsername}`;
    } else {
      sessionStatus.className = "status-pill pill-yellow";
      sessionStatus.innerHTML = `⚠️ Not signed in to LeetCode (<a href="https://leetcode.com/accounts/login/" target="_blank" style="color: inherit; text-decoration: underline;">Login here</a>)`;
    }
  } catch (err) {
    sessionStatus.className = "status-pill pill-yellow";
    sessionStatus.textContent = "⚠️ Could not reach LeetCode";
  }
}

// 2. Fetch Solved Problems using LeetCode REST API (Supports full history, real IDs & difficulties)
fetchSubmissionsBtn.addEventListener("click", async () => {
  if (!currentUsername) {
    await checkLeetCodeLogin();
  }

  fetchSubmissionsBtn.disabled = true;
  fetchSubmissionsBtn.innerHTML = "<span class='spinner'></span> Checking GitHub repository...";

  try {
    // 1. Fetch current GitHub repository tree in 1 fast call
    currentConfig = await getAllConfig();
    const targetRepo = targetRepoInput.value.trim() || currentConfig.GITHUB_REPO || "Ojaswin30/Leetcode";
    const existingRepoPaths = await getExistingRepoPaths(
      currentConfig.GITHUB_TOKEN,
      targetRepo,
      currentConfig.GITHUB_BRANCH
    );

    // Build index sets for fast, fuzzy-tolerant matching against existing repo items
    const existingIdsSet = new Set();
    const existingTitlesSet = new Set();

    for (const p of existingRepoPaths) {
      const parts = p.split('/');
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        // Check for "0001. Two Sum" or "1. Two Sum" or "0584. Find Customer Referee"
        const match = part.match(/^(\d+)[\.\s-]+(.*)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > 0) existingIdsSet.add(num);
          const titlePart = match[2].trim().toLowerCase();
          if (titlePart.length > 2) existingTitlesSet.add(titlePart);
        } else {
          // Folder or file without ID prefix (e.g. "Two Sum" or "Find Customer Referee")
          const cleanPart = trimmed.replace(/\.(cpp|py|java|sql|js|ts|md|cs|go|rs|txt)$/i, '').trim();
          if (cleanPart.length > 3 && !['easy', 'medium', 'hard'].includes(cleanPart)) {
            existingTitlesSet.add(cleanPart);
          }
        }
      }
    }

    fetchSubmissionsBtn.innerHTML = "<span class='spinner'></span> Loading LeetCode problem catalog...";

    // 2. Fetch complete LeetCode problem catalog (gives true IDs and difficulties for all problems)
    await loadLeetCodeProblemCatalog();

    fetchSubmissionsBtn.innerHTML = "<span class='spinner'></span> Fetching your solved problems...";

    const targetLimit = parseInt(limitSelect.value, 10) || 50;

    // 3. Fetch user's solved problems
    let solvedList = await fetchUserSolvedProblems(targetLimit);

    if (solvedList.length === 0) {
      alert("No solved problems found. Please make sure you are logged into leetcode.com in Chrome.");
      return;
    }

    // 4. Map with real IDs, real difficulties, and check against GitHub repo
    discoveredProblems = solvedList.map(item => {
      const catalogInfo = allProblemCatalog.get(item.titleSlug) || {};
      const rawId = item.frontendId || catalogInfo.id || 0;
      const numId = parseInt(rawId, 10);
      const frontendId = String(rawId).padStart(4, '0');
      const difficulty = item.difficulty || catalogInfo.difficulty || "Medium";
      const title = item.title || catalogInfo.title || item.titleSlug;
      const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '-').replace(/^0*\d+[\.\s-]*/, '').trim();
      const cleanTitleLower = cleanTitle.toLowerCase();
      const slugClean = item.titleSlug ? item.titleSlug.replace(/-/g, ' ').toLowerCase() : "";

      // Check if this problem is already present in your GitHub repository
      let isAlreadyInRepo = false;

      // Check 1: Numeric ID match (e.g. 584, 1, 15)
      if (numId > 0 && existingIdsSet.has(numId)) {
        isAlreadyInRepo = true;
      }

      // Check 2: Problem Title match
      if (!isAlreadyInRepo && cleanTitleLower.length > 2) {
        if (existingTitlesSet.has(cleanTitleLower) || (slugClean && existingTitlesSet.has(slugClean))) {
          isAlreadyInRepo = true;
        }
      }

      // Check 3: Substring check across all existing repository file paths
      if (!isAlreadyInRepo && existingRepoPaths.length > 0) {
        isAlreadyInRepo = existingRepoPaths.some(p => {
          const pLower = p.toLowerCase();
          if (cleanTitleLower.length > 3 && pLower.includes(cleanTitleLower)) return true;
          if (slugClean.length > 3 && pLower.includes(slugClean)) return true;
          if (numId > 0 && (p.includes(`/${frontendId}. `) || p.startsWith(`${frontendId}. `) || p.includes(`/${numId}. `))) {
            return true;
          }
          return false;
        });
      }

      return {
        frontendId,
        title,
        titleSlug: item.titleSlug,
        difficulty,
        alreadyInRepo: isAlreadyInRepo,
        selected: !isAlreadyInRepo, // Automatically select NEW ones, uncheck existing!
        status: isAlreadyInRepo ? "In Repo" : "Ready"
      };
    });

    renderProblemsTable();
    problemCard.style.display = "block";
    problemCard.scrollIntoView({ behavior: "smooth" });

  } catch (err) {
    console.error("Error fetching solved problems:", err);
    alert("Error fetching problems: " + err.message);
  } finally {
    fetchSubmissionsBtn.disabled = false;
    fetchSubmissionsBtn.innerHTML = "<span>🔍</span> Fetch Solved Problems from LeetCode";
  }
});

// Load the full LeetCode problem catalog (maps slug -> true ID and difficulty)
async function loadLeetCodeProblemCatalog() {
  if (allProblemCatalog.size > 0) return;
  try {
    const res = await fetch("https://leetcode.com/api/problems/all/", {
      credentials: "include"
    });
    if (res.ok) {
      const data = await res.json();
      for (const item of (data.stat_status_pairs || [])) {
        const slug = item.stat?.question__title_slug;
        if (slug) {
          allProblemCatalog.set(slug, {
            id: item.stat.frontend_question_id,
            title: item.stat.question__title,
            difficulty: item.difficulty?.level === 1 ? "Easy" : (item.difficulty?.level === 2 ? "Medium" : "Hard"),
            status: item.status // "ac" if solved!
          });
        }
      }
    }
  } catch (e) {
    console.warn("Could not load full problem catalog:", e);
  }
}

// Fetch solved problems using the authenticated problems endpoint + fallback
async function fetchUserSolvedProblems(limit) {
  let solved = [];

  // Method A: Check the catalog for items marked "ac" (Accepted) by the logged-in session
  if (allProblemCatalog.size > 0) {
    for (const [slug, info] of allProblemCatalog.entries()) {
      if (info.status === "ac") {
        solved.push({
          frontendId: info.id,
          title: info.title,
          titleSlug: slug,
          difficulty: info.difficulty
        });
      }
    }
  }

  // Method B: If Method A found items, return up to the requested limit
  if (solved.length > 0) {
    return solved.slice(0, limit);
  }

  // Method C: Fallback to recent AC submission list
  try {
    const res = await callLeetCodeGraphQL(`
      query recentAcSubmissions($username: String!, $limit: Int!) {
        recentAcSubmissionList(username: $username, limit: $limit) {
          id
          title
          titleSlug
        }
      }
    `, { username: currentUsername, limit: 20 });

    const subs = res?.data?.recentAcSubmissionList || [];
    const uniqueMap = new Map();

    for (const s of subs) {
      if (!uniqueMap.has(s.titleSlug)) {
        const catalogInfo = allProblemCatalog.get(s.titleSlug) || {};
        uniqueMap.set(s.titleSlug, {
          frontendId: catalogInfo.id || 0,
          title: catalogInfo.title || s.title,
          titleSlug: s.titleSlug,
          difficulty: catalogInfo.difficulty || "Medium"
        });
      }
    }
    return Array.from(uniqueMap.values());
  } catch (e) {
    return [];
  }
}

// Render problem rows with status badges
function renderProblemsTable() {
  problemsTableBody.innerHTML = "";
  const newCount = discoveredProblems.filter(p => !p.alreadyInRepo).length;
  const inRepoCount = discoveredProblems.filter(p => p.alreadyInRepo).length;

  problemCountLabel.textContent = `Discovered Problems (${discoveredProblems.length} total • ${newCount} new • ${inRepoCount} in repo)`;

  discoveredProblems.forEach((prob, idx) => {
    const tr = document.createElement("tr");

    const diffClass = `badge badge-${prob.difficulty.toLowerCase()}`;
    const statusBadge = prob.alreadyInRepo
      ? `<span class="badge badge-repo">✓ In Repo</span>`
      : `<span class="badge badge-new">✨ New</span>`;

    tr.innerHTML = `
      <td><input type="checkbox" data-idx="${idx}" class="problem-check" ${prob.selected ? 'checked' : ''} /></td>
      <td><strong>${prob.frontendId}</strong></td>
      <td>${prob.title}</td>
      <td><span class="${diffClass}">${prob.difficulty}</span></td>
      <td><span class="badge badge-lang" id="lang-tag-${idx}">Auto-detect</span></td>
      <td id="status-col-${idx}">${statusBadge}</td>
    `;
    problemsTableBody.appendChild(tr);
  });

  // Attach checkbox listeners
  document.querySelectorAll(".problem-check").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      discoveredProblems[idx].selected = e.target.checked;
    });
  });
}

// Select New Only button
if (selectNewOnlyBtn) {
  selectNewOnlyBtn.addEventListener("click", () => {
    discoveredProblems.forEach(p => p.selected = !p.alreadyInRepo);
    document.querySelectorAll(".problem-check").forEach(chk => {
      const idx = parseInt(chk.dataset.idx, 10);
      chk.checked = !discoveredProblems[idx].alreadyInRepo;
    });
  });
}

// Select/Deselect All
masterCheck.addEventListener("change", (e) => {
  const isChecked = e.target.checked;
  discoveredProblems.forEach(p => p.selected = isChecked);
  document.querySelectorAll(".problem-check").forEach(chk => chk.checked = isChecked);
});

selectAllBtn.addEventListener("click", () => {
  masterCheck.checked = true;
  discoveredProblems.forEach(p => p.selected = true);
  document.querySelectorAll(".problem-check").forEach(chk => chk.checked = true);
});

deselectAllBtn.addEventListener("click", () => {
  masterCheck.checked = false;
  discoveredProblems.forEach(p => p.selected = false);
  document.querySelectorAll(".problem-check").forEach(chk => chk.checked = false);
});

// 3. Start Bulk Sync Execution
startSyncBtn.addEventListener("click", async () => {
  const selectedItems = discoveredProblems.filter(p => p.selected);
  if (selectedItems.length === 0) {
    alert("Please select at least one problem to sync.");
    return;
  }

  const delayMs = parseInt(delaySelect.value, 10) || 2000;
  const includeReview = includeAiReviewCheck.checked;

  isSyncRunning = true;
  shouldStopSync = false;

  startSyncBtn.style.display = "none";
  cancelSyncBtn.style.display = "inline-flex";
  progressBox.style.display = "block";
  logConsole.style.display = "block";
  logConsole.innerHTML = "";

  addLog(`Starting sync for ${selectedItems.length} problem(s)...`, "info");

  let completedCount = 0;
  const batchFilesMap = new Map(); // path -> content
  const processedProblems = [];

  for (let i = 0; i < selectedItems.length; i++) {
    if (shouldStopSync) {
      addLog("Sync paused by user.", "warn");
      break;
    }

    const prob = selectedItems[i];
    const originalIdx = discoveredProblems.indexOf(prob);
    const statusCol = document.getElementById(`status-col-${originalIdx}`);
    const langTag = document.getElementById(`lang-tag-${originalIdx}`);

    updateProgress(i + 1, selectedItems.length, `${prob.frontendId}. ${prob.title}`);
    if (statusCol) statusCol.innerHTML = "<span style='color: #4f46e5; font-size: 12px;'>Fetching...</span>";

    try {
      // 1. Fetch Problem Description & Accepted Submissions for this question
      const [descRes, subsList] = await Promise.all([
        callLeetCodeGraphQL(`
          query questionContent($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
              content
            }
          }
        `, { titleSlug: prob.titleSlug }),
        getAcceptedSubmissionsForProblem(prob.titleSlug)
      ]);

      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = descRes?.data?.question?.content || "";
      const cleanDescription = tempDiv.innerText.trim();

      if (subsList.length === 0) {
        addLog(`No accepted code found for ${prob.titleSlug}`, "warn");
        if (statusCol) statusCol.innerHTML = "<span style='color: #eab308; font-size: 12px;'>⚠️ No code</span>";
        continue;
      }

      const langsFound = [];
      let problemReadmeContent = "";
      let problemReadmePath = "";

      // 2. Prepare each language submission (e.g. C++ and Python) and combined README
      for (const sub of subsList) {
        if (shouldStopSync) break;

        // Fetch exact source code
        const codeRes = await callLeetCodeGraphQL(`
          query SubmissionDetails($submissionId: Int!) {
            submissionDetails(submissionId: $submissionId) {
              code
              lang {
                name
                verboseName
              }
            }
          }
        `, { submissionId: parseInt(sub.id, 10) });

        const details = codeRes?.data?.submissionDetails;
        const codeText = details?.code || "";
        const langName = details?.lang?.name || sub.lang || "code";

        if (!codeText) {
          addLog(`Skipped empty code for ${prob.title} (${langName})`, "warn");
          continue;
        }

        // Format code & merge README with background helper
        const prep = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: "prepareProblemFiles",
            title: prob.title,
            questionNumber: prob.frontendId,
            code: codeText,
            questionBody: cleanDescription,
            folder: prob.difficulty,
            language: langName,
            url: `https://leetcode.com/problems/${prob.titleSlug}/`,
            includeReview: includeReview,
            existingReadme: problemReadmeContent
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!response || !response.success) {
              reject(new Error(response?.error || "Preparation failed"));
            } else {
              resolve(response);
            }
          });
        });

        // Add code file to 1-commit batch
        batchFilesMap.set(prep.codeFilePath, prep.codeContent);
        problemReadmeContent = prep.readmeContent;
        problemReadmePath = prep.readmeFilePath;
        langsFound.push(prep.langDisplayName);

        addLog(`[${i + 1}/${selectedItems.length}] Prepared: ${prep.codeFilePath}`, "info");
      }

      // Add combined README for this problem to 1-commit batch
      if (problemReadmePath && problemReadmeContent) {
        batchFilesMap.set(problemReadmePath, problemReadmeContent);
      }

      if (langTag && langsFound.length > 0) {
        langTag.textContent = langsFound.join(", ");
      }

      if (statusCol) statusCol.innerHTML = "<span style='color: #2563eb; font-weight: 600; font-size: 12px;'>📦 Queued (1-Commit)</span>";
      processedProblems.push({
        prob,
        originalIdx,
        langs: langsFound
      });
      completedCount++;

    } catch (err) {
      addLog(`[${i + 1}/${selectedItems.length}] Error syncing ${prob.title}: ${err.message}`, "error");
      if (statusCol) statusCol.innerHTML = "<span style='color: #dc2626; font-size: 12px;'>❌ Failed</span>";
      if (err.message.includes("RATE LIMIT") || err.message.includes("CLOUDFLARE")) {
        shouldStopSync = true;
        break;
      }
    }

    // Cloudflare-safe pacing delay with randomized human jitter
    if (i < selectedItems.length - 1 && !shouldStopSync) {
      const jitter = Math.floor(Math.random() * 800);
      await sleep(delayMs + jitter);
    }
  }

  // 3. Commit ALL prepared problems to GitHub in ONE SINGLE COMMIT!
  if (batchFilesMap.size > 0) {
    progressText.textContent = `Pushing ${batchFilesMap.size} files in 1 single commit to GitHub...`;
    progressPercent.textContent = `Saving...`;
    addLog(`🚀 Committing ${batchFilesMap.size} file(s) across ${processedProblems.length} problem(s) in ONE SINGLE COMMIT...`, "info");

    const filesArray = Array.from(batchFilesMap.entries()).map(([path, content]) => ({ path, content }));
    const summaryLines = processedProblems.slice(0, 40).map(p => `- ${p.prob.difficulty}/${p.prob.frontendId}. ${p.prob.title} (${p.langs.join(', ')})`);
    const moreCount = processedProblems.length - summaryLines.length;
    const commitMessage = `Bulk upload ${processedProblems.length} LeetCode solutions (${filesArray.length} files)\n\n${summaryLines.join('\n')}${moreCount > 0 ? `\n...and ${moreCount} more` : ''}\n\nAutomated via LeetCode Solution Uploader`;

    try {
      const commitRes = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: "commitBatch",
          files: filesArray,
          commitMessage: commitMessage
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response || !response.success) {
            reject(new Error(response?.error || "Commit failed"));
          } else {
            resolve(response);
          }
        });
      });

      addLog(`🎉 SUCCESS! Pushed all files in 1 SINGLE COMMIT: ${commitRes.commitSha.substring(0, 7)}`, "success");
      addLog(`🔗 Commit: ${commitRes.commitUrl}`, "success");

      // Update all processed rows to Synced
      for (const p of processedProblems) {
        const col = document.getElementById(`status-col-${p.originalIdx}`);
        if (col) col.innerHTML = "<span style='color: #16a34a; font-weight: 600; font-size: 12px;'>✅ Synced</span>";
      }

      progressSubtext.textContent = `Completed! ${processedProblems.length} problems (${filesArray.length} files) uploaded in 1 single commit.`;
      addLog(`🎉 Bulk sync finished! 1 single commit created with ${filesArray.length} files across ${processedProblems.length} problems.`, "success");

    } catch (commitErr) {
      addLog(`❌ Commit error: ${commitErr.message}`, "error");
      alert(`GitHub Commit Error: ${commitErr.message}`);
    }
  } else {
    progressSubtext.textContent = `Completed ${completedCount} of ${selectedItems.length} problems.`;
    addLog(`Bulk sync finished. No files were committed.`, "warn");
  }

  isSyncRunning = false;
  startSyncBtn.style.display = "inline-flex";
  cancelSyncBtn.style.display = "none";
});

// Cancel sync button
cancelSyncBtn.addEventListener("click", () => {
  shouldStopSync = true;
  cancelSyncBtn.disabled = true;
  cancelSyncBtn.textContent = "Stopping...";
});

// Fetch accepted submissions for a specific question slug
async function getAcceptedSubmissionsForProblem(titleSlug) {
  try {
    const res = await callLeetCodeGraphQL(`
      query Submissions($offset: Int!, $limit: Int!, $questionSlug: String!) {
        submissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
          submissions {
            id
            statusDisplay
            lang
          }
        }
      }
    `, {
      offset: 0,
      limit: 15,
      questionSlug: titleSlug
    });

    const subs = res?.data?.submissionList?.submissions || [];
    const acSubs = subs.filter(s => s.statusDisplay === "Accepted");

    // Take newest submission for each unique language (e.g. C++, Python)
    const uniqueByLang = new Map();
    for (const s of acSubs) {
      if (!uniqueByLang.has(s.lang)) {
        uniqueByLang.set(s.lang, s);
      }
    }
    return Array.from(uniqueByLang.values());
  } catch (e) {
    console.warn(`Could not fetch submissions for ${titleSlug}:`, e);
    return [];
  }
}

function updateProgress(current, total, title) {
  const percent = Math.round((current / total) * 100);
  progressText.textContent = `Syncing (${current}/${total}): ${title}`;
  progressPercent.textContent = `${percent}%`;
  progressBarFill.style.width = `${percent}%`;
}

function addLog(msg, type = "info") {
  const div = document.createElement("div");
  const time = new Date().toLocaleTimeString();
  div.className = `log-entry log-${type}`;
  div.textContent = `[${time}] ${msg}`;
  logConsole.appendChild(div);
  logConsole.scrollTop = logConsole.scrollHeight;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getExistingRepoPaths(token, repo, branch) {
  if (!token) {
    console.warn("getExistingRepoPaths: GitHub token is not configured.");
    return [];
  }
  if (!repo) {
    console.warn("getExistingRepoPaths: GitHub repo is not configured.");
    return [];
  }

  const branchesToTry = [];
  if (branch && branch.trim()) branchesToTry.push(branch.trim());
  if (!branchesToTry.includes("main")) branchesToTry.push("main");
  if (!branchesToTry.includes("master")) branchesToTry.push("master");

  for (const b of branchesToTry) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${b}?recursive=1`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (res.ok) {
        const data = await res.json();
        const paths = (data.tree || []).map(item => item.path);
        console.log(`Fetched GitHub repository tree '${repo}' (${b}): ${paths.length} file path(s) found.`);
        return paths;
      }
    } catch (e) {
      console.warn(`Could not check repo tree on branch ${b}:`, e);
    }
  }

  // Fallback: Query repo info to detect default_branch directly
  try {
    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
    if (repoRes.ok) {
      const repoInfo = await repoRes.json();
      const defBranch = repoInfo.default_branch;
      if (defBranch && !branchesToTry.includes(defBranch)) {
        const res = await fetch(`https://api.github.com/repos/${repo}/git/trees/${defBranch}?recursive=1`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
          }
        });
        if (res.ok) {
          const data = await res.json();
          return (data.tree || []).map(item => item.path);
        }
      }
    }
  } catch (e) {
    console.warn("Could not query repo default branch:", e);
  }

  return [];
}

async function getLeetCodeCsrfToken() {
  return new Promise((resolve) => {
    if (!chrome.cookies || !chrome.cookies.get) {
      resolve("");
      return;
    }
    chrome.cookies.get({ url: "https://leetcode.com", name: "csrftoken" }, (cookie) => {
      resolve(cookie ? cookie.value : "");
    });
  });
}

async function callLeetCodeGraphQL(query, variables = {}) {
  const csrfToken = await getLeetCodeCsrfToken();
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  if (csrfToken) {
    headers["x-csrftoken"] = csrfToken;
  }

  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ query, variables })
  });

  if (res.status === 429 || res.status === 403) {
    shouldStopSync = true;
    const msg = res.status === 429 
      ? "🚨 RATE LIMIT DETECTED (HTTP 429): Halting immediately to protect your account. Please wait a few minutes before trying again."
      : "🚨 CLOUDFLARE CHALLENGE DETECTED (HTTP 403): Halting immediately. Please solve any captcha on leetcode.com if prompted.";
    addLog(msg, "error");
    throw new Error(msg);
  }

  if (!res.ok) {
    throw new Error(`LeetCode API HTTP ${res.status}`);
  }
  return await res.json();
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
