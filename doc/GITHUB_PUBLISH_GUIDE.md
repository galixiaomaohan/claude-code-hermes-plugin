<!--
  Hermes Plugin for Claude Code — GitHub Publish Guide
  Purpose: Step-by-step manual for maintainers to initialize, configure,
           and publish this repository on GitHub safely and professionally.
  Last updated: 2026-04-14
-->

# GitHub Publish Guide

This document is for project maintainers. It covers repository initialization, sensitive-data hygiene, `.gitignore` strategy, and the exact commands needed to push the Hermes Plugin project to GitHub.

---

## 1. Pre-Flight Checklist

Before executing any `git` or `gh` commands, verify the following:

### 1.1 Remove Sensitive Files

Search the working tree for files that must **never** be committed:

```bash
# Common sensitive patterns
grep -rI "sk-ant-api" . 2>/dev/null
grep -rI "sk-" . --include="*.env" --include="*.json" --include="*.js" --include="*.ts" 2>/dev/null

# Look for local databases or logs
find . -name "*.db" -o -name "*.sqlite" -o -name "*.log" -o -name ".env" -o -name ".env.local"
```

**If found, remove them from the working tree and from Git history (if previously committed) before proceeding.**

### 1.2 Verify or Create `.gitignore`

Ensure a `.gitignore` exists at the repository root with at least the following entries:

```gitignore
# Dependencies
node_modules/

# Build output (decide per strategy; see below)
dist/

# Environment and secrets
.env
.env.local
.env.*.local

# Claude local config
.claude/
.claude-local/

# OS files
.DS_Store
Thumbs.db

# Editor files
.idea/
.vscode/
*.swp
*.swo

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Precompiled binaries (platform-specific)
**/*.node
```

#### Decision: Should `dist/` be ignored?

- **Ignore `dist/`** if you want users to build from source. This is the standard open-source practice and keeps diffs clean.
- **Track `dist/`** only if you want the repository to be immediately installable without a build step. If you choose this path, ensure you rebuild and commit `dist/` on every source change.

**Recommendation:** Ignore `dist/` in Git, but include it in the `hermes_plugins.zip` release asset (see Section 4).

### 1.3 Verify the MIT License

Check that a `LICENSE` file exists at the repository root:

```bash
ls LICENSE
```

If missing, create it:

```bash
cat <<'EOF' > LICENSE
MIT License

Copyright (c) 2026 Hermes Plugin Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
```

---

## 2. Create the GitHub Repository

### Option A: Command Line (Recommended)

