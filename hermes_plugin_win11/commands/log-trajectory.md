---
name: log-trajectory
description: Manually log the current conversation trajectory.
allowed-tools: Bash, Read, Write
---

This command executes the real Hermes Training Bridge (`TrajectoryLogger.log`).

1. Create a secure temporary JSON file path:
   ```bash
   TEMP_FILE=$(mktemp /tmp/hermes-log-trajectory-XXXXXX.json)
   ```
2. Write the conversation context to `${TEMP_FILE}` with this shape:
   ```json
   {
     "messages": [ /* conversation messages as an array of { type, message } objects */ ],
     "sessionId": "<current-session-id>",
     "model": "<current-model>",
     "cwd": "<current-working-directory>"
   }
   ```
3. Run the engine:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" hermes:log-trajectory "" "${TEMP_FILE}"
   ```
4. Parse the JSON output and confirm the trajectory has been logged.
5. Delete the temporary context file:
   ```bash
   rm -f "${TEMP_FILE}"
   ```
