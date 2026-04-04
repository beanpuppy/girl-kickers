# DK2 Doctrine GUI XML Reference

Reference for how DK2's doctrine screen GUI XML works. Used by Doctgen (`www/doctgen/`).

## File Structure

A doctrine GUI XML file (`<GUIItems>`) contains:

1. **Doctrine Screen** - shared screen chrome (back/reset buttons, points display, blur background)
2. **Doctrine Trees** - one per unit (`#UnitName_DoctrineTree`), containing panels, nodes, and connectors
3. **Tooltip** - shared tooltip template for hovering over nodes

## Screen Chrome

```xml
<Item name="Doctrine_Screen" sizeX="1290" sizeY="1380" hidden="true">
```

The screen is 1290x1380 pixels. It handles:
- Blur background overlay
- Click-to-close on background
- Escape/Space to close
- Doctrine points display (top-right)
- Back button (bottom-left)
- Reset button (bottom-right)

This is identical for all units and never needs customisation.

## Doctrine Tree

```xml
<Item name="#UnitName_DoctrineTree" align="i" hidden="true">
```

The name must be `#UnitName_DoctrineTree` where `UnitName` matches the unit name from your unit XML (e.g. `Rangers`, `CIA`). Game code adds this as a child to `#DoctrineTree_Parent`.

### Button Template

Each tree contains a hidden button template that the game clones onto every node:

```xml
<Button name="#template_doctrine_button" hidden="true">
    <RenderObject2D texture=".../doctrine_empty_normal.dds"/>
    <OnHover>
        <RenderObject2D texture=".../doctrine_empty_hover.dds"/>
    </OnHover>
    <OnClick>
        <Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_SELECT"/>
    </OnClick>
    <OnRClickDown>
        <Action type="TriggerEvent" target="GUI_GAME_DOCTRINE_REMOVE"/>
    </OnRClickDown>
    <StaticImage name="#doctrinenode_disabled">...</StaticImage>
    <StaticImage name="#doctrinenode_full">...</StaticImage>
    <StaticImage name="#doctrinenode_active">...</StaticImage>
    <Item name="#doctrinenode_does_not_pass_requirements" hidden="true"/>
    <StaticImage name="#doctrinenode_num_levels_bg">...</StaticImage>
</Button>
```

This is identical for all units. The game replaces textures based on the doctrine node's `texturePrefix`.

## Panels

Panels are rectangular containers that hold groups of doctrine nodes. Each panel has:
- A background rectangle
- A background image (decorative, low opacity)
- A title bar with diagonal bar decorations
- A title text (localisation key)

### Standard Panel

```xml
<Item name="panelName" align="lt" sizeX="400" sizeY="780" origin="20 -70">
    <StaticImage origin="0 0" align="lt">
        <!-- main background -->
        <RenderObject2D texture=".../square.tga" sizeX="400" sizeY="780" color="211e1d80"/>
        <!-- decorative background image -->
        <StaticImage origin="0 0" align="lt">
            <RenderObject2D texture=".../rangers_bg_01.dds" sizeX="400" sizeY="490" color="0000004d"/>
        </StaticImage>
        <!-- title bar background -->
        <StaticImage origin="0 0" align="lt">
            <RenderObject2D texture=".../square.tga" sizeX="400" sizeY="72" color="211e1d40"/>
        </StaticImage>
        <!-- diagonal bars (left) -->
        <StaticImage origin="0 0" align="lt">
            <RenderObject2D texture=".../deploy_class_diagonalbars.dds" sizeX="190" sizeY="75" color="0c0b0b33"/>
        </StaticImage>
        <!-- diagonal bars (right, flipped) -->
        <StaticImage origin="0 0" align="rt">
            <RenderObject2D texture=".../deploy_class_diagonalbars.dds" flipX="true" sizeX="190" sizeY="75" color="0c0b0b33"/>
        </StaticImage>
        <!-- title text -->
        <Item sizeX="400" sizeY="72" align="lt">
            <StaticText text="@localisation_key" font="header_3" fontAutoDownsize="false" textColor="f0e3cc"/>
        </Item>
    </StaticImage>

    <!-- nodes go here -->
</Item>
```

Panel width and height are explicitly set. There is no automatic sizing - both values must be chosen to fit the content. Common widths: 350px, 400px, 500px. Common heights: 780px, 1170px.

Panel `align` determines position relative to the screen:
- `lt` = left-top (leftmost panel)
- `t` = top centre (middle panel)
- `rt` = right-top (rightmost panel)

### Elite/Vet Panel

Full-width panels with a different visual style. Has border lines, star decorations, and a larger title.

