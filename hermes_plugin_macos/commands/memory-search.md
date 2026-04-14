---
name: memory-search
description: Search the Hermes memory store for relevant sessions.
allowed-tools: Bash
argument-hint: "<query>"
---

Execute the real Hermes Memory Engine (`MemoryEngine.searchSessions`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" hermes:memory-search "<args>"
```

Parse the JSON output and present the matching sessions to the user.
