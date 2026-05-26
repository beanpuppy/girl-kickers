#!/usr/bin/env python3
"""Parse mod XMLs and output www/unit-builder/app/data/dolls.json + convert portrait DDS to PNG."""

import json
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MOD = ROOT / "mod"
OUT = ROOT / "www" / "unit-builder" / "app" / "data"

# Canonical squad order. Entity bit-indices are assigned by concatenating the
# per-squad files in this order, so URL hashes stay stable across mod updates.
# Append new squads at the end — never reorder.
SQUAD_ORDER = [
    "girl",
    "defy",
    "404",
    "cafe",
    "groza",
    "elmoce",
    "frost",
    "monsoon",
    "pol03",
]


def parse_localisation(loc_dir: Path) -> dict[str, str]:
    """Parse every gfl_game_*.txt in loc_dir into a single key->value dict."""
    loc = {}
    for path in sorted(loc_dir.glob("gfl_game_*.txt")):
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("@") and "=" in line:
                key, _, val = line.partition("=")
                loc[key[1:]] = val  # strip leading @
    return loc


def parse_entities(paths: list[Path]) -> dict[str, dict]:
    """Parse per-squad gfl_humans_*.xml files in order, return dict keyed by class ID.

    Bit indices are assigned by the concatenated order of entities across files,
    which is determined by the input path list — keep it stable (see SQUAD_ORDER).
    """
    entities = {}
    bit_index = 0

    for path in paths:
        tree = ET.parse(path)
        for entity_el in tree.findall("Entity"):
            name = entity_el.get("name")
            human = entity_el.find("Human")
            if human is None:
                continue

            class_id = human.get("class")
            id_el = human.find("Id")
            phys = entity_el.find("PhysicalParams")
            render = entity_el.find("RenderObject3D")
            move = human.find("Mobility/MoveSpeed")
            turn = human.find("Mobility/TurnSpeed")
            fov = human.find("FOV")
            brain = human.find("Brain")

            equipment = []
            for item in human.findall("Equipment/Item"):
                equipment.append(item.get("name"))

            doctrines = [d.get("name") for d in human.findall("Doctrine")]

            entities[class_id] = {
                "bitIndex": bit_index,
                "entityName": name,
                "idName": id_el.get("name"),
                "portrait": id_el.get("portrait"),
                "gender": id_el.get("gender"),
                "voicePack": id_el.get("voicePack"),
                "health": int(phys.get("health")),
                "model": render.get("model"),
                "diffuseTex": render.get("diffuseTex"),
                "moveSpeed": float(move.get("defaultMetersPerSec")),
                "moveSpeedMin": float(move.get("min")),
                "moveSpeedMax": float(move.get("max")),
                "turnSpeed": float(turn.get("defaultMetersPerSec")),
                "turnSpeedMin": float(turn.get("min")),
                "turnSpeedMax": float(turn.get("max")),
                "fovDegrees": fov.get("degrees"),
                "fovDistance": fov.get("distanceMeters"),
                "fovEyeRadius": fov.get("eyeRadiusMeters"),
                "suppressionRecovery": brain.get("suppressionRecovery"),
                "equipment": equipment,
                "doctrines": doctrines,
            }
            bit_index += 1

    return entities


def parse_identities(path: Path) -> dict[str, dict]:
    """Parse gfl_human_identities.xml, return dict keyed by class ID.

    For each class we pick a unit to display as its squad. Non-GIRL units win
    when present (kept for historical entries that had both squad and GIRL
    Portraits); dolls that only live under GFL-UNIT-GIRL keep GIRL as their
    squad.
    """
    tree = ET.parse(path)
    identities = {}

    for portrait in tree.findall("Portrait"):
        class_id = portrait.get("class")
        unit = portrait.get("unit")
        custom_name = portrait.get("customName")

        if class_id not in identities:
            identities[class_id] = {
                "customName": custom_name,
                "squad": unit,
                "squadUnit": unit,
            }
        elif identities[class_id]["squad"] == "GFL-UNIT-GIRL" and unit != "GFL-UNIT-GIRL":
            # Prefer the non-GIRL unit if we saw GIRL first.
            identities[class_id]["squad"] = unit
            identities[class_id]["squadUnit"] = unit

    return identities


def parse_classes(paths: list[Path]) -> list[str]:
    """Parse per-squad gfl_unit_*.xml files in order, return ordered list of class IDs."""
    classes = []
    for path in paths:
        tree = ET.parse(path)
        for cls in tree.findall(".//Class"):
            classes.append(cls.get("name"))
    return classes


