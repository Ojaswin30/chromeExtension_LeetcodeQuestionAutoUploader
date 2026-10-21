# 🚀 LeetCode Solution Uploader (v2.0)

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-yellow.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![GitHub API](https://img.shields.io/badge/GitHub-REST%20%26%20Git%20Database%20API-blue.svg)](https://docs.github.com/rest)
[![Groq AI](https://img.shields.io/badge/AI-Groq%20(gpt--oss--120b)-orange.svg)](https://console.groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A high-performance Chrome Extension (Manifest V3) that automatically captures your LeetCode solutions, performs automated AI code reviews (via **Groq**, **OpenAI**, or **local Ollama**), and cleanly synchronizes everything directly to your GitHub repository in an organized multi-language directory hierarchy.

Now features an **Atomic 1-Commit Bulk Sync Tool** to archive your entire LeetCode solved history without cluttering your Git repository history or triggering Cloudflare blocks.

---

## 🌟 Key Features

### ⚡ Smart Single-Problem Upload (Extension Popup)
- **Direct Monaco Editor Extraction**: Uses a dedicated main-world injector script to extract exact code directly from LeetCode’s virtualized Monaco Editor models without DOM clipping or line truncation.
- **Auto Metadata Detection**: Detects frontend problem IDs, problem title, difficulty level (`Easy`, `Medium`, `Hard`), and programming language.
- **Live Path Preview**: Previews the exact repository target path before committing (`📁 Target: Easy/0001. Two Sum/cpp_Two Sum.cpp + README.md`).
- **Quick Setup Card**: Enter your GitHub Personal Access Token directly inside the popup for instant zero-configuration uploads.

### 📦 Atomic 1-Commit Bulk Sync Dashboard
- **1 Single Atomic Commit**: Commits all 20, 50, 100, or 200+ solved problems and their READMEs in **one single Git commit** using GitHub's Git Database Trees API (`/git/trees` & `/git/commits`). Keeps your repository commit history 100% clean.
- **True Problem IDs & Difficulties**: Direct integration with the LeetCode REST catalog (`https://leetcode.com/api/problems/all/`) ensures zero-padded 4-digit problem numbers (`0001`, `0584`) and real difficulty tags instead of placeholders.
- **Anti-Bot & Cloudflare Protection**:
  - Pacing guardrails with **2.0s human-like jitter delays** between requests.
  - Passes real browser session cookies (`credentials: "include"`) and active `x-csrftoken` security headers to bypass Cloudflare 403 / CSRF blocks.
  - Emergency circuit breaker halting sync immediately if HTTP 429 / 403 occurs.
- **3-Way In-Repo Problem Detection**:
  - Queries your GitHub repository tree and indexes existing problem numbers, titles, and paths.
  - Marks previously synced problems as `✓ In Repo` (automatically unchecked) and new questions as `✨ New` (checked).
  - Includes a one-click **"✨ Select New Only"** filter button.

### 🤖 Ultra-Fast AI Code Reviews
- **Powered by Groq**: Sub-second code reviews using ultra-fast large language models (default: `openai/gpt-oss-120b`).
- **Multi-Provider Support**: Switch seamlessly between **Groq**, **OpenAI** (`gpt-4o-mini`), or **Local Ollama** (`mistral`).
- **Comprehensive Analysis**: Every review evaluates Big-O time and space complexity, approach quality, edge cases, and optimization potential.

### 📁 Multi-Language Solution Hierarchy
- Saves language-specific source files side-by-side (`cpp_Two Sum.cpp`, `python_Two Sum.py`).
- Non-destructively merges solutions from multiple languages into a single unified `README.md` per problem.

---

## 📂 Repository Directory Layout

Every solution is organized into zero-padded problem folders grouped by difficulty:

```
Your-LeetCode-Repo/
├── Easy/
│   ├── 0001. Two Sum/
│   │   ├── cpp_Two Sum.cpp             <-- C++ solution with header
│   │   ├── python_Two Sum.py           <-- Python solution with header
│   │   └── README.md                   <-- Problem description & merged AI reviews
│   └── 0584. Find Customer Referee/
│       ├── sql_Find Customer Referee.sql
│       └── README.md
├── Medium/
│   ├── 0003. Longest Substring Without Repeating Characters/
│   │   ├── cpp_Longest Substring Without Repeating Characters.cpp
│   │   └── README.md
│   └── 0015. 3Sum/
│       ├── cpp_3Sum.cpp
│       ├── python_3Sum.py
│       └── README.md
└── Hard/
    └── 0042. Trapping Rain Water/
        ├── cpp_Trapping Rain Water.cpp
        └── README.md
```

### Example Multi-Language `README.md` (`Easy/0001. Two Sum/README.md`)

````markdown
# 0001. Two Sum

- **Difficulty**: Easy
- **LeetCode Link**: [0001. Two Sum](https://leetcode.com/problems/two-sum/)

---

## 📖 Problem Description

Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`.
You may assume that each input would have exactly one solution, and you may not use the same element twice.

---

## 💻 Solutions

### C++

```cpp
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            int complement = target - nums[i];
            if (seen.count(complement)) return {seen[complement], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
```

#### 🤖 AI Code Review (Groq / gpt-oss-120b)

1. **Complexity Analysis**: Time complexity is O(N) single pass through the array. Space complexity is O(N) to store elements in the hash map.
2. **Approach & Quality**: Optimal single-pass hash map approach. Highly readable with correct container choices.
3. **Edge Cases**: Correctly handles negative numbers, duplicate values, and minimum length inputs.
4. **Optimizations**: This is the optimal time-space tradeoff for this problem.

---

### Python 3

```python
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, num in enumerate(nums):
            diff = target - num
            if diff in seen:
                return [seen[diff], i]
            seen[num] = i
        return []
```

#### 🤖 AI Code Review (Groq / gpt-oss-120b)

1. **Complexity Analysis**: Time complexity O(N), Space complexity O(N).
2. **Approach & Quality**: Idiomatic Python using `enumerate()`. Clean and concise.

---
*Automated solution upload via [LeetCode Solution Uploader](https://github.com/Ojaswin30/chromeExtension_QuestionAutoUploader)*
````

---

## 📥 Installation

### 1. Clone or Download the Repository
```bash
git clone https://github.com/Ojaswin30/chromeExtension_QuestionAutoUploader.git
```

### 2. Load the Extension in Google Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **"Load unpacked"**.
4. Select the `Extension` directory from this repository.

---

## ⚙️ Configuration

Open the extension settings by clicking the **Settings Gear (⚙️)** in the popup or right-clicking the extension icon and selecting **Options**.

1. **GitHub Configuration**:
   - **Personal Access Token**: Create a Classic PAT or Fine-Grained Token with `repo` permissions at [github.com/settings/tokens](https://github.com/settings/tokens).
   - **GitHub Repository**: Format: `username/repository-name` (e.g., `Ojaswin30/Leetcode`).
   - **Branch**: Target branch (default: `main` or leave empty for auto-detection).
   - Click **"Test GitHub Access"** to verify permissions with instant inline feedback.
2. **AI Code Review Configuration**:
   - **Provider**: Select **Groq** (recommended for speed), **OpenAI**, **Ollama**, or **None**.
   - **Groq API Key**: Obtain a free API key at [console.groq.com/keys](https://console.groq.com/keys).
   - Click **"Test AI Reviewer"** to verify connection.
3. Click **"Save Settings"**.

---

## 📖 Usage Guide

### Mode 1: Uploading a Solution Directly from LeetCode
1. Open any problem on [LeetCode](https://leetcode.com/problems/) (e.g., `https://leetcode.com/problems/two-sum/`).
2. Write and test your solution in LeetCode’s editor.
3. Click the **LeetCode Uploader** extension icon.
4. Review the auto-detected title, difficulty, language, and target path.
5. Click **"🚀 Upload Solution to GitHub"**.
6. Both the solution code file and `README.md` are committed together in **1 commit**. Click the link in the popup to view the commit on GitHub.

### Mode 2: Bulk Syncing Solved Problems
1. Open the **Bulk Sync Dashboard** by clicking **"📦 Open Bulk Sync Dashboard"** in the extension popup.
2. Ensure you are signed in to your account on [leetcode.com](https://leetcode.com).
3. Select how many submissions to fetch (`Latest 20`, `Latest 50`, `Latest 100`, or `All Solved Problems`).
4. Click **"🔍 Fetch Solved Problems from LeetCode"**:
   - Problems already present in your GitHub repository will be marked `✓ In Repo` (auto-deselected).
   - Unsynced problems will be marked `✨ New` (auto-selected).
5. Select or refine problems using **"✨ Select New Only"**, **"Select All"**, or individual checkboxes.
6. Click **"🚀 Start Bulk Upload (1 Single Commit)"**:
   - Files are prepared in memory with safety delays.
   - All files across all selected questions are committed to GitHub in **exactly 1 atomic commit**.

---

## 🛡️ Anti-Bot & Rate Limit Protection

| Feature | Description |
| :--- | :--- |
| **Pacing Delay + Jitter** | Configurable 2.0s delay with random 0–800ms human jitter between LeetCode API queries. |
| **CSRF Cookie Pass-Through** | Automatically reads `csrftoken` session cookie and attaches `x-csrftoken` header + `credentials: "include"`, avoiding Cloudflare 403 challenge blocks. |
| **Emergency Circuit Breaker** | Instantly halts synchronization upon receiving HTTP 429 (Rate Limit) or 403 (Challenge). |
| **1-Commit Tree Batching** | Uses GitHub Git Database Trees API, reducing 100 sequential PUT commits to 3 API calls total, eliminating GitHub secondary rate limit blocks. |

---

## 🏗️ Architecture & File Structure

```
chromeExtension_QuestionAutoUploader/
├── Extension/
│   ├── manifest.json       # Manifest V3 configuration with cookies & host permissions
│   ├── background.js       # Service worker: Git Database API, UTF-8 base64, Groq/OpenAI/Ollama review
│   ├── popup.html          # Browser action popup UI
│   ├── popup.js            # Main-world Monaco scraper, target path live preview, quick PAT card
│   ├── settings.html       # Options UI with dedicated inline status banners
│   ├── settings.js         # Settings dual-persistence (sync & local) and connection tests
│   ├── bulk-sync.html      # Bulk Sync Dashboard UI
│   ├── bulk-sync.js        # Bulk sync engine: problem catalog mapper, Git tree checker, 1-commit batcher
│   └── config.example.js   # Configuration reference template
├── .gitignore              # Ignores sensitive tokens and keys
└── README.md               # Project documentation
```

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.
