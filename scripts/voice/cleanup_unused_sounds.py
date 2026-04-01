#!/usr/bin/env python3
"""Find and delete unreferenced sound files in mod/sounds/voice/"""

import re
import sys
from pathlib import Path


def get_referenced_files():
    """Get all voice files referenced in XML files"""
    sounds_dir = Path("mod/sounds")
    xml_files = list(sounds_dir.glob("gfl_voice_lines_*.xml"))

    referenced = set()

    for xml_file in xml_files:
        with open(xml_file, "r") as f:
            content = f.read()

        # Find all file paths in <Path name="..."> tags
        paths = re.findall(r'<Path\s+name="data/sounds/voice/([^"]+)"', content)
        referenced.update(paths)

    return referenced


def get_all_voice_files():
    """Get all .wav files in mod/sounds/voice/"""
    voice_dir = Path("mod/sounds/voice")
    all_files = set()

    for wav_file in voice_dir.rglob("*.wav"):
        # Get path relative to mod/sounds/voice/
        rel_path = wav_file.relative_to(voice_dir)
        all_files.add(str(rel_path))

    return all_files


def main():
    print("Finding unreferenced voice files...\n")

    referenced = get_referenced_files()
    all_files = get_all_voice_files()

    unreferenced = all_files - referenced

    if not unreferenced:
        print("✓ No unreferenced voice files found!")
        return 0

    print(f"Found {len(unreferenced)} unreferenced voice files:\n")

    # Group by character directory
    by_character = {}
    for file_path in sorted(unreferenced):
        character = file_path.split("/")[0]
        if character not in by_character:
            by_character[character] = []
        by_character[character].append(file_path)

    for character in sorted(by_character.keys()):
        files = by_character[character]
        print(f"{character}: {len(files)} unreferenced files")
        for file_path in files:
            print(f"  - {file_path}")

    print(f"\nTotal: {len(unreferenced)} unreferenced files")

    # Ask for confirmation
    response = input("\nDelete these files? (yes/no): ").strip().lower()

    if response == "yes":
        voice_dir = Path("mod/sounds/voice")
        deleted_count = 0

        for file_path in unreferenced:
            full_path = voice_dir / file_path
            if full_path.exists():
                full_path.unlink()
                deleted_count += 1
                print(f"Deleted: {file_path}")

        print(f"\n✓ Deleted {deleted_count} unreferenced voice files")
        return 0
    else:
        print("\nCancelled - no files were deleted")
        return 1


if __name__ == "__main__":
    sys.exit(main())
