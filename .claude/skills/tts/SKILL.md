---
name: tts
description: Convert text to speech using OpenAI's TTS API. Generates audio files from text with customizable voice and speed.
allowed-tools: Bash(python:*)
---

# Text-to-Speech Skill

Converts text to speech audio using OpenAI's TTS API.

## Requirements

- OpenAI API key must be set as environment variable: `OPENAI_API_KEY`
- Python with `openai` package installed

## Usage

To convert text to speech:
```bash
python .claude/skills/tts/scripts/text_to_speech.py "Your text here" --voice nova --speed 1.1
```

## Instructions

When converting text to speech:

1. **Clean the text first:**
   - Remove markdown formatting (**, `, ###, etc.)
   - Remove code blocks entirely
   - Remove URLs and file paths
   - Keep only narrative, human-readable content
   - Convert technical terms to speakable phrases

2. **Run the script:**
   ```bash
   python .claude/skills/tts/scripts/text_to_speech.py "[cleaned text]" --voice nova --speed 1.1
   ```

3. **Confirm completion:** Output "🔊"
