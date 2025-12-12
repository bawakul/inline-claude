---
description: Convert text to speech using OpenAI's TTS API via the speaker subagent
---

Spawn the speaker subagent to convert text to speech in the background.

**Instructions:**

1. Identify the text to speak:
   - If user provided text after `/speak`, use that
   - Otherwise, use your most recent response (the message just before this command)

2. Spawn the speaker subagent using the Task tool:
   - subagent_type: 'general-purpose'
   - model: 'haiku' (for speed and cost efficiency)
   - run_in_background: true

3. Pass this prompt to the speaker subagent:
   ```
   Convert this text to speech:

   [INSERT THE RAW TEXT HERE]

   Use the tts Skill to clean and convert the text.
   ```

4. After spawning the agent, output ONLY "🔊" - nothing else.

**Note:** The speaker subagent automatically loads the tts Skill which:
- Cleans markdown formatting, code blocks, URLs, and file paths
- Calls OpenAI's TTS API with voice=nova and speed=1.1
- Plays the audio output

---

If the user provides text after the command (e.g., `/speak Here is some text`), use that text.
If no text is provided, speak your most recent response.
