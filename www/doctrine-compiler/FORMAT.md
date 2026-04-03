# Doctrine KDL Format

The doctrine compiler takes `.kdl` files describing doctrine tree layouts and compiles them to DK2 GUI XML.

## Structure

A doctrine file defines a grid of panels containing nodes and connectors:

```kdl
grid columns=3 unit="MyUnit" {
    panel title="@loc_key" columns=2 rows=4 {
        node "NodeName" col=0 row=0
        node "OtherNode" col=1 row=1
        edge "NodeName" "OtherNode"
    }
}
```

## Grid

The top-level `grid` defines the outer panel layout and the unit it belongs to.

```kdl
grid columns=3 unit="GFL-UNIT-DEFY" {
    // panels go here
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `columns` | yes | Number of columns in the panel grid |
| `unit` | yes | Unit name (used for `#UnitName_DoctrineTree`) |
| `inactive-color` | no | Connector inactive colour (default `716b5f`) |
| `active-color` | no | Connector active colour (default `f97b03`) |
| `panel-bg-color` | no | Default panel background colour (default `211e1d80`) |
| `title-color` | no | Panel title text colour (default `f0e3cc`) |

Panels flow left-to-right and wrap to the next row automatically, following [CSS grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout) auto-flow rules. Panels in the same row stretch to match the tallest panel's height.

## Panel

Panels are rectangular containers for doctrine nodes.

```kdl
panel title="@menu_doctrine_branch_calibration" columns=2 rows=4 {
    // anchors, nodes, edges
}
```

| Property | Required | Default | Description |
|----------|----------|---------|-------------|
| `title` | yes | | Localisation key for the title text |
| `columns` | yes | | Number of columns in the node grid |
| `rows` | yes | | Number of rows in the node grid |
| `colspan` | no | `1` | Number of outer grid columns to span |
| `rowspan` | no | `1` | Number of outer grid rows to span |
| `bg-color` | no | grid `panel-bg-color` | Background colour override |
| `title-bar-height` | no | `72` | Title bar height in pixels |
| `title-bar-color` | no | `211e1d40` | Title bar background colour |
| `title-font` | no | `header_3` | Title font (`header_2` enables auto-downsize) |

### Grid layout examples

```
// 3 equal panels + full-width below
grid columns=3 {
    panel ...                        // col 0
    panel ...                        // col 1
    panel ...                        // col 2
    panel ... colspan=3              // spans all 3
}

+--------+--------+--------+
|   P1   |   P2   |   P3   |
+--------+--------+--------+
|       P4 (colspan=3)     |
+--------------------------+

// rowspan
grid columns=2 {
    panel ... rowspan=2              // col 0, rows 0-1
    panel ...                        // col 1, row 0
    panel ...                        // col 1, row 1
}

+--------+--------+
|        |   P2   |
|   P1   +--------+
|        |   P3   |
+--------+--------+
```

## Node

Nodes are doctrine buttons placed on the panel's internal grid.

```kdl
node "GFL_LethalPrecision" col=0 row=0
```

The first argument is the node name (must match the doctrine node definition in your doctrine XML). `col` and `row` are zero-indexed positions in the panel's grid.

Fractional `col` values centre between columns:

```kdl
// centred between columns 0 and 1 in a 2-column panel
node "GFL_SuppressionProtocols" col=0.5 row=3
```

## Edge

Edges define connectors between nodes. The compiler determines the connector type (vertical, horizontal, branching, T-junction) from the relative positions of the connected nodes.

```kdl
edge "ParentNode" "ChildNode"
```

The first argument is the parent (where the connector starts), the second is the child (where the arrow points). Both nodes must be in the same panel.

