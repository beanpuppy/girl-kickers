#!/usr/bin/env python3
"""
Script to generate deploy screen GUI from unit definitions.

Reads unit definitions from mod/units/gfl_unit_*.xml (one file per squad) and
generates base unit deploy screens (gfl_deploy.xml).

Layout rules:
- Units with ≤4 dolls: Single column (380px wide)
- Units with >4 dolls: Two columns (178px each)

Usage:
    python generate_deploy.py
"""

import re
from pathlib import Path


def extract_unit_data(unit_xml_path):
    """Extract unit information including class count and colors."""
    with open(unit_xml_path, "r", encoding="utf-8") as f:
        content = f.read()

    units = []

    unit_pattern = r'<Unit\s+name="(GFL-UNIT-[^"]+)"[^>]*flagColor="([^"]+)"[^>]*>.*?<Classes>(.*?)</Classes>'
    matches = re.findall(unit_pattern, content, re.DOTALL)

    for unit_name, flag_color, classes_block in matches:
        class_pattern = r'<Class\s+name="(GFL-DOLL-[^"]+)"'
        classes = re.findall(class_pattern, classes_block)

        units.append(
            {
                "name": unit_name,
                "flag_color": flag_color,
                "classes": classes,
                "count": len(classes),
            }
        )

    return units


def generate_class_item(
    class_name,
    x_origin,
    y_origin,
    slot_num,
    width,
    flag_color,
    indent=" ",
):
    """Generate a single class item for the deploy screen."""

    template = f'''{indent}<StaticImage name="{class_name}" origin="{x_origin} {y_origin}">
{indent}    <RenderObject2D
{indent}            texture="data/textures/gui/square.tga"
{indent}            sizeX="{width}"
{indent}            sizeY="148"
{indent}            color="211e1dcc"
{indent}        />
{indent}    <StaticImage name="#ClassHeader" origin="0 0" align="t">
{indent}        <RenderObject2D
{indent}                texture="data/textures/gui/square.tga"
{indent}                sizeX="{width}"
{indent}                sizeY="46"
{indent}                color="4B4B4B"
{indent}            />
{indent}    </StaticImage>
{indent}    <StaticImage origin="0 0" align="lt">
{indent}        <RenderObject2D
{indent}                texture="data/textures/gui/deploy/deploy_class_diagonalbars.dds"
{indent}                color="0c0b0b33"
{indent}            />
{indent}    </StaticImage>
{indent}    <StaticImage origin="-16 0" align="lt">
{indent}        <RenderObject2D
{indent}                texture="data/textures/gui/square.tga"
{indent}                sizeX="8"
{indent}                sizeY="148"
{indent}                color="{flag_color}"
{indent}            />
{indent}    </StaticImage>
{indent}    <StaticText
{indent}            name="#ClassName"
{indent}            origin="-6 50"
{indent}            text=""
{indent}            align="r"
{indent}            font="header_4"
{indent}            textColor="211e1d"
{indent}        />
{indent}    <StaticImage name="#ClassIcon" origin="8 50" align="l">
{indent}        <RenderObject2D
{indent}                texture="data/textures/gui/deploy/class_name_icon_assaulter.dds"
{indent}            />
{indent}    </StaticImage>
{indent}    <Item origin="-2 -25">
{indent}        <StaticImage name="#slot{slot_num}" origin="0 0">
{indent}            <RenderObject2D
{indent}                    texture="data/textures/gui/deploy/deploy_trooperbackground_01.tga"
{indent}                />
{indent}        </StaticImage>
{indent}    </Item>
{indent}</StaticImage>
'''
    return template


def generate_unit_item(unit, indent=""):
    """Generate a complete unit item for base deploy screen."""

    unit_name = unit["name"]
    flag_color = unit["flag_color"]
    classes = unit["classes"]
    count = unit["count"]

    # Determine layout
    use_two_columns = count > 4
    width = 178 if use_two_columns else 380

    # Start unit item
    output = f'''
{indent}<EventActionBatch name="GAME_GUI_LOADTIME_ACTIONS">
{indent}    <Action type="Show" target="{unit_name}" />
{indent}</EventActionBatch>

{indent}<Item name="{unit_name}" origin="0 -312" hidden="true" align="rt" sizeX="380">
{indent}    <OnOpen>
{indent}        <Action type="AddMeToParent" target="#unit_header" />
{indent}    </OnOpen>

'''

    slot_num = 0
    for i, class_name in enumerate(classes):
        if use_two_columns:
            row = i // 2
            col = i % 2
            x_origin = -101 if col == 0 else 100
            y_origin = -74 + (row * -160)
        else:
            x_origin = 0
            y_origin = -74 + (i * -160)

        output += generate_class_item(
            class_name,
            x_origin,
            y_origin,
            slot_num,
            width,
            flag_color,
            indent=indent + " ",
        )
        output += "\n"
        slot_num += 1

    output += f"{indent}</Item>\n"

    return output


def generate_base_deploy(units, output_path):
    """Generate gfl_deploy.xml for base units."""
    output = "<GUIItems>"

    for unit in units:
        output += generate_unit_item(unit)

    output += "</GUIItems>"

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output)


def main():
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent

    # Canonical squad order — must match SQUAD_ORDER in www/unit-builder/build_data.py
    # so the deploy screen and URL hash bit indices agree.
    squad_order = ["girl", "defy", "404", "cafe", "groza", "elmoce", "frost", "monsoon", "pol03", "arteam"]
    units_dir = project_dir / "mod" / "units"
    unit_files = [units_dir / f"gfl_unit_{slug}.xml" for slug in squad_order]
    deploy_output = project_dir / "mod" / "gui" / "gfl_deploy.xml"

    print("=== Generating Deploy Screens ===\n")

    units = []
    for unit_file in unit_files:
        print(f"Reading units from: {unit_file}")
        units.extend(extract_unit_data(unit_file))

    print(f"\nFound {len(units)} units:")
    for unit in units:
        layout = "2-column" if unit["count"] > 4 else "1-column"
        print(
            f"  {unit['name']}: {unit['count']} dolls ({layout}), color={unit['flag_color']}"
        )

    print(f"\nGenerating base deploy screen: {deploy_output}")
    generate_base_deploy(units, deploy_output)


if __name__ == "__main__":
    main()
