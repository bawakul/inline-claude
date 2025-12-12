#!/usr/bin/env python3
"""
Text-to-speech converter using OpenAI's TTS API
"""
import sys
import os
import argparse
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

def main():
    # Load environment variables from ~/.env
    env_file = Path.home() / '.env'
    if env_file.exists():
        load_dotenv(env_file)

    parser = argparse.ArgumentParser(description='Convert text to speech')
    parser.add_argument('text', help='Text to convert')
    parser.add_argument('--voice', default='nova',
                       choices=['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
                       help='Voice to use')
    parser.add_argument('--speed', type=float, default=1.0,
                       help='Speech speed (0.25 to 4.0)')
    parser.add_argument('--output', default='/tmp/tts_output.mp3',
                       help='Output file path')

    args = parser.parse_args()

    # Initialize OpenAI client
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    # Generate speech
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice=args.voice,
            input=args.text,
            speed=args.speed
        )

        # Save to file
        response.stream_to_file(args.output)

        # Play audio (macOS)
        os.system(f'afplay "{args.output}"')

        print(f"✓ Audio saved to {args.output} and played")

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