**Note:** Horizontal connectors (same-row edges) use `gfl_doctrine_horizontal_arrow.dds` for the arrowhead. This texture is not included in the base game. DK2 does not support arbitrary rotation, so the vertical arrow cannot be reused. You can [download the texture here](https://github.com/antistrategie/girl-kickers/blob/main/mod/textures/gui/doctrines/gfl_doctrine_horizontal_arrow.dds) and place it at `data/textures/gui/doctrines/` in your mod. If you don't have this texture, avoid same-row edges or accept connectors without arrowheads.

## Anchor

Anchors position decorations within a panel using percentage-based coordinates relative to the panel's top-left corner.

```kdl
anchor x="0%" y="100%" {
    decor "data/textures/gui/square.tga" width="100%" height=8 color="E4E4E480"
}
```

| Property | Required | Description |
|----------|----------|-------------|
| `x` | yes | Horizontal position as percentage of panel width |
| `y` | yes | Vertical position as percentage of panel height |

`x="0%"` is the left edge, `x="100%"` is the right edge. `y="0%"` is the top, `y="100%"` is the bottom.

Decorations with known dimensions are automatically clamped to stay within the panel bounds.

## Decor

Decors are rendered elements inside an anchor. They map to DK2's `StaticImage > RenderObject2D`.

```kdl
decor "data/textures/gui/square.tga" width="100%" height=8 color="E4E4E480"
```

The first argument is the texture path.

| Property | Required | Default | Description |
|----------|----------|---------|-------------|
| `x` | no | `0` | Pixel offset from anchor (positive = right) |
| `y` | no | `0` | Pixel offset from anchor (positive = down) |
| `width` | no | | Width: pixels (number) or percentage of panel width (string) |
| `height` | no | | Height: pixels (number) or percentage of panel height (string) |
| `color` | no | | Colour tint (hex, e.g. `E4E4E480`) |
| `flip-x` | no | | Mirror horizontally (`"true"`) |

Multiple decors in one anchor share the same anchor point, useful for grouped elements:

```kdl
// 3 stars, offset by fixed pixel amounts from the same anchor
anchor x="16%" y="10%" {
    decor "data/textures/gui/missions/pack_stars.tga"
    decor "data/textures/gui/missions/pack_stars.tga" x=50 color="f0e3cc"
    decor "data/textures/gui/missions/pack_stars.tga" x=100 color="f0e3cc"
}
```

## Full example

```kdl
grid columns=3 unit="GFL-UNIT-DEFY" {
    panel title="@menu_doctrine_branch_calibration" columns=2 rows=4 {
        anchor x="0%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" \
                width=190 height=75 color="0c0b0b33"
        }
        anchor x="100%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" \
                width=190 height=75 color="0c0b0b33" flip-x="true"
        }

        node "GFL_LethalPrecision" col=0 row=0
        node "GFL_CQCProtocols" col=1 row=0
        node "GFL_RapidDeployment" col=0 row=1
        node "GFL_OverwhelmingForce" col=1 row=1
        node "GFL_WeaponTransition" col=0 row=2
        node "GFL_CombatEfficiency" col=1 row=2
        node "GFL_SuppressionProtocols" col=0.5 row=3

        edge "GFL_CQCProtocols" "GFL_OverwhelmingForce"
        edge "GFL_RapidDeployment" "GFL_WeaponTransition"
        edge "GFL_RapidDeployment" "GFL_CombatEfficiency"
    }

    panel title="@menu_doctrine_level_vet" colspan=3 columns=4 rows=1 \
        title-bar-height=90 title-bar-color="E4E4E480" title-font="header_2" {

        anchor x="0%" y="100%" {
            decor "data/textures/gui/square.tga" width="100%" height=8 color="E4E4E480"
        }

        node "GFL_DEFY_TacticalIndependence" col=0 row=0
        node "GFL_DEFY_SquadDefiance" col=1 row=0
        node "GFL_DEFY_BattlefieldEchoes" col=2 row=0
        node "GFL_DEFY_ViolentMomentum" col=3 row=0

        edge "GFL_DEFY_TacticalIndependence" "GFL_DEFY_SquadDefiance"
    }
}
```

## CLI usage

```bash
# single file
bun www/doctrine-compiler/src/cli.ts doctrines/defy.kdl -o mod/gui/gfl_doctrine.xml

# multiple files combined into one XML
bun www/doctrine-compiler/src/cli.ts doctrines/*.kdl -o mod/gui/gfl_doctrine.xml
```
