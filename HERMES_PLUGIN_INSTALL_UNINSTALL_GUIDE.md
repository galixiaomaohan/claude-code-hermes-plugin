# Hermes Plugin 安装与卸载完全指南

> 本文档对应已安全加固的 `hermes_plugin_all.zip` 解压版本，适用于以下三个分发版本：
> - `hermes_plugin_linux` — Linux/Ubuntu/Debian/CentOS 等
> - `hermes_plugin_macos` — macOS (Intel & Apple Silicon)
> - `hermes_plugin_win11` — Windows 11

---

## 目录

1. [前置要求](#前置要求)
2. [快速安装（三步完成）](#快速安装三步完成)
3. [Linux 详细安装](#linux-详细安装)
4. [macOS 详细安装](#macos-详细安装)
5. [Windows 11 详细安装](#windows-11-详细安装)
6. [安装验证](#安装验证)
7. [故障排查](#故障排查)
8. [卸载方法](#卸载方法)
9. [环境变量参考](#环境变量参考)

---

## 前置要求

| 需求项 | 最低版本 | 说明 |
|--------|----------|------|
| **Node.js** | ≥ 18.0.0 | 必须安装。插件核心逻辑基于 Node.js 运行。 |
| **Claude Code CLI** | 任意可用版本 | `claude` 命令必须可在系统 PATH 中直接调用。 |
| **包管理器** | `npm`（推荐） | 安装脚本优先使用 `npm`，也兼容 `bun`、`pnpm`、`yarn`。 |

### 1.1 检查 Node.js

**Linux / macOS:**
```bash
node --version
# 预期输出：v18.x.x 或更高
```

**Windows (PowerShell):**
```powershell
node --version
```

### 1.2 检查 Claude Code CLI

**Linux / macOS:**
```bash
claude --version
```

**Windows (PowerShell):**
```powershell
claude --version
```

如果提示命令未找到，请先安装 [Claude Code](https://claude.ai/code)，并确保其安装目录已添加到系统环境变量 `PATH` 中。

---

## 快速安装（三步完成）

### 第一步：选择对应系统的插件包

根据你的操作系统，进入对应的目录：

| 操作系统 | 进入的目录 |
|----------|------------|
| Linux | `hermes_plugin_linux/` |
| macOS | `hermes_plugin_macos/` |
| Windows 11 | `hermes_plugin_win11/` |

### 第二步：运行安装脚本

**Linux / macOS:**
```bash
cd /path/to/hermes_plugin_linux    # macOS 用户替换为 hermes_plugin_macos
node install.js
```

**Windows 11 (PowerShell / CMD):**
```powershell
cd C:\path\to\hermes_plugin_win11
node install.js
```

### 第三步：重启 Claude Code

安装完成后，**必须完全退出并重新启动 Claude Code**，插件才会生效。

---

## Linux 详细安装

### 2.1 进入插件目录

```bash
cd /path/to/hermes_plugin_linux
```

**路径包含空格或中文的处理方式：**
```bash
cd "/home/username/my projects/hermes_plugin_linux"
```

### 2.2 执行安装

```bash
node install.js
```

### 2.3 安装脚本内部流程

运行 `node install.js` 后，脚本会自动完成以下工作：

1. **注册本地市场**：创建/更新 `~/.claude/plugins/.claude-plugin/marketplace.json`，确保 Claude CLI 能发现本插件。
2. **原子复制**：将插件文件安全复制到临时目录，再原子移动到 `~/.claude/plugins/hermes-plugin`。
3. **依赖安装**：使用 `npm install --ignore-scripts` 安全安装依赖（禁止执行任意 postinstall 脚本）。
4. **原生模块重建**：针对 `better-sqlite3` 执行显式重建。
5. **TypeScript 编译**：自动执行 `npm run build`，将 `src/` 编译为 `dist/`。
6. **市场索引刷新**：执行 `claude plugin marketplace update local`。
7. **官方 CLI 安装**：执行 `claude plugin install hermes-plugin@local -s user`。
8. **失败回滚**：若任何步骤失败，自动清理临时文件和已复制的目录。

### 2.4 数据目录说明

- **默认数据目录**：`~/.local/share/hermes-plugin`（遵循 XDG Base Directory 规范）
- 如果显式设置了 `CLAUDE_CONFIG_DIR`，则数据存放在 `${CLAUDE_CONFIG_DIR}/plugins/data/hermes-plugin`
- 所有数据文件权限为 `0o600`，目录权限为 `0o700`

---

## macOS 详细安装

### 3.1 进入插件目录

打开 **Terminal.app** 或 **iTerm2**：

```bash
cd /path/to/hermes_plugin_macos
```

### 3.2 执行安装

```bash
node install.js
```

### 3.3 处理可能的编译问题

macOS 上如果 `better-sqlite3` 的预编译二进制与你的 Node.js 版本不匹配，安装脚本会自动触发本地编译。如果编译失败，可能需要安装 **Xcode Command Line Tools**：

```bash
xcode-select --install
```

安装完成后，**重新运行**：
```bash
node install.js
```

### 3.4 Gatekeeper 注意事项

如果你是通过下载 `.zip` 文件获取的插件，macOS 的 Gatekeeper 可能对某些文件进行隔离标记（quarantine）。建议：
- 将插件放置在常规开发目录下运行，例如 `~/Projects/hermes_plugin_macos`
- 避免直接从"下载"文件夹运行安装

### 3.5 Apple Silicon (M1/M2/M3) 兼容性

当前插件使用的 `better-sqlite3` 均提供 Apple Silicon 原生支持，无需 Rosetta 转译。

---

## Windows 11 详细安装

### 4.1 进入插件目录

打开 **PowerShell** 或 **命令提示符 (CMD)**：

```powershell
cd C:\path\to\hermes_plugin_win11
```

**路径包含空格的处理方式：**
```powershell
cd "C:\Users\User Name\Documents\hermes_plugin_win11"
```

### 4.2 执行安装

```powershell
node install.js
```

### 4.3 Windows 特有安全逻辑

- **无 `shell: true`**：安装脚本显式解析 `.exe`/`.cmd`/`.ps1` 路径，避免命令注入和 DLL 搜索劫持。
- **用户目录解析**：目标路径解析为 `%USERPROFILE%\.claude\plugins\hermes-plugin`，支持任意 Windows 用户名。
- **盘符支持**：插件可放置于任意盘符（如 `D:\`、`E:\`），安装脚本通过 `path.resolve()` 正确处理。

### 4.4 better-sqlite3 预编译二进制说明

Windows 上 `better-sqlite3` 通常会**自动下载**适用于当前 Node.js 版本的预编译 `.node` 文件。安装脚本会在 `--ignore-scripts` 安全安装后，显式触发 `npm rebuild better-sqlite3` 以确保二进制可用。

---

## 安装验证

完成安装并重启 Claude Code 后，请按顺序执行以下验证步骤：

### 验证 1：检查插件是否已加载

在 Claude Code 对话中输入：
```
/plugin
```

切换到 **Installed** 标签页，确认列表中有：
```
hermes-plugin @ local
```
且无红色错误提示。

### 验证 2：检查核心模块状态

输入：
```
/status
```

预期返回 Hermes 状态面板，显示：
- Project CWD
- Memory Provider: built-in
- Auto-Skill Creation: enabled / disabled
- 所有核心模块为 active

### 验证 3：直接运行 CLI 测试

**Linux / macOS:**
```bash
node ~/.claude/plugins/hermes-plugin/dist/src/cli.js hermes:status
```

**Windows:**
```powershell
node "$env:USERPROFILE\.claude\plugins\hermes-plugin\dist\src\cli.js" hermes:status
```

必须返回 `{"success":true,"prompt":...}` 格式的 JSON，不能报错。

---

## 故障排查

### 问题 1："No supported package manager found"

**原因**：系统中没有安装 `npm`、`bun`、`pnpm` 或 `yarn`。

**解决**：
1. 访问 [nodejs.org](https://nodejs.org) 下载并安装 Node.js LTS 版本（内置 `npm`）
2. 重新打开终端，再次运行 `node install.js`

---

### 问题 2："Claude CLI not found in PATH"

**原因**：Claude Code 未安装，或其安装目录未加入系统 PATH。

**解决**：
1. 确认 Claude Code 已安装并尝试运行 `claude --version`
2. 将 Claude Code 的安装目录添加到 PATH 环境变量中
3. 重新打开终端，再次运行 `node install.js`

---

### 问题 3："Plugin hermes-plugin not found in marketplace local"

**原因**：Claude CLI 无法发现本地市场中的插件（旧版本安装脚本缺少 marketplace manifest）。

**解决**：
- 使用当前已加固版本的 `install.js` 重新安装。脚本会自动创建 `.claude-plugin/marketplace.json` 并刷新市场索引。
- 若仍失败，可手动刷新市场后重试：
  ```bash
  claude plugin marketplace update local
  claude plugin install hermes-plugin@local -s user
  ```

---

### 问题 4："TypeScript build failed"

**原因**：`src/` 目录中的 TypeScript 源码存在编译错误。

**解决**：
1. 进入插件目录运行 `npx tsc` 查看具体错误
2. 修复错误后重新运行 `node install.js`

---

### 问题 5：安装成功但 `/plugin` 中看不到 hermes-plugin

**原因**：Claude Code 未重启。

**解决**：
1. **完全退出** Claude Code（不是最小化），然后重新打开
2. 再次输入 `/plugin` 检查

---

### 问题 6："Security validation failed: context path ... is outside allowed directories"

**原因**：`cli.ts` 检测到上下文文件路径不在允许的目录范围内（tmpdir、`~/.claude`、`~`、cwd）。

**解决**：
- 确保命令中传递的临时 JSON 上下文文件位于系统临时目录或用户主目录下。
- 使用安装脚本和命令模板中推荐的临时文件生成方式（`mktemp` 或 `[guid]::NewGuid()`）。

---

## 卸载方法

### 5.1 一键卸载（推荐）

进入插件目录，运行卸载脚本：

**Linux / macOS:**
```bash
cd /path/to/hermes_plugin_linux    # 或 hermes_plugin_macos
node uninstall.js
```

**Windows 11:**
```powershell
cd C:\path\to\hermes_plugin_win11
node uninstall.js
```

### 5.2 卸载脚本行为

1. 执行 `claude plugin uninstall hermes-plugin@local` 解除 CLI 注册。
2. 安全验证路径后，删除插件目录 `~/.claude/plugins/hermes-plugin`。
3. 删除插件数据目录：
   - **Linux / macOS**：`~/.local/share/hermes-plugin`（或 `${CLAUDE_CONFIG_DIR}/plugins/data/hermes-plugin`）
   - **Windows**：`%USERPROFILE%\.claude\plugins\data\hermes-plugin`（或对应覆盖路径）

### 5.3 手动卸载（备用）

如果 `uninstall.js` 无法运行，可直接执行：
```bash
claude plugin uninstall hermes-plugin@local
```

然后手动删除以下目录：
- 插件目录：`~/.claude/plugins/hermes-plugin`
- 数据目录：`~/.local/share/hermes-plugin`（Linux/macOS）或 `%USERPROFILE%\.claude\plugins\data\hermes-plugin`（Windows）

---

## 环境变量参考

| 变量 | 作用 | 示例 |
|------|------|------|
| `HERMES_ALLOW_SIDE_QUERY` | **必须设为 `true`**，才能启用任何需要调用外部 Anthropic API 的功能（如自动技能创建、上下文压缩、技能优化）。 | `true` |
| `HERMES_ALLOW_EXTERNAL_MEMORY` | **必须设为 `true`**，才能启用 `honcho` 或 `mem0` 外部记忆提供商。 | `true` |
| `HERMES_DATA_RETENTION_DAYS` | 本地数据自动保留天数，默认 `90`。设为 `0` 表示永久保留。 | `30` |
| `ANTHROPIC_API_KEY` | `sideQuery` 调用 Anthropic API 所需的 API Key。 | `sk-ant-...` |
| `HONCHO_API_KEY` | 使用 Honcho 记忆提供商时的 API Key。 | `...` |
| `MEM0_API_KEY` | 使用 Mem0 记忆提供商时的 API Key。 | `...` |
| `CLAUDE_HERMES_SKILL_MODEL` | 覆盖技能相关 LLM 调用的默认模型。 | `claude-sonnet-4-6` |
| `CLAUDE_HERMES_COMPRESSOR_MODEL` | 覆盖上下文压缩 LLM 调用的默认模型。 | `claude-sonnet-4-6` |
| `CLAUDE_CONFIG_DIR` | 覆盖 Claude 配置主目录，默认 `~/.claude`。 | `/custom/path` |

---