def parse_weapons(path: Path) -> dict[str, dict]:
    """Parse gfl_weapons.xml, return dict keyed by weapon name."""
    tree = ET.parse(path)
    weapons = {}

    # Collect all weapon names first to check for suppressed variants
    all_names = {firearm.get("name") for firearm in tree.iter("Firearm")}
    # Weapons that are integrally suppressed (no -SUP variant needed)
    integrally_suppressed = {"GFL-WEAP-VSK94"}

    for firearm in tree.iter("Firearm"):
        name = firearm.get("name")
        # Skip suppressed variants
        if name.endswith("-SUP"):
            continue

        mod_params = firearm.find("ModifiableParams")
        params = firearm.find("Params")
        mag = mod_params.get("roundsPerMagazine", "") if mod_params is not None else ""
        fire_mode_key = (
            params.get("operationInfoText", "") if params is not None else ""
        )

        weapons[name] = {
            "id": name,
            "category": firearm.get("category"),
            "tooltip": firearm.get("tooltip", ""),
            "description": firearm.get("description", ""),
            "img": firearm.get("img", ""),
            "magazine": mag,
            "fireModeKey": fire_mode_key.lstrip("@"),
            "hasSuppressor": f"{name}-SUP" in all_names
            or name in integrally_suppressed,
        }

    return weapons


def parse_skins(path: Path) -> dict[str, list[dict]]:
    """Parse gfl_skins.xml, return dict mapping class ID to list of skins."""
    tree = ET.parse(path)
    root = tree.getroot()

    # Build bind map: skin name -> class ID
    bind_map = {}
    for bind in root.findall("Bind"):
        eqp = bind.get("eqp")
        to_el = bind.find("to")
        if to_el is not None:
            bind_map[eqp] = to_el.get("name")

    # Build skin entries grouped by class
    skins_by_class: dict[str, list[dict]] = {}
    for scope in root.findall("Scope"):
        skin_name = scope.get("name")
        class_id = bind_map.get(skin_name)
        if class_id is None:
            continue

        render = scope.find("RenderObject3D")
        skin = {
            "id": skin_name,
            "tooltip": scope.get("tooltip", ""),
            "description": scope.get("description", ""),
            "img": scope.get("img", ""),
            "model": render.get("model") if render is not None else "",
            "diffuseTex": render.get("diffuseTex") if render is not None else "",
        }

        skins_by_class.setdefault(class_id, []).append(skin)

    return skins_by_class


def convert_portraits_dds(entities: dict[str, dict], out_dir: Path) -> dict[str, str]:
    """Convert _large portrait DDS files to PNG. Returns map of DDS path -> PNG filename."""
    portraits_dir = out_dir / "portraits"
    portraits_dir.mkdir(parents=True, exist_ok=True)

    converted = {}
    for class_id, ent in entities.items():
        dds_rel = ent["portrait"]  # e.g. "data/textures/portraits/gfl_an94.dds"
        dds_stem = Path(dds_rel).stem  # "gfl_an94"
        large_dds_name = f"{dds_stem}_large.dds"
        large_dds_path = MOD / "textures" / "portraits" / large_dds_name
        png_name = dds_stem + ".png"
        png_path = portraits_dir / png_name

        if dds_rel in converted:
            continue

        if png_path.exists() and png_path.stat().st_size > 0:
            converted[dds_rel] = png_name
            continue

        # Try _large first, fall back to normal
        dds_path = large_dds_path
        if not dds_path.exists():
            dds_path = MOD / dds_rel.replace("data/", "")
        if not dds_path.exists():
            print(f"  Warning: portrait not found: {dds_path}", file=sys.stderr)
            converted[dds_rel] = png_name
            continue

        try:
            subprocess.run(
                ["magick", str(dds_path), "-flip", str(png_path)],
                check=True,
                capture_output=True,
            )
            print(f"  Converted {dds_path.name} -> {png_name}")
        except FileNotFoundError:
            print(
                "  Warning: ImageMagick not found, skipping DDS conversion",
                file=sys.stderr,
            )
        except subprocess.CalledProcessError as e:
            print(
                f"  Warning: failed to convert {dds_path.name}: {e.stderr.decode()}",
                file=sys.stderr,
            )

        converted[dds_rel] = png_name

    return converted


def convert_skin_images_dds(
    skins_by_class: dict[str, list[dict]], out_dir: Path
) -> dict[str, str]:
    """Convert skin UI DDS files to PNG. Returns map of DDS path -> PNG filename."""
    skins_dir = out_dir / "skins"
    skins_dir.mkdir(parents=True, exist_ok=True)

    converted = {}
    for class_id, skins in skins_by_class.items():
        for skin in skins:
            dds_rel = skin["img"]
            if not dds_rel or dds_rel in converted:
                continue

            dds_path = MOD / dds_rel.replace("data/", "")
            png_name = skin["id"].lower() + ".png"
            png_path = skins_dir / png_name

            if png_path.exists() and png_path.stat().st_size > 0:
                converted[dds_rel] = png_name
                continue

            if not dds_path.exists():
                converted[dds_rel] = png_name
                continue

            try:
                subprocess.run(
                    ["magick", str(dds_path), "-flip", str(png_path)],
                    check=True,
                    capture_output=True,
                )
                print(f"  Converted {dds_path.name} -> {png_name}")
            except (FileNotFoundError, subprocess.CalledProcessError):
                pass

            converted[dds_rel] = png_name

    return converted


