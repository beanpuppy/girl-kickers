#!/usr/bin/env python3
"""
Process voice files for Door Kickers 2 mod:
1. Apply radio/walkie-talkie effect to audio files
2. Shorten filenames by removing redundant prefixes

Made for use with voice lines from https://github.com/beanpuppy/gfl2-voice
"""

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal


def apply_radio_effect(
    input_file,
    output_file,
    highpass_freq=100,
    lowpass_freq=6000,
    mid_boost_freq=1200,
    mid_boost_db=1,
    boost_q=0.5,
):
    """
    Apply a radio/walkie-talkie effect to an audio file.

    Parameters:
    - highpass_freq: Cut frequencies below this (Hz)
    - lowpass_freq: Cut frequencies above this (Hz)
    - mid_boost_freq: Center frequency for midrange boost (Hz)
    - mid_boost_db: Amount of boost in dB
    - boost_q: Q factor for the boost (higher = narrower)
    """

    # Load audio
    audio, sr = sf.read(input_file)

    print(f"Processing: {input_file}")
    print(f"Sample rate: {sr} Hz")
    print(f"Duration: {len(audio) / sr:.2f} seconds")

    # High-pass filter (remove bass)
    sos_highpass = signal.butter(4, highpass_freq, "highpass", fs=sr, output="sos")
    audio = signal.sosfilt(sos_highpass, audio)
    print(f"Applied high-pass filter at {highpass_freq} Hz")

    # Low-pass filter (remove high frequencies)
    sos_lowpass = signal.butter(4, lowpass_freq, "lowpass", fs=sr, output="sos")
    audio = signal.sosfilt(sos_lowpass, audio)
    print(f"Applied low-pass filter at {lowpass_freq} Hz")

    # Midrange boost using peaking EQ
    # Convert dB to linear gain
    gain = 10 ** (mid_boost_db / 20)

    # Design peaking filter
    w0 = 2 * np.pi * mid_boost_freq / sr
    alpha = np.sin(w0) / (2 * boost_q)

    # Peaking EQ coefficients
    b0 = 1 + alpha * gain
    b1 = -2 * np.cos(w0)
    b2 = 1 - alpha * gain
    a0 = 1 + alpha / gain
    a1 = -2 * np.cos(w0)
    a2 = 1 - alpha / gain

    # Normalize
    b = np.array([b0 / a0, b1 / a0, b2 / a0])
    a = np.array([1, a1 / a0, a2 / a0])

    audio = signal.lfilter(b, a, audio)
    print(f"Applied midrange boost: +{mid_boost_db} dB at {mid_boost_freq} Hz")

    # Subtle compression effect (reduce dynamic range)
    # Simple soft-clipping style compression
    threshold = 0.7
    audio = audio * 1.2  # Slight gain increase
    mask = np.abs(audio) > threshold
    audio[mask] = threshold * np.sign(audio[mask]) + 0.3 * (
        audio[mask] - threshold * np.sign(audio[mask])
    )
    print("Applied soft compression")

    # Reduce volume by 8dB
    volume_reduction = 10 ** (-8 / 20)  # Convert -8dB to linear scale
    audio = audio * volume_reduction
    print("Applied -8dB volume reduction")

    # Normalize to prevent clipping
    max_val = np.abs(audio).max()
    if max_val > 0.95:
        audio = audio * (0.95 / max_val)
        print(f"Normalized audio (peak was {max_val:.3f})")

    sf.write(output_file, audio, sr)
    print(f"\nSaved to: {output_file}")
    print(f"Final RMS: {np.sqrt(np.mean(audio**2)):.6f}")


def shorten_filename(filename, character_name):
    """
    Shorten a filename by removing redundant prefix.
    Example: VO_Groza_JP_VO_Groza_Series_Win.wav -> Series_Win.wav

    Returns: (new_filename, was_shortened)
    """
    # First remove VO_{Character}_JP_VO_{Character}_ pattern
    pattern1 = f"VO_{character_name}_JP_VO_{character_name}_"
    filename = filename.replace(pattern1, "")

    # Then remove remaining VO_{Character}_JP_ pattern
    pattern2 = f"VO_{character_name}_JP_"
    filename = filename.replace(pattern2, "")

    return filename, True


