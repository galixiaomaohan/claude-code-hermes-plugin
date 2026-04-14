---
name: status
description: Show the current status of all Hermes self-learning modules.
allowed-tools: Bash
---

Execute the real Hermes Status Monitor:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" hermes:status
```

Parse the JSON output and present the status summary to the user.
