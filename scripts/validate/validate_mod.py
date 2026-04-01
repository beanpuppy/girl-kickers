#!/usr/bin/env python3
"""Validate the mod's XML cross-references, localisation, voice files, and file paths.

Uses basegame_manifest.json to distinguish mod files from base game assets.
Run generate_basegame_manifest.py to regenerate the manifest when DK2 updates.
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent.parent
MOD = ROOT / "mod"
MANIFEST = SCRIPT_DIR / "basegame_manifest.json"

errors = []


def error(msg):
    errors.append(msg)
    print(f"  \033[31m✗ {msg}\033[0m")


def ok(msg):
    print(f"  \033[32m✓\033[0m {msg}")


def parse_xml(path):
    try:
        return ET.parse(path)
    except ET.ParseError as e:
        error(f"Failed to parse {path.relative_to(MOD)}: {e}")
        return None


def collect_all(pattern):
    return sorted(MOD.glob(pattern))


def load_manifest():
    if not MANIFEST.exists():
        print(f"Warning: {MANIFEST} not found, base game checks will be skipped")
        return set(), set(), set()
    data = json.loads(MANIFEST.read_text())
    return (
        set(data.get("files", [])),
        set(data.get("loc_keys", [])),
        set(data.get("equipment", [])),
    )


def main():
    print("\nValidating mod...\n")

    basegame_files, basegame_loc_keys, basegame_equipment = load_manifest()

    # ══════════════════════════════════════════════
    # Collect all definitions from all XMLs
    # ══════════════════════════════════════════════

    # Tags that are structural/container — their `name` attr is NOT an equipment ID
    SKIP_TAGS = {
        "Unit",
        "Class",
        "Entity",
        "Human",
        "Id",
        "Pack",
        "Sound",
        "Path",
        "Item",
        "Action",
        "Bind",
        "Node",
        "to",
        "eqp",
        "Equip",
        "Unequip",
        "Fire",
        "Reload",
        "ReloadEmpty",
        "ShellDrop",
        "Empty",
    }

    units = {}  # unit_name -> set of class_names
    weapons = {}  # weapon_name -> {attack_types, suppressed_switch}
    weapon_binds = {}  # weapon_name -> set of bound item names
    attack_type_defs = set()
    all_equipment = set()
    voice_packs = set()
    skin_class_binds = {}  # skin_name -> set of class_names

    print("Scanning all mod XMLs...")
    for path in collect_all("**/*.xml"):
        tree = parse_xml(path)
        if not tree:
            continue

        # Units and classes
        for unit_el in tree.iter("Unit"):
            unit_name = unit_el.get("name")
            if not unit_name:
                continue
            classes = set()
            for cls in unit_el.iter("Class"):
                cls_name = cls.get("name")
                if cls_name:
                    classes.add(cls_name)
            units[unit_name] = classes

        # Weapons and weapon binds
        for firearm in tree.iter("Firearm"):
            name = firearm.get("name")
            if not name:
                continue
            at_names = set()
            for at in firearm.iter("AttackType"):
                at_name = at.get("name")
                if at_name:
                    at_names.add(at_name)
            sup = firearm.get("suppressedSwitch")
            weapons[name] = {"attack_types": at_names, "suppressed_switch": sup}

        # Bind elements (weapon binds and skin binds)
        for bind in tree.iter("Bind"):
            eqp = bind.get("eqp")
            to_names = {to.get("name") for to in bind.iter("to") if to.get("name")}
            if eqp and to_names:
                # Weapon bind (eqp -> to items)
                weapon_binds[eqp] = to_names
            if eqp:
                # Skin bind (eqp -> to classes)
                # If bind has <to> children with class-like names, track as skin bind
                for to in bind.iter("to"):
                    to_name = to.get("name")
                    if to_name and to_name.startswith("GFL-DOLL-"):
                        skin_class_binds.setdefault(eqp, set()).add(to_name)

        # Attack type definitions (have ModifiableParams children, not inside Firearm)
        for at in tree.iter("AttackType"):
            name = at.get("name")
            if name and at.find("ModifiableParams") is not None:
                attack_type_defs.add(name)

        # Equipment definitions (any named element not in skip list)
        for el in tree.iter():
            if el.tag not in SKIP_TAGS:
                name = el.get("name")
                if name:
                    all_equipment.add(name)

        # Voice packs
        for pack in tree.iter("Pack"):
            name = pack.get("name")
            if name:
                voice_packs.add(name)

    all_classes = set()
    for cls_set in units.values():
        all_classes.update(cls_set)

    mod_equipment_count = len(all_equipment)

    # Add base game definitions
    all_equipment.update(basegame_equipment)

    ok(f"Found {len(units)} units with {sum(len(c) for c in units.values())} classes")
    ok(f"Found {len(weapons)} weapons, {len(attack_type_defs)} attack types")
    ok(f"Found {mod_equipment_count} equipment definitions")
    ok(f"Found {len(voice_packs)} voice packs")

    # ══════════════════════════════════════════════
    # Validate cross-references
    # ══════════════════════════════════════════════

    print("\n\033[1mValidating entities...\033[0m")
    ent_errors_before = len(errors)
    for path in collect_all("entities/gfl_humans*.xml"):
        tree = parse_xml(path)
        if not tree:
            continue
        fname = path.relative_to(MOD)
        for entity in tree.iter("Entity"):
            entity_name = entity.get("name", "?")
            human = entity.find(".//Human")
            if human is None:
                continue

            unit_ref = human.get("unit")
            if unit_ref and unit_ref not in units:
                error(
                    f"{fname}: Entity '{entity_name}' references unknown unit '{unit_ref}'"
                )

            class_ref = human.get("class")
            if class_ref and unit_ref:
                if unit_ref in units and class_ref not in units[unit_ref]:
                    error(
                        f"{fname}: Entity '{entity_name}' references class '{class_ref}' not in unit '{unit_ref}'"
                    )

            id_el = human.find("Id")
            if id_el is not None:
                vp = id_el.get("voicePack")
                if vp and vp not in voice_packs:
                    error(
                        f"{fname}: Entity '{entity_name}' references unknown voice pack '{vp}'"
                    )

            for item in human.iter("Item"):
                item_name = item.get("name")
                if item_name and item_name not in all_equipment:
                    error(
                        f"{fname}: Entity '{entity_name}' references unknown equipment '{item_name}'"
                    )
    if len(errors) == ent_errors_before:
        ok("All entity references are valid")

    print("\n\033[1mValidating weapon attack types...\033[0m")
    at_errors_before = len(errors)
    for weapon_name, info in weapons.items():
        for at_name in info["attack_types"]:
            if at_name not in attack_type_defs:
                error(
                    f"Weapon '{weapon_name}' references undefined attack type '{at_name}'"
                )
        sup = info.get("suppressed_switch")
        if sup and sup not in weapons:
            error(f"Weapon '{weapon_name}' suppressedSwitch '{sup}' not found")
    if len(errors) == at_errors_before:
        ok("All weapon attack types are defined")

    print("\n\033[1mValidating weapon binds...\033[0m")
    wb_errors_before = len(errors)
    for weapon_name, bound_items in weapon_binds.items():
        for item_name in bound_items:
            if item_name not in all_equipment:
                error(
                    f"Weapon '{weapon_name}' bind references unknown item '{item_name}'"
                )
    if len(errors) == wb_errors_before:
        ok("All weapon bind references are valid")

    print("\n\033[1mValidating equipment binds...\033[0m")
    eb_errors_before = len(errors)
    for path in collect_all("equipment/gfl_binds.xml"):
        tree = parse_xml(path)
        if not tree:
            continue
        for bind in tree.iter("Bind"):
            class_ref = bind.get("to")
            if class_ref and class_ref not in all_classes:
                error(f"Equipment bind references unknown class '{class_ref}'")
            for eqp in bind.iter("eqp"):
                eqp_name = eqp.get("name")
                if eqp_name and eqp_name not in all_equipment:
                    error(
                        f"Equipment bind for '{class_ref}' references unknown item '{eqp_name}'"
                    )
    if len(errors) == eb_errors_before:
        ok("All equipment binds are valid")

    print("\n\033[1mValidating skin binds...\033[0m")
    sb_errors_before = len(errors)
    for skin_name, class_refs in skin_class_binds.items():
        if skin_name not in all_equipment:
            error(f"Skin bind for '{skin_name}' but no skin definition found")
        for class_ref in class_refs:
            if class_ref not in all_classes:
                error(f"Skin '{skin_name}' bound to unknown class '{class_ref}'")
    if len(errors) == sb_errors_before:
        ok("All skin binds are valid")

    print("\n\033[1mValidating deploy screen...\033[0m")
    dp_errors_before = len(errors)
    for path in collect_all("gui/gfl_deploy*.xml"):
        tree = parse_xml(path)
        if not tree:
            continue
        fname = path.relative_to(MOD)
        for item in tree.iter("Item"):
            name = item.get("name")
            if name and name.startswith("GFL-UNIT-"):
                if name not in units:
                    error(f"{fname}: Deploy references unknown unit '{name}'")
    if len(errors) == dp_errors_before:
        ok("All deploy references are valid")

    # ══════════════════════════════════════════════
    # File references
    # ══════════════════════════════════════════════

    print("\n\033[1mValidating file references...\033[0m")
    file_ref_count = 0
    fr_errors_before = len(errors)
    for path in collect_all("**/*.xml"):
        tree = parse_xml(path)
        if not tree:
            continue
        for el in tree.iter():
            for attr in ["model", "diffuseTex", "iconTex", "img"]:
                ref = el.get(attr)
                if ref and ref.startswith("data/"):
                    file_ref_count += 1
                    mod_path = MOD / ref.replace("data/", "")
                    if mod_path.exists():
                        continue
                    if ref in basegame_files:
                        continue
                    error(
                        f"{path.relative_to(MOD)}: Missing file '{ref}' (not in mod or base game)"
                    )
    if len(errors) == fr_errors_before:
        ok(f"All {file_ref_count} file references are valid")

    # ══════════════════════════════════════════════
    # Voice files
    # ══════════════════════════════════════════════

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

    print("\n\033[1mValidating voice files...\033[0m")
    vf_errors_before = len(errors)
    for path in collect_all("sounds/gfl_voice_lines_*.xml"):
        fname = path.relative_to(MOD)
        content = path.read_text()

        for pack_match in re.finditer(
            r'<Pack name="([^"]+)"[^>]*>(.*?)</Pack>', content, re.DOTALL
        ):
            pack_name = pack_match.group(1)
            pack_content = pack_match.group(2)

            sound_ids = re.findall(r'<Sound ID="([^"]+)">', pack_content)
            for sid in set(sound_ids) - VALID_SOUND_IDS:
                error(f"{fname}: Pack '{pack_name}' has invalid sound ID '{sid}'")
            for sid in VALID_SOUND_IDS - set(sound_ids):
                error(f"{fname}: Pack '{pack_name}' is missing sound ID '{sid}'")
            for sid in set(sound_ids):
                if sound_ids.count(sid) > 1:
                    error(f"{fname}: Pack '{pack_name}' has duplicate sound ID '{sid}'")

        for voice_path in re.findall(r'name="(data/sounds/voice/[^"]+)"', content):
            if len(voice_path) > 124:
                error(
                    f"{fname}: Voice path exceeds 124 chars ({len(voice_path)}): {voice_path}"
                )
            local_path = MOD / voice_path.replace("data/", "")
            if not local_path.exists():
                error(f"{fname}: Missing voice file '{voice_path}'")

    if len(errors) == vf_errors_before:
        ok("All voice files are valid")

    # ══════════════════════════════════════════════
    # Localisation
    # ══════════════════════════════════════════════

    print("\n\033[1mValidating localisation...\033[0m")
    loc_errors_before = len(errors)

    loc_file = MOD / "localization" / "gfl_game.txt"
    if loc_file.exists():
        xml_keys = set()
        key_pattern = re.compile(r'"(@[a-zA-Z0-9_#-]+)"')
        for xml_dir in ["action_waypoints", "entities", "equipment", "gui", "units"]:
            xml_path = MOD / xml_dir
            if not xml_path.exists():
                continue
            for xml_file in xml_path.rglob("*.xml"):
                xml_keys.update(
                    key_pattern.findall(xml_file.read_text(encoding="utf-8"))
                )

        loc_keys = {}
        for i, line in enumerate(loc_file.read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line.startswith("@"):
                continue
            match = re.match(r"(@[a-zA-Z0-9_#-]+)\s*=", line)
            if match:
                key = match.group(1)
                if key in loc_keys:
                    error(
                        f"Duplicate localisation key '{key}' (lines {loc_keys[key]} and {i})"
                    )
                loc_keys[key] = i
        loc_key_set = set(loc_keys.keys())

        for key in sorted(xml_keys - loc_key_set):
            if key in basegame_loc_keys:
                continue
            error(f"Localisation key '{key}' used in XML but missing from gfl_game.txt")

        for key in sorted(loc_key_set - xml_keys):
            error(
                f"Localisation key '{key}' in gfl_game.txt but not used in any XML (line {loc_keys[key]})"
            )
    else:
        error("Localisation file not found: localization/gfl_game.txt")

    if len(errors) == loc_errors_before:
        ok("All localisation keys are valid")

    # ══════════════════════════════════════════════
    # Summary
    # ══════════════════════════════════════════════

    print(f"\n{'=' * 50}")
    if errors:
        print(f"\033[31m✗ {len(errors)} error(s) found\033[0m")
        sys.exit(1)
    else:
        print("\033[32m✓ All mod validation passed!\033[0m")


if __name__ == "__main__":
    main()
