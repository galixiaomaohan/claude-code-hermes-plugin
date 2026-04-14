<!--
  Hermes Plugin for Claude Code — Public Project README
  Purpose: Primary entrypoint for GitHub visitors and potential contributors.
  Last updated: 2026-04-14
-->

# Hermes Plugin for Claude Code

<p align="center">
  <em>Embed the full Hermes self-learning engine into Claude Code — across Linux, macOS, and Windows 11.</em>
</p>

<p align="center">
  <strong>Notice:</strong> macOS compatibility is inferred from code structure only — the author does not have access to a Mac and has not performed on-device validation.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Linux-compatible-2ea44f?logo=linux&logoColor=white" alt="Linux" />
  <img src="https://img.shields.io/badge/macOS-compatible-2ea44f?logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows%2011-compatible-2ea44f?logo=windows&logoColor=white" alt="Windows 11" />
  <img src="https://img.shields.io/badge/Node.js-%3E%3D%2018-339933?logo=nodedotjs&logoColor=white" alt="Node.js >= 18" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" />
</p>

---

## What & Why

**Hermes Plugin** is a native Claude Code plugin that embeds the complete Hermes self-learning stack — Skills Hub, Auto-Skill Creation, Skill Optimization, Memory Search, Context Compression, Trajectory Logging, and real-time Status monitoring — directly into your local Claude Code CLI workflow. All self-learning capabilities are derived from the upstream **hermes-agent** project.

It solves the cross-platform deployment gap: instead of manually configuring Hermes modules for every OS, you download the pre-structured distribution for your platform, run `node install.js`, and restart Claude Code. Everything is wired, built, and ready.

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph User["Claude Code CLI"]
        CC["Claude Code"]
    end

    subgraph Plugin["Hermes Plugin"]
        CMD["Slash Commands<br/>(/hermes:*)"]
        SRC["TypeScript Core<br/>(src/)"]
    end

    subgraph Hermes["Hermes Self-Learning Engine"]
        SH["Skills Hub"]
        ASC["Auto-Skill Creation"]
        SO["Skill Optimization"]
        MEM["Memory Engine"]
        CTX["Context Compression"]
        TRAJ["Trajectory Logger"]
    end

    subgraph Local["Local Persistence"]
        DB[(SQLite / better-sqlite3)]
        FS["Filesystem<br/>(.claude/skills)"]
    end

    CC -->|invokes| CMD
    CMD -->|routes to| SRC
    SRC --> SH
    SRC --> ASC
    SRC --> SO
    SRC --> MEM
    SRC --> CTX
    SRC --> TRAJ
    MEM -->|reads/writes| DB
    SH -->|installs into| FS
    ASC -->|writes into| FS
    SO -->|updates| FS
    TRAJ -->|writes| FS
```

---

## Quickstart

### For End Users (One-Click Install)

1. **Pick your platform directory**:
   - Linux → `hermes_plugin_linux/`
   - macOS → `hermes_plugin_macos/`
   - Windows 11 → `hermes_plugin_win11/`

2. **Install**:

```bash
cd hermes_plugin_linux
node install.js
```

3. **Restart Claude Code** and verify:

```
/plugin
```

You should see `hermes-plugin @ local` in the **Installed** tab.

### For Developers (Build from Source)

```bash
# Clone
git clone https://github.com/<your-org>/hermes-plugin.git
cd hermes-plugin/hermes_plugin_linux

# Install dependencies
npm install

# Type-check and build
npm run typecheck
npm run build

# Install into Claude Code
npm run install:plugin
```

---

## Directory Structure

This repository ships three identical-in-structure, platform-tuned distributions so you never have to guess which build works on your machine:

| Directory | Target Platform | Notes |
|-----------|-----------------|-------|
| `hermes_plugin_linux/` | Linux / Ubuntu / Debian / CentOS / WSL | Tested on Node.js 18+ with `npm` and `bun` |
| `hermes_plugin_macos/` | macOS (Intel & Apple Silicon) | Based on universal path design; **not validated on actual macOS hardware due to lack of access** |
| `hermes_plugin_win11/` | Windows 11 | PowerShell-compatible install scripts |

Each directory contains:

```
hermes_plugin_<platform>/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── commands/                 # Slash command definitions
├── hooks/
│   └── hooks.json            # Lifecycle hooks
├── src/                      # TypeScript source
│   ├── cli.ts
│   ├── index.ts
│   ├── commands/
│   ├── modules/              # Hermes core modules
│   ├── utils/
│   └── types.ts
├── tests/                    # Test suites
├── dist/                     # Compiled JavaScript
├── install.js                # One-click installer
├── uninstall.js              # Clean uninstaller
├── package.json
└── tsconfig.json
```

---

## Features

- **:globe_with_meridians: Cross-Platform Native** — Three ready-to-run distributions for Linux, macOS, and Windows 11.
- **:package: Skills Hub** (`/hermes:skills-hub`) — Browse, search, and install skills from the Hermes Skills Hub without leaving Claude Code.
- **:magic_wand: Auto-Skill Creation** (`/hermes:create-skill`) — Turn a recent conversation into a reusable skill automatically.
- **:chart_with_upwards_trend: Skill Optimization** (`/hermes:optimize-skill`) — Continuously improve existing skills based on real usage feedback.
- **:brain: Multi-Provider Memory** (`/hermes:memory-search`) — Search past sessions across built-in SQLite, mem0, or Honcho backends.
- **:compression: Context Intelligence** (`/hermes:compress-context`) — Compress long conversations while preserving tool-use context and key decisions.
- **:floppy_disk: Training Bridge** (`/hermes:log-trajectory`) — Log conversation trajectories to the Hermes training bridge for future model improvement.
- **:gear: Runtime Status** (`/hermes:status`) — Inspect the live state of every Hermes module in one command.
- **:lock: Safe Uninstall** — `uninstall.js` removes all plugin artifacts, marketplace entries, and local data cleanly.

---

## Command Reference

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | Run TypeScript compiler in no-emit mode to validate types. |
| `npm run build` | Compile `src/` into `dist/` using `tsc`. |
| `npm run test` | Execute the Node.js test runner against `dist/tests/*.js`. |
| `npm run install:plugin` | Run `install.js` to register the plugin with Claude Code CLI. |
| `npm run uninstall:plugin` | Run `uninstall.js` to remove the plugin and clean up artifacts. |
| `npm run dev` | Execute the compiled CLI directly (`node dist/src/cli.js`). |

---

## System Requirements

- **Node.js** >= 18.0.0
- **Claude Code CLI** (`claude`) available in your system `PATH`
- **Package manager**: `npm` (recommended), or `bun`, `pnpm`, `yarn`

---

## Acknowledgments

Hermes Plugin is built for and on top of [Claude Code](https://claude.ai/code) by Anthropic. The self-learning capabilities are derived from the upstream **hermes-agent** project. We thank the Anthropic team and the Hermes community for the platform and ideas that make this plugin possible.

---

<p align="center">
  <a href="./DISCLAIMER.md">Disclaimer</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a> ·
  <a href="./GITHUB_PUBLISH_GUIDE.md">Publish Guide</a>
</p>