```xml
<Item name="vet" align="l" origin="20 -380" sizeX="1250" sizeY="400">
    <StaticImage origin="0 0" align="lt">
        <!-- main background -->
        <RenderObject2D texture=".../square.tga" sizeX="1250" sizeY="400" color="211e1d80"/>
        <!-- decorative bg -->
        <RenderObject2D texture=".../rangers_bg_01.dds" sizeX="1250" sizeY="290" color="00000080"/>
        <!-- title bar (accent colour varies per unit) -->
        <RenderObject2D texture=".../square.tga" sizeX="1250" sizeY="90" color="ACCENT_80"/>
        <!-- bottom border -->
        <RenderObject2D texture=".../square.tga" sizeX="1250" sizeY="8" color="ACCENT_80"/>
        <!-- left border -->
        <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="302" color="ACCENT_80"/>
        <!-- right border -->
        <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="302" color="ACCENT_80"/>
        <!-- diagonal bars (wider: 220px) -->
        <!-- title (header_2, fontAutoDownsize=true) -->
        <!-- star decorations (3 per side, at x offsets +-420, +-470, +-520) -->
    </StaticImage>
</Item>
```

The accent colour is customisable per unit (e.g. `4b230080` for dark brown, `E4E4E480` for light grey).

## Nodes

Nodes are placed within panels as `<Item>` elements. The game engine matches the `name` attribute to the doctrine node definition.

```xml
<Item name="DoctrineName" origin="X Y" align="ALIGN">
    <!-- connector children go here if this node has children in the tree -->
</Item>
```

### Node Positioning

The `origin` and `align` attributes determine position within the panel.

**align codes:**
- `lt` = relative to panel's left-top corner
- `rt` = relative to panel's right-top corner  
- `t` or `ct` = relative to panel's top-centre (both work identically)

**Column positions** (X value in origin):

Columns are evenly spaced within the panel. The X offset and align code depend on which side of the panel centre the column falls:
- Columns left of centre: positive X offset with `align="lt"`
- Columns right of centre: negative X offset with `align="rt"`
- Centred columns: X=0 with `align="t"` or `align="ct"`

Examples:
- 2-column, 350px panel: left col at `origin="80 ..." align="lt"`, right at `origin="-80 ..." align="rt"`
- 3-column, 500px panel: left at `origin="80" align="lt"`, centre at `origin="0" align="ct"`, right at `origin="-80" align="rt"`
- Centred single node: `origin="0 -Y" align="t"`

**Row positions** (Y value in origin, always negative = further down):

- Row spacing: 180px
- First row offset: 160px from panel top
- So rows are at Y = -160, -340, -520, -700, -880, etc.

## Connectors

Connectors are visual arrows between parent and child doctrine nodes. They are children of the **parent** node's `<Item>`. Each connector has two states:

```xml
<Item name="#child_link_inactive">
    <!-- grey connector (colour: 716b5f) -->
</Item>
<Item name="#child_link_active">
    <!-- orange connector (colour: f97b03) -->
</Item>
```

Both states have identical geometry, only the colour differs.

### Connector Types

#### 1. Straight Vertical (parent directly above child, same column)

```xml
<StaticImage origin="0 -60" align="t">
    <!-- vertical bar -->
    <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="44" color="COLOR"/>
    <!-- arrow at bottom -->
    <StaticImage origin="0 -16" align="b">
        <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
    </StaticImage>
</StaticImage>
```

- Bar starts 60px below node centre (bottom edge of ~120px icon)
- Standard bar height: 44px (for 1-row gap of 180px)
- Multi-row bar: sizeY scales with distance (e.g. 224px for 2-row gap)
- Arrow placed 16px up from bar bottom

#### 2. Branch (parent above, children in same + different column)

Parent in left column branching right to a second child:

```xml
<StaticImage origin="0 -60" align="t">
    <!-- vertical bar down to same-column child -->
    <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="44" color="COLOR"/>
    <StaticImage origin="0 -16" align="b">
        <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
    </StaticImage>
    <!-- horizontal bar to other column -->
    <StaticImage origin="8 0" align="l">
        <RenderObject2D texture=".../square.tga" sizeX="HBAR_WIDTH" sizeY="8" color="COLOR"/>
        <!-- vertical stub + arrow at end -->
        <StaticImage origin="0 0" align="rt">
            <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="26" color="COLOR"/>
            <StaticImage origin="0 -16" align="b">
                <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
            </StaticImage>
        </StaticImage>
    </StaticImage>
</StaticImage>
```

- Horizontal bar width = distance between column centres (varies with panel width and column count)
- `origin="8 0" align="l"` = bar starts just right of the vertical bar (going right)
- For right-to-left: `origin="-8 0" align="r"` with stub at `align="lt"`

#### 3. Multi-row Branch (parent to child 2+ rows below in different column)

Same as branch but with a longer vertical bar and the horizontal junction at an intermediate Y:

```xml
<StaticImage origin="0 -60" align="t">
    <!-- tall vertical bar spanning multiple rows -->
    <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="224" color="COLOR"/>
    <StaticImage origin="0 -16" align="b">
        <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
    </StaticImage>
    <!-- horizontal bar at intermediate junction point -->
    <StaticImage origin="-8 -90" align="r">
        <RenderObject2D texture=".../square.tga" sizeX="170" sizeY="8" color="COLOR"/>
        <StaticImage origin="0 0" align="lt">
            <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="26" color="COLOR"/>
            <StaticImage origin="0 -16" align="b">
                <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
            </StaticImage>
        </StaticImage>
    </StaticImage>
</StaticImage>
```

