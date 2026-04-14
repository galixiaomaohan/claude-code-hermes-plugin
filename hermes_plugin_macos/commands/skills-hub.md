---
name: skills-hub
description: Browse and install skills from the Hermes Skills Hub.
allowed-tools: Bash
argument-hint: "[search-query]"
---

Execute the real Hermes Skills Hub engine:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" hermes:skills-hub "<args>"
```

Parse the JSON output and present the results to the user. To install a skill, confirm the path with the user before writing.
