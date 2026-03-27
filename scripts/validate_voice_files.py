#!/usr/bin/env python3
"""Validate that all voice files referenced in XML actually exist"""

import re
import sys
from pathlib import Path

# All valid sound IDs
VALID_SOUND_IDS = {
    "VOX_DYING",
    "VOX_GEAR_FLASH",
    "VOX_GEAR_FRAG",
    "VOX_GEAR_LAUNCHER",
    "VOX_GEAR_MOLOTOV",
    "VOX_GEAR_ROCKET",
    "VOX_GEAR_SMOKE",
    "VOX_GEAR_STINGER",
    "VOX_INJURED",
    "VOX_RELOAD",
    "VOX_RELOAD_PUMP",
    "VOX_TRPR_BOMB_DEFUSING",
    "VOX_TRPR_BOMB_LOCATED",
    "VOX_TRPR_BREACHING_DOOR",
    "VOX_TRPR_CAN_I_SHOOT",
    "VOX_TRPR_COMPROMISED",
    "VOX_TRPR_CANT",
    "VOX_TRPR_CIV_DOWN",
    "VOX_TRPR_CLEAR",
    "VOX_TRPR_COME",
    "VOX_TRPR_DISGUISED",
    "VOX_TRPR_DONE_HERE",
    "VOX_TRPR_EVAC",
    "VOX_TRPR_EYES_HOSTAGE",
    "VOX_TRPR_EYESONTARGET",
    "VOX_TRPR_EYESONTARGET_QUIET",
    "VOX_TRPR_FREEZE",
    "VOX_TRPR_GEAR_CHARGE_PLACE",
    "VOX_TRPR_GEAR_CHARGE_RDY",
    "VOX_TRPR_GETDOWN",
    "VOX_TRPR_GO_GO_GO",
    "VOX_TRPR_GO_LOUD",
    "VOX_TRPR_HANDCUFF",
    "VOX_TRPR_HOLDING",
    "VOX_TRPR_HOST_DOWN",
    "VOX_TRPR_HOST_SEC",
    "VOX_TRPR_HVT_RUNNING",
    "VOX_TRPR_KEEPMOVINGOFF",
    "VOX_TRPR_KEEPMOVINGON",
    "VOX_TRPR_MANDOWN",
    "VOX_TRPR_MATCHSPEEDON",
    "VOX_TRPR_MOVING",
    "VOX_TRPR_NOTANGOS",
    "VOX_TRPR_ONTARGET",
    "VOX_TRPR_ON_ALPHA",
    "VOX_TRPR_ON_BRAVO",
    "VOX_TRPR_ON_CHARLIE",
    "VOX_TRPR_ON_DELTA",
    "VOX_TRPR_ORDERS",
    "VOX_TRPR_PASS_ALPHA",
    "VOX_TRPR_PASS_BRAVO",
    "VOX_TRPR_PASS_CHARLIE",
    "VOX_TRPR_PASS_DELTA",
    "VOX_TRPR_PINNED_DOWN",
    "VOX_TRPR_PUMPUP",
    "VOX_TRPR_ROGER",
    "VOX_TRPR_SILENTOFF",
    "VOX_TRPR_SILENTON",
    "VOX_TRPR_SUSP_SEC",
    "VOX_TRPR_TANGODOWN",
    "VOX_TRPR_TANGOS",
    "VOX_TRPR_TARGET_SEC",
    "VOX_TRPR_TIME_TO_GO",
    "VOX_TRPR_VIP_DEAD",
    "VOX_TRPR_WAIT",
    "VOX_WARN_GRENADE",
    "VOX_WARN_RPG",
}


def validate_voice_xml(xml_file):
    """Check if all voice files referenced in an XML file exist and validate structure"""
    print(f"\nValidating {xml_file}...")

    with open(xml_file, "r") as f:
        content = f.read()

    # Find all voice packs
    pack_pattern = r'<Pack name="([^"]+)-Voice"[^>]*>(.*?)</Pack>'
    packs = re.finditer(pack_pattern, content, re.DOTALL)

    all_valid = True

    for pack_match in packs:
        pack_name = pack_match.group(1)
        pack_content = pack_match.group(2)

        print(f"\n  Pack: {pack_name}-Voice")

        # Find all sound IDs in this pack
        sound_ids = re.findall(r'<Sound ID="([^"]+)">', pack_content)

        # Check for invalid sound IDs
        invalid_ids = set(sound_ids) - VALID_SOUND_IDS
        if invalid_ids:
            print(f"    ❌ Found {len(invalid_ids)} invalid sound IDs:")
            for sid in sorted(invalid_ids):
                print(f"      - {sid}")
            all_valid = False

        # Check for missing sound IDs
        missing_ids = VALID_SOUND_IDS - set(sound_ids)
        if missing_ids:
            print(f"    ❌ Missing {len(missing_ids)} required sound IDs:")
            for sid in sorted(missing_ids):
                print(f"      - {sid}")
            all_valid = False

        # Check for duplicate sound IDs
        duplicates = [sid for sid in set(sound_ids) if sound_ids.count(sid) > 1]
        if duplicates:
            print(f"    ❌ Found {len(duplicates)} duplicate sound IDs:")
            for sid in sorted(duplicates):
                print(f"      - {sid} (appears {sound_ids.count(sid)} times)")
            all_valid = False

        if not invalid_ids and not missing_ids and not duplicates:
            print(f"    ✓ All {len(sound_ids)} sound IDs are valid and complete")

    # Check that all referenced files exist
    paths = re.findall(r'name="(data/sounds/voice/[^"]+)"', content)

    missing_files = []
    long_paths = []
    checked = set()

    for path in paths:
        if path in checked:
            continue
        checked.add(path)

        # Check path length (124 character limit)
        if len(path) > 124:
            long_paths.append((path, len(path)))

        # Convert data/sounds/voice/X to mod/sounds/voice/X
        local_path = path.replace("data/", "mod/")

        if not Path(local_path).exists():
            missing_files.append((path, local_path))

    if long_paths:
        print(
            f"\n  ❌ Found {len(long_paths)} file paths exceeding 124 character limit:"
        )
        for path, length in long_paths:
            print(f"    - {path}")
            print(f"      (length: {length} chars, exceeds limit by {length - 124})")
        all_valid = False

    if missing_files:
        print(f"\n  ❌ Found {len(missing_files)} missing voice files:")
        for xml_path, local_path in missing_files:
            print(f"    - {xml_path}")
            print(f"      (expected at: {local_path})")
        all_valid = False
    else:
        print(f"\n  ✓ All {len(checked)} referenced voice files exist")

    return all_valid


if __name__ == "__main__":
    sounds_dir = Path("mod/sounds")
    xml_files = list(sounds_dir.glob("gfl_voice_lines_*.xml"))

    if not xml_files:
        print("No voice line XML files found in mod/sounds/")
        sys.exit(1)

    print(f"Found {len(xml_files)} voice line XML files to validate")

    all_valid = True
    for xml_file in sorted(xml_files):
        if not validate_voice_xml(str(xml_file)):
            all_valid = False

    if all_valid:
        print("\n✓ All voice files validated successfully!")
        sys.exit(0)
    else:
        print("\n❌ Some voice files are invalid!")
        sys.exit(1)
