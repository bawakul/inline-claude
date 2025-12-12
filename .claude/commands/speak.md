---
description: Convert text to speech using OpenAI's TTS API
---

Convert the following text to speech using the TTS script:

**Instructions:**
1. Identify the text:
   - If user provided text after `/speak`, use that (from ARGUMENTS)
   - Otherwise, use your most recent response

2. Clean the text:
   - Remove markdown formatting (**, `, ###, etc.)
   - Remove code blocks entirely
   - Remove URLs and file paths
   - Keep only narrative, human-readable content
   - Convert technical terms to speakable phrases

3. Run the Python script:
   ```bash
   python .claude/skills/tts/scripts/text_to_speech.py "[cleaned text]" --voice nova --speed 1.1
   ```

4. Output: 🔊

ARGUMENTS: $ARGUMENTS
