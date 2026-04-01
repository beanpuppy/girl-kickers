#!/usr/bin/env python3
"""Transcribe and translate Japanese voice files to English"""

import os
import warnings
import whisper
from pathlib import Path
import sys
import torch

# Suppress specific ROCm warnings
warnings.filterwarnings("ignore", message=".*hipBLASLt.*")
warnings.filterwarnings("ignore", message=".*Flash attention.*")
warnings.filterwarnings("ignore", message=".*Memory Efficient attention.*")

# Enable experimental ROCm features for better performance on newer AMD GPUs
os.environ.setdefault("TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL", "1")


def transcribe_character_dir(character_dir, model, device):
    """
    Transcribe all voice files in a character directory.

    Returns a list of translation results.
    """
    # Find all audio files
    audio_extensions = {".wav", ".ogg", ".flac", ".mp3", ".m4a"}
    audio_files = []

    for ext in audio_extensions:
        audio_files.extend(character_dir.glob(f"*{ext}"))

    audio_files = sorted(audio_files)

    if not audio_files:
        return []

    results = []

    for i, audio_file in enumerate(audio_files, 1):
        print(f"  [{i}/{len(audio_files)}] {audio_file.name}")

        try:
            # Transcribe and translate to English
            use_fp16 = device == "cuda"
            result = model.transcribe(
                str(audio_file), language="ja", task="translate", fp16=use_fp16
            )

            translation = result["text"].strip()

            if translation:
                results.append({"file": audio_file.name, "translation": translation})
                print(f"    EN: {translation}")
            else:
                print("    (no speech detected)")

        except Exception as e:
            print(f"    Error: {e}")

    return results


def process_voice_directories(voice_base_dir, model_name="large", force=False):
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

    # Initialize model once
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"\nUsing device: {device}")
    if device == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    print(f"\nLoading Whisper model: {model_name}")
    print("(First run will download the model)")
    print(
        "Model sizes: tiny (~75MB), base (~150MB), small (~500MB), medium (~1.5GB), large (~3GB)"
    )
    model = whisper.load_model(model_name, device=device)

    print(f"\n{'=' * 60}")
    print(f"Processing {len(dirs_to_process)} character(s)")
    print(f"{'=' * 60}\n")

    # Process each character directory
    for idx, char_dir in enumerate(dirs_to_process, 1):
        print(f"[{idx}/{len(dirs_to_process)}] Processing {char_dir.name}...")

        results = transcribe_character_dir(char_dir, model, device)

        if results:
            # Write to _trans.txt in the character directory
            output_file = char_dir / "_trans.txt"

            with open(output_file, "w", encoding="utf-8") as f:
                f.write(f"# Voice Line Translations for {char_dir.name}\n")
                f.write("# Generated automatically using OpenAI Whisper\n")
                f.write(f"# Total files: {len(results)}\n")
                f.write("\n")

                for item in results:
                    f.write(f"{item['file']}\n")
                    f.write(f"  {item['translation']}\n")
                    f.write("\n")

            print(f"  ✓ Saved {len(results)} translations to {output_file}")
        else:
            print(f"  ⚠ No audio files found in {char_dir.name}")

        print()

    print(f"{'=' * 60}")
    print("Done!")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Transcribe and translate Japanese voice files to English.\n"
        "Auto-detects character directories and only transcribes those without _trans.txt files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--voice-dir",
        default="mod/sounds/voice",
        help="Base voice directory containing character folders (default: mod/sounds/voice)",
    )
    parser.add_argument(
        "--model",
        choices=["tiny", "base", "small", "medium", "large"],
        default="large",
        help="Whisper model size (default: large)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force regeneration of all transcriptions, even if _trans.txt exists",
    )

    args = parser.parse_args()

    process_voice_directories(args.voice_dir, args.model, args.force)
