---
name: compress-context
description: Compress the current conversation context intelligently.
allowed-tools: Bash, Read, Write
---

This command executes the real Hermes Context Compressor engine (`ContextCompressor.compress`).

1. Create a secure temporary JSON file path:
   ```bash
   TEMP_FILE=$(mktemp /tmp/hermes-compress-XXXXXX.json)
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
   node "${CLAUDE_PLUGIN_ROOT}/dist/src/cli.js" hermes:compress-context "" "${TEMP_FILE}"
   ```
4. Parse the JSON output and present the compressed context summary to the user.
5. Delete the temporary context file:
   ```bash
   rm -f "${TEMP_FILE}"
   ```