def convert_squad_icons(out_dir: Path) -> dict[str, str]:
    """Convert squad icon DDS files to PNG. Returns map of squad display name -> PNG path."""
    icons_dir = out_dir / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)

    src_dir = MOD / "textures" / "gui" / "deploy"
    converted = {}

    for dds_path in sorted(src_dir.glob("gfl_class_icon_*.dds")):
        png_name = dds_path.stem + ".png"
        png_path = icons_dir / png_name

        if png_path.exists() and png_path.stat().st_size > 0:
            converted[dds_path.stem] = f"data/icons/{png_name}"
            continue

        try:
            subprocess.run(
                ["magick", str(dds_path), "-flip", str(png_path)],
                check=True,
                capture_output=True,
            )
            print(f"  Converted {dds_path.name} -> {png_name}")
        except (FileNotFoundError, subprocess.CalledProcessError):
            pass

        converted[dds_path.stem] = f"data/icons/{png_name}"

    return converted


# Base-game fire mode keys that aren't in the mod's localisation
FIRE_MODE_FALLBACKS = {
    "firearm_operation_semifull_name": "Semi / Full Auto",
    "firearm_operation_semiauto_name": "Semi-Auto",
    "firearm_operation_fullauto_name": "Full Auto",
    "firearm_operation_pumpaction_name": "Pump Action",
    "firearm_operation_boltaction_name": "Bolt Action",
    "firearm_operation_doubleaction_name": "Double Action",
    "firearm_operation_melee": "Melee",
}


def resolve_fire_mode(key: str, loc: dict[str, str]) -> str:
    """Resolve a fire mode localisation key to a display string."""
    if not key:
        return ""
    return loc.get(key, FIRE_MODE_FALLBACKS.get(key, key))


