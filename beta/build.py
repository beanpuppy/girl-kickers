#!/usr/bin/env python3
"""Stage the mod folder with the beta mod.xml override and emit a workshop.vdf.

Copies mod/ into a staging directory, swaps in beta/mod.xml, and writes a
workshop.vdf next to the staging dir. Prints the absolute path of the vdf so
the caller (CI or a local script) can pass it to steamcmd.

Usage:
    beta/build.py [--staging DIR]
"""

from __future__ import annotations

import argparse
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MOD_DIR = REPO_ROOT / "mod"
BETA_DIR = REPO_ROOT / "beta"
BETA_MOD_XML = BETA_DIR / "mod.xml"
BETA_PREVIEW = BETA_DIR / "preview.jpg"
APPID = "1239080"


def vdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def build(staging: Path) -> Path:
    beta_attrs = ET.parse(BETA_MOD_XML).getroot().attrib
    ugc_id = beta_attrs["ugcId"]
    title = beta_attrs["title"]
    description = beta_attrs["description"]

    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    content_dir = staging / "content"
    shutil.copytree(MOD_DIR, content_dir)
    shutil.copy(BETA_MOD_XML, content_dir / "mod.xml")

    vdf_path = staging / "workshop.vdf"
    vdf_path.write_text(
        '"workshopitem"\n'
        "{\n"
        f'    "appid"             "{APPID}"\n'
        f'    "publishedfileid"   "{ugc_id}"\n'
        f'    "contentfolder"     "{content_dir}"\n'
        f'    "previewfile"       "{BETA_PREVIEW}"\n'
        f'    "title"             "{vdf_escape(title)}"\n'
        f'    "description"       "{vdf_escape(description)}"\n'
        "}\n",
        encoding="utf-8",
    )
    return vdf_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--staging",
        default=str(BETA_DIR / "_staging"),
        help="Where to place the staged content and workshop.vdf",
    )
    args = parser.parse_args()

    if not BETA_MOD_XML.exists():
        sys.exit(f"missing {BETA_MOD_XML}")
    if not BETA_PREVIEW.exists():
        sys.exit(f"missing {BETA_PREVIEW}")

    print(build(Path(args.staging)))


if __name__ == "__main__":
    main()
