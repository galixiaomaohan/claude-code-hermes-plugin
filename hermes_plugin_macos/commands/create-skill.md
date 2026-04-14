---
name: create-skill
description: Auto-create a skill from the recent conversation.
allowed-tools: Bash, Read, Write
---

This command executes the real Hermes Auto-Skill Creator engine (`AutoSkillCreator.analyzeAndCreate`).

1. Create a secure temporary JSON file path:
   ```bash
   TEMP_FILE=$(mktemp /tmp/hermes-create-skill-XXXXXX.json)
   ```
2. Write the conversation context to `${TEMP_FILE}` with this shape:
   ```json
   {
     "messages": [ /* recent conversation messages as an array of { type, message } objects */ ],
     "sessionId": "<current-session-id>",
     "model": "<current-model>",
     "cwd": "<current-working-directory>"
   }
   ```
3. Run the engine:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" hermes:create-skill "" "${TEMP_FILE}"
   ```
4. Parse the JSON output and present the result (skill path and frontmatter) to the user.
5. Delete the temporary context file:
   ```bash
   rm -f "${TEMP_FILE}"
   ```