Ensure the [GitHub CLI (`gh`)](https://cli.github.com/) is installed and authenticated:

```bash
gh auth status
```

#### Create a Public Repository

```bash
gh repo create hermes-plugin \
  --public \
  --description "Claude Code plugin embedding the full Hermes self-learning engine" \
  --homepage "https://github.com/your-org/hermes-plugin" \
  --source=. \
  --remote=origin \
  --push
```

#### Create a Private Repository

```bash
gh repo create hermes-plugin \
  --private \
  --description "Claude Code plugin embedding the full Hermes self-learning engine" \
  --source=. \
  --remote=origin \
  --push
```

### Option B: Web UI

1. Go to [https://github.com/new](https://github.com/new).
2. Enter **Repository name**: `hermes-plugin`.
3. Select **Public** or **Private**.
4. Optionally add a description and initialize **without** a README (we already have one in `doc/`).
5. Click **Create repository**.
6. Copy the remote URL shown on the next page for use in Section 3.

---

## 3. Initialize Locally and Push

Run these commands from the **repository root** (`/home/zhou/claude_work` or equivalent):

```bash
# 1. Initialize git
git init

# 2. Add files (respects .gitignore)
git add .

# 3. Review what is about to be committed
git status
```

### Critical Review Step

Inspect `git status` carefully. You should **not** see:

- `node_modules/`
- `.env` or `.env.local`
- `.claude/` (local user configs)
- `*.db`, `*.sqlite`
- Large `.node` precompiled binaries inside `node_modules/`

If any of these appear, fix `.gitignore` and run `git rm --cached -r <file-or-dir>` before continuing.

### Commit and Push

```bash
# 4. First commit
git commit -m "Initial commit: Hermes Plugin for Claude Code

- Cross-platform distributions for Linux, macOS, and Windows 11
- Full Hermes self-learning stack: Skills Hub, Auto-Skill, Optimization,
  Memory, Context Compression, Trajectory Logging, and Status
- Install/uninstall scripts, TypeScript source, tests, and documentation"

# 5. Add remote (only if you used Web UI; gh CLI does this automatically)
git remote add origin https://github.com/your-org/hermes-plugin.git

# 6. Rename branch to main (if not already)
git branch -M main

# 7. Push to GitHub
git push -u origin main
```

### Large-File Warning

The file `hermes_plugins.zip` (≈ 59 MB) may exist in the repository root. GitHub has a **100 MB per-file hard limit**, and files over ~50 MB trigger warnings. This repository is currently under that limit, but if the zip grows:

- **Preferred:** Do **not** track `hermes_plugins.zip` in Git. Instead, upload it as a **GitHub Release asset** (see Section 4).
- If you choose to track it, ensure it stays under 100 MB.

---

## 4. Release Strategy

### Recommended Approach

1. **Source on GitHub**: Push only source code, documentation, and platform directories (excluding `node_modules/` and optionally `dist/`).
2. **Binary / Bundle on Releases**: Attach `hermes_plugins.zip` to a GitHub Release so end users can download the complete, ready-to-install bundle without cloning the entire repository.

### Create a Release with `gh`

```bash
# Ensure you are on main and the working tree is clean
git checkout main
git status

# Create an annotated tag
git tag -a v1.0.0 -m "Release v1.0.0 — Hermes Plugin for Claude Code"

# Push the tag
git push origin v1.0.0

# Create the release and attach the zip
gh release create v1.0.0 \
  --title "Hermes Plugin v1.0.0" \
  --notes "Initial stable release.

### Included
- Linux, macOS, and Windows 11 distributions
- Full Hermes self-learning module integration
- One-click install/uninstall scripts
- Complete documentation and contribution guidelines

### Assets
- `hermes_plugins.zip` — Pre-built distributions for all platforms." \
  hermes_plugins.zip
```

After running the above, the release will appear at:

```
https://github.com/your-org/hermes-plugin/releases/tag/v1.0.0
```

---

## 5. Ongoing Maintenance Workflow

### Daily Development

```bash
# Pull latest changes
git pull origin main

# Create a feature branch
git checkout -b feat/description

# Work, commit, push
git add .
git commit -m "feat: concise description"
git push -u origin feat/description

# Open a Pull Request via GitHub CLI
gh pr create --title "feat: description" --body "## Summary\n..."
```

### PR Merge Rules

- Require `npm run typecheck` and `npm run build` to pass.
- For changes to `install.js` or `uninstall.js`, require validation on every platform the contributor has access to. Because the maintainer does not have a Mac, macOS-specific fixes should be explicitly labeled in the PR description.
- Squash-merge if the branch contains many small or WIP commits.

### Issue and Label Hygiene

Maintain a minimal but clear label set:

| Label | Meaning |
|-------|---------|
| `bug` | Something is broken |
| `enhancement` | New feature or improvement |
| `documentation` | Docs or README changes |
| `platform:linux` | Affects Linux distribution |
| `platform:macos` | Affects macOS distribution |
| `platform:win11` | Affects Windows 11 distribution |
| `good first issue` | Welcoming to new contributors |
| `help wanted` | Needs community input |

---

## 6. Troubleshooting First Push

### Authentication Failure

- **HTTPS**: Ensure your GitHub Personal Access Token (PAT) is used instead of your password. Or switch to SSH.
- **SSH**: Verify your key is added to the SSH agent:
  ```bash
  ssh-add -l
  ssh -T git@github.com
  ```

### Push Rejected (non-fast-forward)

```bash
# If the remote has commits you don't have locally
git pull --rebase origin main
git push origin main
```

### Large File Rejection

If GitHub rejects the push with a large-file error:

1. Identify the file:
   ```bash
   git rev-list --objects --all | grep "$(git verify-pack -v .git/objects/pack/*.idx | sort -k3 -n | tail -5 | awk '{print$1}')"
   ```
2. Remove it from history using [git-filter-repo](https://github.com/newren/git-filter-repo) or BFG Repo-Cleaner.
3. Do **not** simply `git rm` — that leaves the blob in history.

---

## 7. Post-Publish Checklist

- [ ] Repository is visible on GitHub with correct name and description.
- [ ] `LICENSE` file is rendered in the right sidebar.
- [ ] `doc/README.md` content is readable and badges resolve correctly.
- [ ] First Release (`v1.0.0`) includes `hermes_plugins.zip`.
- [ ] At least one Issue template or Discussions category is enabled.
- [ ] `contrib.rocks` image URL in `CONTRIBUTING.md` is updated to the real repo path.

**Congratulations — the Hermes Plugin is now live on GitHub.**
