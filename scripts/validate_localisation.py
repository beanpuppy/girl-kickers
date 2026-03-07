#!/usr/bin/env python3
"""Validate localisation keys between XML files and gfl_game.txt.

Checks for:
- Keys used in XML but missing from gfl_game.txt (excluding known base game keys)
- Keys defined in gfl_game.txt but not used in any XML file
- Duplicate keys in gfl_game.txt
"""

import re
import sys
from pathlib import Path

MOD_DIR = Path(__file__).resolve().parent.parent / "mod"
LOC_FILE = MOD_DIR / "localization" / "gfl_game.txt"

XML_DIRS = [
    MOD_DIR / "action_waypoints",
    MOD_DIR / "entities",
    MOD_DIR / "equipment",
    MOD_DIR / "gui",
    MOD_DIR / "units",
]

# Keys defined in the base game, not in our localisation file
BASE_GAME_PREFIXES = [
    "@agent_rank_",
    "@buff_scaredshitless",
    "@customization_battlehonors_",
    "@doctrine_rangers_",
    "@firearm_caliber_12gauge_",
    "@firearm_caliber_303_",
    "@firearm_caliber_380_name",
    "@firearm_caliber_545x39_",
    "@firearm_caliber_556x45_",
    "@firearm_caliber_762x39_",
    "@firearm_caliber_762x51_",
    "@firearm_caliber_9x19_",
    "@firearm_operation_fullauto_",
    "@firearm_operation_pumpaction_",
    "@firearm_operation_semiauto_",
    "@firearm_operation_semifull_",
    "@menu_",
]


def is_base_game_key(key: str) -> bool:
    return any(key.startswith(prefix) for prefix in BASE_GAME_PREFIXES)


def get_xml_keys() -> set[str]:
    keys = set()
    pattern = re.compile(r'"(@[a-zA-Z0-9_#-]+)"')
    for xml_dir in XML_DIRS:
        if not xml_dir.exists():
            continue
        for xml_file in xml_dir.rglob("*.xml"):
            text = xml_file.read_text(encoding="utf-8")
            keys.update(pattern.findall(text))
    return keys


def get_loc_keys(loc_file: Path) -> tuple[dict[str, list[int]], list[str]]:
    """Returns (key -> list of line numbers, list of duplicate keys)."""
    keys: dict[str, list[int]] = {}
    duplicates = []
    for i, line in enumerate(loc_file.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line.startswith("@"):
            continue
        match = re.match(r"(@[a-zA-Z0-9_#-]+)\s*=", line)
        if match:
            key = match.group(1)
            if key in keys:
                duplicates.append(f"  {key} (lines {keys[key][0]} and {i})")
            keys.setdefault(key, []).append(i)
    return keys, duplicates


def main() -> int:
    if not LOC_FILE.exists():
        print(f"error: localisation file not found: {LOC_FILE}")
        return 1

    xml_keys = get_xml_keys()
    loc_keys, duplicates = get_loc_keys(LOC_FILE)
    loc_key_set = set(loc_keys.keys())

    issues = 0

    # missing from localisation
    missing = sorted(k for k in xml_keys - loc_key_set if not is_base_game_key(k))
    if missing:
        issues += len(missing)
        print(f"missing from gfl_game.txt ({len(missing)}):")
        for key in missing:
            print(f"  {key}")
        print()

    # orphaned in localisation
    orphaned = sorted(loc_key_set - xml_keys)
    if orphaned:
        issues += len(orphaned)
        print(f"orphaned in gfl_game.txt ({len(orphaned)}):")
        for key in orphaned:
            line = loc_keys[key][0]
            print(f"  {key} (line {line})")
        print()

    # duplicates
    if duplicates:
        issues += len(duplicates)
        print(f"duplicate keys in gfl_game.txt ({len(duplicates)}):")
        for dup in duplicates:
            print(dup)
        print()

    if issues == 0:
        print("all good, no issues found")
    else:
        print(f"{issues} issue(s) found")

    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
