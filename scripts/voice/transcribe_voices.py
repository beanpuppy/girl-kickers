#!/usr/bin/env python3
"""
Transcribe + translate Japanese voice files to English via OpenAI.

Two API calls per clip (same approach as WOMENACE scripts/voice/transcribe.py):
  1. Audio transcription via gpt-4o-transcribe (or override). language=ja.
  2. Chat completion via gpt-5 (or override) to translate JP -> EN.

Reads OPENAI_API_KEY from the environment or a .env at the repo root.
Auto-detects character directories under --voice-dir and only transcribes
those without a _trans.txt file.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import openai
from dotenv import load_dotenv

# Load .env from repo root (parent of scripts/voice/) so OPENAI_API_KEY is
# picked up without needing to export it in every shell.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DEFAULT_ASR_MODEL = "gpt-4o-transcribe"
DEFAULT_TRANSLATE_MODEL = "gpt-5"

AUDIO_EXTENSIONS = {".wav", ".ogg", ".flac", ".mp3", ".m4a"}

TRANSLATE_SYSTEM = (
    "You are a translator. Translate the user's Japanese text into natural "
    "conversational English. The input is a single voice line from a tactical "
    "squad-based game (combat barks, acknowledgements, ability callouts). "
    "Match the tone: short exclamations stay short, formal lines stay formal. "
    "Output only the English translation, no commentary, no quotes."
)


def transcribe_jp(client: openai.OpenAI, model: str, audio_path: Path) -> str:
    with audio_path.open("rb") as f:
        result = client.audio.transcriptions.create(
            model=model,
            file=f,
            language="ja",
        )
    return (result.text or "").strip()


def translate_en(client: openai.OpenAI, model: str, jp_text: str) -> str:
    if not jp_text:
        return ""
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": TRANSLATE_SYSTEM},
            {"role": "user", "content": jp_text},
        ],
    )
    return (resp.choices[0].message.content or "").strip()


def transcribe_character_dir(character_dir, client, asr_model, translate_model):
    """
    Transcribe all voice files in a character directory.

    Returns a list of translation results.
    """
    audio_files = sorted(
        p for p in character_dir.iterdir() if p.suffix.lower() in AUDIO_EXTENSIONS
    )

    if not audio_files:
        return []

    results = []

    for i, audio_file in enumerate(audio_files, 1):
        print(f"  [{i}/{len(audio_files)}] {audio_file.name}")

        try:
            jp = transcribe_jp(client, asr_model, audio_file)
            en = translate_en(client, translate_model, jp)

            if en:
                results.append(
                    {"file": audio_file.name, "transcript": jp, "translation": en}
                )
                print(f"    JP: {jp}")
                print(f"    EN: {en}")
            else:
                print("    (no speech detected)")

        except Exception as e:
            print(f"    Error: {e}")

    return results


def process_voice_directories(
    voice_base_dir, asr_model, translate_model, force=False
):
    """
    Auto-detect character directories and transcribe those without _trans.txt files.
    """
    voice_base = Path(voice_base_dir)

    if not voice_base.exists():
        print(f"Error: Directory '{voice_base_dir}' not found!")
        sys.exit(1)

    # Find all character directories (subdirectories with audio files)
    character_dirs = [d for d in voice_base.iterdir() if d.is_dir()]

    if not character_dirs:
        print(f"No character directories found in '{voice_base_dir}'")
        sys.exit(1)

    # Filter directories that need transcription
    dirs_to_process = []
    for char_dir in character_dirs:
        trans_file = char_dir / "_trans.txt"
        if force or not trans_file.exists():
            dirs_to_process.append(char_dir)
        else:
            print(f"Skipping {char_dir.name} (already has _trans.txt)")

    if not dirs_to_process:
        print("\nAll characters already have transcription files!")
        print("Use --force to regenerate transcriptions.")
        return

    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY not set (env var or .env at repo root)")
        sys.exit(1)

    client = openai.OpenAI()

    print(f"\n{'=' * 60}")
    print(
        f"Processing {len(dirs_to_process)} character(s) "
        f"(ASR: {asr_model}, MT: {translate_model})"
    )
    print(f"{'=' * 60}\n")

    # Process each character directory
    for idx, char_dir in enumerate(dirs_to_process, 1):
        print(f"[{idx}/{len(dirs_to_process)}] Processing {char_dir.name}...")

        results = transcribe_character_dir(char_dir, client, asr_model, translate_model)

        if results:
            # Write to _trans.txt in the character directory
            output_file = char_dir / "_trans.txt"

            with open(output_file, "w", encoding="utf-8") as f:
                f.write(f"# Voice Line Translations for {char_dir.name}\n")
                f.write(f"# Generated via OpenAI ({asr_model} + {translate_model})\n")
                f.write(f"# Total files: {len(results)}\n")
                f.write("\n")

                for item in results:
                    f.write(f"{item['file']}\n")
                    f.write(f"  JP: {item['transcript']}\n")
                    f.write(f"  EN: {item['translation']}\n")
                    f.write("\n")

            print(f"  ✓ Saved {len(results)} translations to {output_file}")
        else:
            print(f"  ⚠ No audio files found in {char_dir.name}")

        print()

    print(f"{'=' * 60}")
    print("Done!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Transcribe and translate Japanese voice files to English via OpenAI.\n"
        "Auto-detects character directories and only transcribes those without _trans.txt files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--voice-dir",
        default="mod/sounds/voice",
        help="Base voice directory containing character folders (default: mod/sounds/voice)",
    )
    parser.add_argument(
        "--asr-model",
        default=DEFAULT_ASR_MODEL,
        help=f"OpenAI ASR model (default: {DEFAULT_ASR_MODEL})",
    )
    parser.add_argument(
        "--translate-model",
        default=DEFAULT_TRANSLATE_MODEL,
        help=f"OpenAI translation model (default: {DEFAULT_TRANSLATE_MODEL})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force regeneration of all transcriptions, even if _trans.txt exists",
    )

    args = parser.parse_args()

    process_voice_directories(
        args.voice_dir, args.asr_model, args.translate_model, args.force
    )
