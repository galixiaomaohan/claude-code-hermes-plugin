<!--
  Hermes Plugin for Claude Code — Contribution Guidelines
  Purpose: Welcome contributors, define workflows, and establish quality standards.
  Last updated: 2026-04-14
-->

# Contributing to Hermes Plugin

First off: **thank you** for considering a contribution to the Hermes Plugin project.

Whether you are here to fix a bug, add a feature, improve documentation, translate content, write tests, or share feedback, you are welcome. This project thrives because of the community around it.

## Our Community Covenant

- **Be kind.** Assume good intent in every interaction.
- **Be respectful.** Constructive criticism is welcome; personal attacks are not.
- **Be clear.** When reporting bugs or requesting features, precise details save everyone time.

## Before You Start

1. **Read the docs.**
   - [`doc/README.md`](./README.md) — Project overview and quickstart.
   - [`HERMES_PLUGIN_INSTALL_UNINSTALL_GUIDE.md`](../HERMES_PLUGIN_INSTALL_UNINSTALL_GUIDE.md) — Full installation and troubleshooting guide.

2. **Verify your environment.**
   - Node.js >= 18.0.0
   - Claude Code CLI (`claude`) in your `PATH`
   - At least one of `npm`, `bun`, `pnpm`, or `yarn`

3. **Validate the install flow on at least one platform** (Linux or Windows 11) before submitting changes that touch `install.js` or `uninstall.js`. The macOS distribution is structurally consistent with the others, but **the project maintainer does not have access to a Mac and therefore cannot confirm on-device behavior**.

## How to Report an Issue

### Bug Reports

Please open a GitHub Issue and include the following:

- **Clear title** summarizing the bug.
- **Reproduction steps** — number them 1, 2, 3…
- **Expected behavior** — what you thought would happen.
- **Actual behavior** — what actually happened, including error messages or stack traces.
- **Environment** — OS, Node.js version, Claude Code CLI version, package manager, and plugin platform directory (`linux`, `macos`, or `win11`).

### Feature Requests

- Describe the **problem** you are trying to solve.
- Explain the **proposed solution** and why it benefits the project.
- Mention any **alternatives** you have considered.
- If applicable, note which platforms the feature should target.

### Security Vulnerabilities

**Do not open a public Issue.**

Email the maintainers directly with:

- A description of the vulnerability.
- Steps to reproduce (if safe to share).
- Your proposed mitigation or patch (optional).

We will acknowledge receipt within 48 hours and aim to provide a resolution timeline within 7 days.

## Development Workflow

```bash
# 1. Fork the repository on GitHub, then clone your fork.
git clone https://github.com/<your-username>/hermes-plugin.git
cd hermes-plugin

# 2. Pick a platform directory to work in (they are structurally identical).
cd hermes_plugin_linux

# 3. Install dependencies.
npm install

# 4. Type-check and build.
npm run typecheck
npm run build

# 5. Run tests.
npm run test

# 6. Install the plugin locally to verify behavior.
npm run install:plugin
```

### Cross-Platform Compatibility

The `install.js` and `uninstall.js` scripts are shared across all three platform directories. If you modify them, **you should test on as many platforms as you have access to** before opening a Pull Request. Please note that **macOS on-device validation is currently unavailable to the maintainer**, so contributions that verify or improve macOS behavior are especially welcome.

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Use when… |
|--------|-----------|
| `feat:` | Adding a new feature or command |
| `fix:`  | Fixing a bug |
| `docs:` | Changing documentation only |
| `test:` | Adding or updating tests |
| `chore:`| Maintenance, tooling, or dependency updates |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |

Example:

```
feat: add platform detection to install.js

- Detects WSL vs native Linux
- Falls back to npm if bun is present but fails
```

### Branch Strategy

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature-name
   ```
2. Make focused, atomic commits.
3. Push to your fork and open a Pull Request against `main`.
4. Ensure `npm run typecheck` and `npm run build` pass before requesting review.

## Code Style and Quality

- **TypeScript strict mode** is enforced. Do not introduce `any` without justification.
- **Source changes require tests.** If you modify `src/`, add or update the corresponding test in `tests/`.
- **New commands or hooks** must be reflected in `commands/` or `hooks/` and registered in `src/index.ts`.
- **No hardcoded secrets.** Use environment variables or configuration files for API keys and paths.
- **Platform-aware paths.** Use `path.join` and `path.resolve`; avoid hardcoding Unix-style separators in shared logic.

## Maintainer Promise

We commit to the following:

- **Initial response** to Issues and Pull Requests within **7 business days**.
- **Transparent triage.** Every Issue will receive a label (`bug`, `enhancement`, `question`, `duplicate`, `wontfix`, etc.) and a clear status update.
- **Community-driven decisions.** For architectural changes or breaking modifications, we will open a GitHub Discussion to collect community input before merging.

## Contributors

<p align="center">
  <a href="https://contrib.rocks/image?repo=your-org/hermes-plugin">
    <img src="https://contrib.rocks/image?repo=your-org/hermes-plugin" alt="Contributors" />
  </a>
</p>

*Replace `your-org/hermes-plugin` with the actual repository path once published.*

Thank you for helping make Hermes Plugin better for everyone.
