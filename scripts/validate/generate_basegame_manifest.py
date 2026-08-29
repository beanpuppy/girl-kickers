#!/usr/bin/env python3
"""Generate a manifest of base game assets from a DK2 install.

Outputs scripts/validate/basegame_manifest.json with:
- files: all data/ file paths (relative, using data/ prefix)
- loc_keys: all @keys from base game localisation files
- equipment: all named equipment/weapon/ammo/scope/etc. definitions from XML

Run this when DK2 updates (rarely) and commit the result.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# Try common Steam install paths
STEAM_PATHS = [
    Path.home() / ".local/share/Steam/steamapps/common/DoorKickers2",
    Path.home() / ".steam/steam/steamapps/common/DoorKickers2",
    Path("C:/Program Files (x86)/Steam/steamapps/common/DoorKickers2"),
    Path("C:/Program Files/Steam/steamapps/common/DoorKickers2"),
]

OUT = Path(__file__).resolve().parent / "basegame_manifest.json"


def find_dk2():
    for p in STEAM_PATHS:
        if (p / "data").exists():
            return p
    return None


def main():
    # An explicit path wins over auto-detection. This has to be checked first:
    # auto-detection exiting on failure would otherwise make the argument
    # unreachable for anyone whose DK2 isn't in a default Steam folder.
    if len(sys.argv) > 1:
        dk2 = Path(sys.argv[1])
        if not (dk2 / "data").exists():
            print(f"No data/ directory found at {dk2}")
            sys.exit(1)
    else:
        dk2 = find_dk2()
        if not dk2:
            print("Could not find DK2 install. Searched:")
            for p in STEAM_PATHS:
                print(f"  {p}")
            print(
                "\nPass the path as an argument: python generate_basegame_manifest.py /path/to/DoorKickers2"
            )
            sys.exit(1)

    data_dir = dk2 / "data"
    print(f"Scanning {data_dir}...")

    # Collect all file paths
    files = sorted(
        "data/" + str(p.relative_to(data_dir)).replace("\\", "/")
        for p in data_dir.rglob("*")
        if p.is_file()
    )
    print(f"Found {len(files)} files")

    # Collect localisation keys
    loc_keys = set()
    loc_dir = data_dir / "localization"
    if loc_dir.exists():
        key_pattern = re.compile(r"^(@[a-zA-Z0-9_#-]+)\s*=", re.MULTILINE)
        for loc_file in loc_dir.rglob("*.txt"):
            try:
                text = loc_file.read_text(encoding="utf-8", errors="replace")
                loc_keys.update(key_pattern.findall(text))
            except Exception as e:
                print(f"  Warning: could not read {loc_file}: {e}")

    print(f"Found {len(loc_keys)} localisation keys")

    # Collect all named definitions from XML files
    equipment = set()
    xml_dirs = ["equipment", "entities", "units"]
    for xml_dir in xml_dirs:
        xml_path = data_dir / xml_dir
        if not xml_path.exists():
            continue
        for xml_file in xml_path.rglob("*.xml"):
            try:
                tree = ET.parse(xml_file)
            except ET.ParseError:
                continue
            for el in tree.iter():
                name = el.get("name")
                if name:
                    equipment.add(name)
    print(f"Found {len(equipment)} named definitions")

    manifest = {
        "files": files,
        "loc_keys": sorted(loc_keys),
        "equipment": sorted(equipment),
    }

    OUT.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
