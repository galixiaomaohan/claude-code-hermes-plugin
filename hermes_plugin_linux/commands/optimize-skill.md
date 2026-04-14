---
name: optimize-skill
description: Optimize an existing skill based on usage feedback.
allowed-tools: Bash
argument-hint: "<skill-name>"
---

Execute the real Hermes Skill Optimizer engine (`SkillOptimizer.optimizeSkill`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" hermes:optimize-skill "<args>"
```

Parse the JSON output and present the optimization result to the user.