def build_dolls_json():
    print("Parsing mod data...")

    loc = parse_localisation(MOD / "localization")
    entity_files = [MOD / "entities" / f"gfl_humans_{slug}.xml" for slug in SQUAD_ORDER]
    unit_files = [MOD / "units" / f"gfl_unit_{slug}.xml" for slug in SQUAD_ORDER]
    entities = parse_entities(entity_files)
    identities = parse_identities(MOD / "units" / "gfl_human_identities.xml")
    class_order = parse_classes(unit_files)
    weapons = parse_weapons(MOD / "equipment" / "gfl_weapons.xml")
    skins_by_class = parse_skins(MOD / "equipment" / "gfl_skins.xml")

    print(
        f"Found {len(entities)} entities, {len(identities)} identities, "
        f"{len(weapons)} weapons, {len(class_order)} classes"
    )

    OUT.mkdir(parents=True, exist_ok=True)

    print("\nConverting portraits from DDS...")
    dds_portrait_map = convert_portraits_dds(entities, OUT)

    print("\nConverting skin images from DDS...")
    dds_skin_map = convert_skin_images_dds(skins_by_class, OUT)

    print("\nConverting squad icons from DDS...")
    squad_icon_map = convert_squad_icons(OUT)

    # Build doll entries — class_order first, then any remaining entities
    dolls = []
    squads_seen = []
    all_class_ids = list(class_order)
    for cid in entities:
        if cid not in all_class_ids:
            all_class_ids.append(cid)

    for class_id in all_class_ids:
        if class_id not in entities:
            print(
                f"  Warning: class {class_id} has no entity definition", file=sys.stderr
            )
            continue

        ent = entities[class_id]
        ident = identities.get(class_id, {})
        custom_name = ident.get("customName", class_id)
        squad = ident.get("squad", None)
        squad_display = loc.get(f"{squad}-NAME", squad) if squad else "UNKNOWN"

        if squad_display not in squads_seen and squad_display != "UNKNOWN":
            squads_seen.append(squad_display)

        # Resolve weapon from equipment list
        weapon_id = None
        for item in ent["equipment"]:
            if item.startswith("GFL-WEAP-"):
                weapon_id = item
                break

        weapon_data = weapons.get(weapon_id, {})
        weapon_name_key = weapon_data.get("tooltip", "").lstrip("@")

        # Resolve localised strings
        doll_name_key = f"DOLL-{class_id.replace('GFL-DOLL-', '')}-NAME"
        doll_desc_key = f"DOLL-{class_id.replace('GFL-DOLL-', '')}-DESC"

        # Build skin list with descriptions
        skins = []
        for skin in skins_by_class.get(class_id, []):
            skin_name_key = skin["tooltip"].lstrip("@")
            skin_desc_key = skin["description"].lstrip("@")

            skin_png = dds_skin_map.get(skin["img"], "")
            skin_img = f"data/skins/{skin_png}" if skin_png else ""

            skins.append(
                {
                    "id": skin["id"],
                    "name": loc.get(skin_name_key, skin["id"]),
                    "description": loc.get(skin_desc_key, ""),
                    "img": skin_img,
                    "model": skin["model"],
                    "diffuseTex": skin["diffuseTex"],
                }
            )

        # Resolve portrait
        portrait_png = dds_portrait_map.get(ent["portrait"], "")
        portrait_path = f"data/portraits/{portrait_png}" if portrait_png else ""

        doll = {
            "id": class_id,
            "bitIndex": ent["bitIndex"],
            "entityName": ent["entityName"],
            "name": loc.get(doll_name_key, custom_name),
            "description": loc.get(doll_desc_key, ""),
            "squad": loc.get(f"{squad}-NAME", squad) if squad else "UNKNOWN",
            "portrait": portrait_path,
            "health": ent["health"],
            "moveSpeed": ent["moveSpeed"],
            "voicePack": ent["voicePack"],
            "weapon": {
                "id": weapon_id or "",
                "name": loc.get(weapon_name_key, weapon_id or ""),
                "category": weapon_data.get("category", ""),
                "magazine": weapon_data.get("magazine", ""),
                "fireMode": resolve_fire_mode(weapon_data.get("fireModeKey", ""), loc),
                "hasSuppressor": weapon_data.get("hasSuppressor", False),
            },
            "skins": skins,
            "entity": {
                "name": ent["entityName"],
                "idName": ent["idName"],
                "portrait": ent["portrait"],
                "gender": ent["gender"],
                "voicePack": ent["voicePack"],
                "model": ent["model"],
                "diffuseTex": ent["diffuseTex"],
                "health": str(ent["health"]),
                "moveSpeed": str(ent["moveSpeed"]),
                "moveSpeedMin": str(ent["moveSpeedMin"]),
                "moveSpeedMax": str(ent["moveSpeedMax"]),
                "turnSpeed": str(ent["turnSpeed"]),
                "turnSpeedMin": str(ent["turnSpeedMin"]),
                "turnSpeedMax": str(ent["turnSpeedMax"]),
                "fovDegrees": ent["fovDegrees"],
                "fovDistance": ent["fovDistance"],
                "fovEyeRadius": ent["fovEyeRadius"],
                "suppressionRecovery": ent["suppressionRecovery"],
                "equipment": ent["equipment"],
                "doctrines": ent["doctrines"],
            },
        }

        dolls.append(doll)

    # Scan backgrounds directory
    bg_dir = ROOT / "www" / "unit-builder" / "app" / "backgrounds"
    backgrounds = (
        sorted(f"backgrounds/{p.name}" for p in bg_dir.glob("*.png") if p.is_file())
        if bg_dir.exists()
        else []
    )
    print(f"\nFound {len(backgrounds)} background images")

    # Build squad icon map: squad display name -> icon path
    # Icon filenames are gfl_class_icon_{slug} where slug comes from unit ID
    squad_icons = {}
    for class_id, ident in identities.items():
        squad_unit = ident.get("squadUnit")
        if not squad_unit:
            continue
        squad_display = loc.get(f"{squad_unit}-NAME", squad_unit)
        if squad_display in squad_icons:
            continue
        # e.g. GFL-UNIT-DEFY -> defy, GFL-UNIT-ELMOCE -> elmoce
        slug = squad_unit.replace("GFL-UNIT-", "").lower()
        icon_key = f"gfl_class_icon_{slug}"
        if icon_key in squad_icon_map:
            squad_icons[squad_display] = squad_icon_map[icon_key]

    # Build version string
    build_date = date.today().isoformat()
    try:
        git_hash = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=ROOT,
        ).stdout.strip()
    except (FileNotFoundError, subprocess.CalledProcessError):
        git_hash = "unknown"
    version = f"{build_date} ({git_hash})"
    print(f"\nVersion: {version}")

    result = {
        "version": version,
        "dolls": dolls,
        "squads": squads_seen,
        "squadIcons": squad_icons,
        "backgrounds": backgrounds,
    }

    out_file = OUT / "dolls.json"
    out_file.write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"\nWrote {len(dolls)} dolls to {out_file}")


if __name__ == "__main__":
    build_dolls_json()