The junction Y offset (`-90` in this example) determines where the horizontal bar branches off from the vertical bar.

#### 4. T-Junction (centre node branching both left AND right)

Used when a centred node has children in both adjacent columns:

```xml
<StaticImage origin="0 -60" align="t">
    <!-- vertical bar down -->
    <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="44" color="COLOR"/>
    <StaticImage origin="0 -16" align="b">
        <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
    </StaticImage>
</StaticImage>
<!-- branch left (offset -4px to avoid overlap with vertical bar) -->
<StaticImage origin="-4 -82" align="r">
    <RenderObject2D texture=".../square.tga" sizeX="170" sizeY="8" color="COLOR"/>
    <StaticImage origin="0 0" align="lt">
        <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="26" color="COLOR"/>
        <StaticImage origin="0 -16" align="b">
            <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
        </StaticImage>
    </StaticImage>
</StaticImage>
<!-- branch right (offset +4px) -->
<StaticImage origin="4 -82" align="l">
    <RenderObject2D texture=".../square.tga" sizeX="170" sizeY="8" color="COLOR"/>
    <StaticImage origin="0 0" align="rt">
        <RenderObject2D texture=".../square.tga" sizeX="8" sizeY="26" color="COLOR"/>
        <StaticImage origin="0 -16" align="b">
            <RenderObject2D texture=".../doctrine_arrow.dds" color="COLOR"/>
        </StaticImage>
    </StaticImage>
</StaticImage>
```

Note the +-4px X offset to avoid the left and right horizontal bars overlapping with the central vertical bar.

#### 5. Horizontal (same row, vet panels)

Used in vet/elite panels for left-to-right connections:

```xml
<StaticImage origin="60 0" align="l">
    <!-- horizontal bar -->
    <RenderObject2D texture=".../square.tga" sizeX="63" sizeY="8" color="COLOR"/>
    <!-- horizontal arrow -->
    <StaticImage origin="16 0" align="r">
        <RenderObject2D texture=".../gfl_doctrine_horizontal_arrow.dds" color="COLOR"/>
    </StaticImage>
</StaticImage>
```

- Bar starts 60px to the right of node centre (right edge of icon)
- Uses a different arrow texture (`gfl_doctrine_horizontal_arrow.dds`)
- Bar width depends on gap between adjacent node positions

**Note:** `gfl_doctrine_horizontal_arrow.dds` is a mod-specific texture not included in the base game. DK2's GUI system supports `flipX`/`flipY` but not arbitrary rotation, so the vertical `doctrine_arrow.dds` cannot be rotated 90 degrees to serve as a horizontal arrow. If this texture is not available, horizontal connectors should either omit the arrowhead (bar only) or be avoided in favour of vertical L-shaped connectors.

## Tooltip

Shared tooltip for all doctrine nodes:

```xml
<Item name="Doctrine_Node_Tooltip" sizeX="600" sizeY="250" hidden="true">
    <!-- name (header_4, orange) -->
    <!-- orange divider bar -->
    <!-- description (paragraph_2, cream, word wrap) -->
    <!-- required level section (locked icon + text, red) -->
</Item>
```

This is identical for all units and generated once.

## DK2 Alignment System

The `align` attribute controls the anchor point for `origin` offsets:
- `l` = left centre, `r` = right centre
- `t` = top centre, `b` = bottom centre
- `lt` = left-top, `rt` = right-top, `lb` = left-bottom, `rb` = right-bottom
- `ct` = centre-top (equivalent to `t`)
- `i` = inherit from parent

Positive X = right, negative X = left.
Negative Y = down (further into the panel), positive Y = up.

## Texture Paths

All textures referenced in doctrine GUI:
- `data/textures/gui/square.tga` - solid colour rectangle (tinted via `color`)
- `data/textures/gui/menu_darkbrown_background.tga` - screen background
- `data/textures/gui/doctrines/doctrine_empty_normal.dds` - node button normal state
- `data/textures/gui/doctrines/doctrine_empty_hover.dds` - node button hover state
- `data/textures/gui/doctrines/doctrine_active.dds` - node active indicator (124x124)
- `data/textures/gui/doctrines/doctrine_arrow.dds` - vertical connector arrow
- `data/textures/gui/doctrines/gfl_doctrine_horizontal_arrow.dds` - horizontal connector arrow
- `data/textures/gui/doctrines/customization_doctrine.dds` - points icon
- `data/textures/gui/deploy/deploy_class_diagonalbars.dds` - panel title decoration
- `data/textures/gui/squads/rangers_bg_01.dds` - panel decorative background
- `data/textures/gui/button_hover_01.tga` - button hover background
- `data/textures/gui/locked_icon.dds` - locked doctrine indicator
- `data/textures/gui/missions/mission_stars.tga` - vet/elite star decorations (base game)
- `data/textures/gui/missions/pack_stars.tga` - vet star decorations (mod)