def process_directory(input_dir, character_name, **effect_params):
    """
    Process all audio files in a directory and output to mod/sounds/voice/<character_name>/

    Parameters:
    - input_dir: Path to directory containing audio files
    - character_name: Name for the output subdirectory
    - effect_params: Parameters to pass to apply_radio_effect
    """
    input_path = Path(input_dir)

    if not input_path.exists():
        print(f"Error: Input directory '{input_dir}' not found!")
        sys.exit(1)

    if not input_path.is_dir():
        print(f"Error: '{input_dir}' is not a directory!")
        sys.exit(1)

    # Create output directory
    output_dir = Path("mod/sounds/voice") / character_name
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"Output directory: {output_dir}")

    # Supported audio extensions
    audio_extensions = {".wav", ".ogg", ".flac", ".mp3", ".aac", ".m4a", ".opus"}

    # Find all audio files
    audio_files = []
    for ext in audio_extensions:
        audio_files.extend(input_path.glob(f"*{ext}"))
        audio_files.extend(input_path.glob(f"*{ext.upper()}"))

    audio_files = sorted(audio_files)

    if not audio_files:
        print(f"No audio files found in '{input_dir}'")
        print(f"   Supported formats: {', '.join(audio_extensions)}")
        sys.exit(1)

    print(f"\nFound {len(audio_files)} audio file(s) to process")
    print("\n" + "=" * 60)

    success_count = 0
    failed_files = []
    shortened_count = 0

    for i, input_file in enumerate(audio_files, 1):
        # Create output filename
        output_filename = input_file.stem + ".wav"

        output_filename, was_shortened = shorten_filename(
            output_filename, character_name
        )
        shortened_count += 1

        output_file = output_dir / output_filename

        print(f"\n[{i}/{len(audio_files)}] Processing: {input_file.name}")
        print("-" * 60)

        try:
            apply_radio_effect(str(input_file), str(output_file), **effect_params)
            success_count += 1
        except Exception as e:
            print(f"Failed: {e}")
            failed_files.append(input_file.name)

        print("-" * 60)

    # Summary
    print("\n" + "=" * 60)
    print("PROCESSING SUMMARY")
    print("=" * 60)
    print(f"Total files: {len(audio_files)}")
    print(f"Successful: {success_count}")
    print(f"Failed: {len(failed_files)}")

    if failed_files:
        print("\nFailed files:")
        for filename in failed_files:
            print(f"  - {filename}")

    print(f"\nOutput location: {output_dir.resolve()}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Process voice files: apply radio effect and shorten filenames",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Process directory with radio effect and filename shortening:
    python process_voice.py /path/to/audio/dir CharacterName
    python process_voice.py /home/user/Downloads/VO_ZhaoHui_JP ZhaoHui

  Process without shortening filenames:
    python process_voice.py /path/to/audio/dir CharacterName --no-shorten

  Single file processing:
    python process_voice.py input.wav output.wav
    python process_voice.py input.wav output.wav --highpass 200 --lowpass 3000
        """,
    )

    parser.add_argument("input", help="Input audio file or directory")
    parser.add_argument(
        "output",
        help="Output audio file (for single file) or character name (for directory)",
    )
    parser.add_argument(
        "--no-shorten",
        action="store_true",
        help="Don't shorten filenames when processing (keep original names)",
    )
    parser.add_argument(
        "--highpass",
        type=float,
        default=100,
        help="High-pass filter frequency in Hz (default: 100, try 80-200)",
    )
    parser.add_argument(
        "--lowpass",
        type=float,
        default=6000,
        help="Low-pass filter frequency in Hz (default: 6000, try 5000-8000)",
    )
    parser.add_argument(
        "--mid-boost",
        type=float,
        default=1200,
        help="Midrange boost center frequency in Hz (default: 1200, try 1000-1500)",
    )
    parser.add_argument(
        "--mid-db",
        type=float,
        default=1,
        help="Midrange boost amount in dB (default: 1, try 0.5-3)",
    )
    parser.add_argument(
        "--boost-q",
        type=float,
        default=0.5,
        help="Q factor for midrange boost (default: 0.5, higher = narrower)",
    )

    args = parser.parse_args()

    # Check if input is a directory or file
    input_path = Path(args.input)

    if not input_path.exists():
        print(f"Error: '{args.input}' not found!")
        sys.exit(1)

    effect_params = {
        "highpass_freq": args.highpass,
        "lowpass_freq": args.lowpass,
        "mid_boost_freq": args.mid_boost,
        "mid_boost_db": args.mid_db,
        "boost_q": args.boost_q,
    }

    print("=" * 60)
    print("VOICE FILE PROCESSOR")
    print("=" * 60)
    print()

    try:
        if input_path.is_dir():
            # Directory processing mode
            character_name = args.output
            process_directory(args.input, character_name, **effect_params)
        else:
            # Single file processing mode
            output_file = args.output

            # Create output directory if needed
            output_dir = os.path.dirname(output_file)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir)
                print(f"Created output directory: {output_dir}")

            apply_radio_effect(args.input, output_file, **effect_params)

            print("\n" + "=" * 60)
            print("Processing complete!")
            print("=" * 60)

    except Exception as e:
        print(f"\nError processing audio: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
