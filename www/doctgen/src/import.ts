import type {
  DoctrineLayout,
  DoctrinePanel,
  DoctrineNode,
  DoctrineEdge,
  DoctrineStyle,
  Anchor,
  Decor,
  DimValue,
} from "./compiler.ts";
import { DEFAULT_STYLE } from "./compiler.ts";

// Constants from layout.ts (needed for reverse engineering positions)
const SCREEN_WIDTH = 1290;
const ROW_SPACING = 180;
const FIRST_ROW_OFFSET = 160;
const PANEL_GAP = 20;
const PANEL_BOTTOM_PADDING = 80;
const CONNECTOR_STRAIGHT_BAR_HEIGHT = 44;
const HORIZONTAL_BAR_START_X = 60;
const HORIZONTAL_ARROW_WIDTH = 17;
const MAX_COLUMN_SPACING = 200;
const CONNECTOR_BAR_WIDTH = 8;

// ============================================================
// Minimal XML parser
// ============================================================

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

function parseXmlDoc(xml: string): XmlNode[] {
  let pos = 0;

  function skipWs(): void {
    while (pos < xml.length && /\s/.test(xml[pos])) pos++;
  }

  function parseAttrs(): Record<string, string> {
    const attrs: Record<string, string> = {};
    while (pos < xml.length) {
      skipWs();
      if (
        pos >= xml.length ||
        xml[pos] === ">" ||
        (xml[pos] === "/" && xml[pos + 1] === ">")
      )
        break;

      let name = "";
      while (
        pos < xml.length &&
        xml[pos] !== "=" &&
        xml[pos] !== ">" &&
        xml[pos] !== "/" &&
        !/\s/.test(xml[pos])
      ) {
        name += xml[pos++];
      }
      name = name.trim();
      if (!name) break;

      if (xml[pos] === "=") {
        pos++; // skip =
        skipWs();
        const quote = xml[pos];
        if (quote === '"' || quote === "'") {
          pos++; // skip opening quote
          let val = "";
          while (pos < xml.length && xml[pos] !== quote) {
            val += xml[pos++];
          }
          pos++; // skip closing quote
          attrs[name] = val;
        }
      } else {
        attrs[name] = "true";
      }
    }
    return attrs;
  }

  function parseElements(): XmlNode[] {
    const elements: XmlNode[] = [];

    while (pos < xml.length) {
      const lt = xml.indexOf("<", pos);
      if (lt === -1) break;
      pos = lt;

      // Comment
      if (xml.startsWith("<!--", pos)) {
        const end = xml.indexOf("-->", pos);
        pos = end === -1 ? xml.length : end + 3;
        continue;
      }

      // Processing instruction / XML declaration
      if (xml.startsWith("<?", pos)) {
        const end = xml.indexOf("?>", pos);
        pos = end === -1 ? xml.length : end + 2;
        continue;
      }

      // Closing tag — return to parent
      if (xml[pos + 1] === "/") break;

      // Opening tag
      pos++; // skip '<'
      let tag = "";
      while (pos < xml.length && !/[\s/>]/.test(xml[pos])) {
        tag += xml[pos++];
      }

      const attrs = parseAttrs();
      skipWs();

      const selfClose = xml[pos] === "/" && xml[pos + 1] === ">";
      if (selfClose) {
        pos += 2;
        elements.push({ tag, attrs, children: [] });
      } else {
        pos++; // skip '>'
        const children = parseElements();
        // Skip closing tag </tag>
        if (pos < xml.length && xml[pos] === "<" && xml[pos + 1] === "/") {
          const closeEnd = xml.indexOf(">", pos);
          pos = closeEnd + 1;
        }
        elements.push({ tag, attrs, children });
      }
    }

    return elements;
  }

  return parseElements();
}

// ── XML helpers ──

function findChild(el: XmlNode, tag: string): XmlNode | undefined {
  return el.children.find((c) => c.tag === tag);
}

function parseOrigin(origin: string): { x: number; y: number } {
  const parts = origin.split(/\s+/);
  return { x: parseFloat(parts[0]), y: parseFloat(parts[1]) };
}

// ============================================================
// Reverse parser: XML → DoctrineLayout[]
// ============================================================

export function importDoctrineXml(xml: string): DoctrineLayout[] {
  const nodes = parseXmlDoc(xml);

  // Find GUIItems root
  const root = nodes.find((n) => n.tag === "GUIItems");
  const topElements = root ? root.children : nodes;

  const layouts: DoctrineLayout[] = [];
  for (const el of topElements) {
    const name = el.attrs.name ?? "";
    if (name.startsWith("#") && name.endsWith("_DoctrineTree")) {
      layouts.push(extractDoctrineTree(el));
    }
  }

  return layouts;
}

function extractDoctrineTree(treeEl: XmlNode): DoctrineLayout {
  const fullName = treeEl.attrs.name!;
  const unitName = fullName.slice(1, -"_DoctrineTree".length);

  // Find panel elements (Items with sizeX/sizeY, skip button template)
  const panelEls = treeEl.children.filter(
    (c) =>
      c.tag === "Item" &&
      c.attrs.sizeX &&
      c.attrs.sizeY &&
      !(c.attrs.name ?? "").startsWith("#"),
  );

  // Infer gaps from panel origins and row offsets
  const { colGap, rowGap } = inferGaps(panelEls);
  const gap = colGap;

  // Infer grid columns from panel widths and positions
  const panelWidths = panelEls.map((el) => parseInt(el.attrs.sizeX));
  const panelHeights = panelEls.map((el) => parseInt(el.attrs.sizeY));
  const gridColumns = inferGridColumnsWithGap(panelWidths, gap);
  const fitsGrid =
    gridColumns > 0 &&
    panelWidths.every(
      (w) =>
        inferColspanWithGap(w, gridColumns, gap) > 0 &&
        Math.abs(
          w -
            computeExpectedWidthWithGap(
              gridColumns,
              inferColspanWithGap(w, gridColumns, gap),
              gap,
            ),
        ) <= 1,
    );

  // Extract style from first connector
  const style = extractStyle(panelEls);

  // Determine the "natural" single-column width: either the grid formula or
  // the most common width among colspan=1 panels (for non-grid layouts)
  const gridWidth = computeExpectedWidthWithGap(gridColumns, 1, gap);
  const colspanOneWidths = panelWidths.filter(
    (_, i) =>
      inferColspanWithGap(panelWidths[i], gridColumns, gap) === 1 ||
      panelWidths[i] < SCREEN_WIDTH / 2,
  );
  const widthCounts = new Map<number, number>();
  for (const w of colspanOneWidths) {
    widthCounts.set(w, (widthCounts.get(w) ?? 0) + 1);
  }
  let naturalWidth = gridWidth;
  if (widthCounts.size > 0) {
    const mostCommon = [...widthCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    if (mostCommon[1] >= 2 && Math.abs(mostCommon[0] - gridWidth) > 1) {
      naturalWidth = mostCommon[0];
    }
  }

  // Extract panels, adding explicit width only when it differs from the natural width
  const panels = panelEls.map((el, i) => {
    const panel = extractPanel(el, gridColumns, gap);
    // For colspan>1, check against the full-span expected width
    const expectedWidth =
      panel.colspan === 1
        ? naturalWidth
        : computeExpectedWidthWithGap(gridColumns, panel.colspan, gap);
    if (Math.abs(panelWidths[i] - expectedWidth) > 1) {
      panel.width = panelWidths[i];
    }
    return panel;
  });

  // Determine which panels are in the same grid row (same Y offset)
  const panelYOffsets = panelEls.map((el) => {
    const origin = parseOrigin(el.attrs.origin ?? "0 0");
    return origin.y;
  });

  // Group by Y offset, find max expected height per row
  const rowGroups = new Map<number, number[]>();
  for (let i = 0; i < panels.length; i++) {
    const y = Math.round(panelYOffsets[i]);
    const group = rowGroups.get(y) ?? [];
    group.push(i);
    rowGroups.set(y, group);
  }

  for (const indices of rowGroups.values()) {
    // The row height in the XML = max actual height among panels in this row
    const actualRowHeight = Math.max(...indices.map((i) => panelHeights[i]));
    for (const i of indices) {
      const pTop = panels[i].paddingTop ?? FIRST_ROW_OFFSET;
      const pRowSpacing = panels[i].rowSpacing ?? ROW_SPACING;
      const expectedHeight =
        pTop + (panels[i].rows - 1) * pRowSpacing + PANEL_BOTTOM_PADDING;

      // Only set paddingBottom when this panel's height is its own (not row-stretched)
      // AND it differs from the default
      const isStretched =
        indices.length > 1 &&
        Math.abs(panelHeights[i] - actualRowHeight) <= 1 &&
        Math.abs(panelHeights[i] - expectedHeight) > 1;
      if (!isStretched) {
        const actualPaddingBottom =
          panelHeights[i] - pTop - (panels[i].rows - 1) * pRowSpacing;
        if (Math.abs(actualPaddingBottom - PANEL_BOTTOM_PADDING) > 1) {
          panels[i].paddingBottom = actualPaddingBottom;
        }
      }
      // Only emit explicit height if it doesn't match what the layout engine
      // would compute (either the panel's own height or the row-stretched height)
      if (
        Math.abs(panelHeights[i] - expectedHeight) > 1 &&
        Math.abs(panelHeights[i] - actualRowHeight) > 1
      ) {
        // Height differs from both own expected AND row max — truly custom
        panels[i].height = panelHeights[i];
      } else if (
        Math.abs(actualRowHeight - expectedHeight) > 1 &&
        indices.length === 1
      ) {
        // Single panel in row with non-standard height
        panels[i].height = panelHeights[i];
      }
    }
  }

  // Determine gap properties to emit
  const gapsDiffer = Math.abs(colGap - rowGap) > 1;
  const nonDefault =
    Math.abs(colGap - PANEL_GAP) > 1 || Math.abs(rowGap - PANEL_GAP) > 1;

  return {
    gridColumns,
    unitName,
    panels,
    style,
    // If column and row gaps are equal, use 'gap'. Otherwise use column-gap/row-gap.
    gap: nonDefault && !gapsDiffer ? colGap : undefined,
    columnGap: nonDefault && gapsDiffer ? colGap : undefined,
    rowGap: nonDefault && gapsDiffer ? rowGap : undefined,
  };
}

function inferGaps(panelEls: XmlNode[]): {
  colGap: number;
  rowGap: number;
} {
  // Column gap: X offset in panel origins (left panels have origin="gap ...")
  let colGap = PANEL_GAP;
  for (const el of panelEls) {
    const align = el.attrs.align ?? "";
    const origin = parseOrigin(el.attrs.origin ?? "0 0");
    if (align === "lt" || align === "l" || align === "rt" || align === "r") {
      const x = Math.abs(origin.x);
      if (x > 0) {
        colGap = Math.round(x);
        break;
      }
    }
  }

  // Row gap: difference between panel Y offsets minus panel height
  // Group panels by Y offset to find rows
  const panelsByY = new Map<number, XmlNode>();
  const yOffsets: number[] = [];
  for (const el of panelEls) {
    const origin = parseOrigin(el.attrs.origin ?? "0 0");
    const y = Math.round(-origin.y);
    if (!panelsByY.has(y)) {
      panelsByY.set(y, el);
      yOffsets.push(y);
    }
  }
  yOffsets.sort((a, b) => a - b);

  let rowGap = colGap; // default: same as column gap
  if (yOffsets.length >= 2) {
    // Row gap = nextRowY - (thisRowY + thisRowHeight)
    const firstY = yOffsets[0];
    const firstPanel = panelsByY.get(firstY)!;
    const firstHeight = parseInt(firstPanel.attrs.sizeY);
    const secondY = yOffsets[1];
    const inferredRowGap = secondY - firstY - firstHeight;
    if (inferredRowGap > 0) {
      rowGap = Math.round(inferredRowGap);
    }
  }

  return { colGap, rowGap };
}

function computeExpectedWidthWithGap(
  gridColumns: number,
  colspan: number,
  gap: number,
): number {
  const totalGap = gap * (gridColumns + 1);
  const available = SCREEN_WIDTH - totalGap;
  const colWidth = available / gridColumns;
  return Math.round(colWidth * colspan + gap * (colspan - 1));
}

function inferGridColumnsWithGap(panelWidths: number[], gap: number): number {
  for (let gc = 1; gc <= 6; gc++) {
    const totalGap = gap * (gc + 1);
    const available = SCREEN_WIDTH - totalGap;
    const colWidth = available / gc;

    const allMatch = panelWidths.every((w) => {
      for (let cs = 1; cs <= gc; cs++) {
        const expected = Math.round(colWidth * cs + gap * (cs - 1));
        if (Math.abs(expected - w) <= 1) return true;
      }
      return false;
    });

    if (allMatch) return gc;
  }

  // No clean grid — infer from how many narrow panels fit before a wide one
  const halfScreen = SCREEN_WIDTH / 2;
  let narrowCount = 0;
  for (const w of panelWidths) {
    if (w < halfScreen) {
      narrowCount++;
    } else {
      break;
    }
  }

  return Math.max(narrowCount, 1);
}

function inferColspanWithGap(
  panelWidth: number,
  gridColumns: number,
  gap: number,
): number {
  const totalGap = gap * (gridColumns + 1);
  const available = SCREEN_WIDTH - totalGap;
  const colWidth = available / gridColumns;

  for (let cs = 1; cs <= gridColumns; cs++) {
    const expected = Math.round(colWidth * cs + gap * (cs - 1));
    if (Math.abs(expected - panelWidth) <= 1) return cs;
  }

  return 1;
}

function extractStyle(panelEls: XmlNode[]): DoctrineStyle {
  // Find first connector colour from any panel's nodes
  for (const panel of panelEls) {
    for (const child of panel.children) {
      if (child.tag !== "Item" || !child.attrs.name) continue;
      if (child.attrs.name.startsWith("#")) continue;

      const inactiveItem = child.children.find(
        (c) => c.tag === "Item" && c.attrs.name === "#child_link_inactive",
      );
      if (!inactiveItem) continue;

      const activeItem = child.children.find(
        (c) => c.tag === "Item" && c.attrs.name === "#child_link_active",
      );

      const inactiveColor = findConnectorColour(inactiveItem);
      const activeColor = activeItem
        ? findConnectorColour(activeItem)
        : undefined;

      if (inactiveColor) {
        return {
          inactiveColor,
          activeColor: activeColor ?? DEFAULT_STYLE.activeColor,
        };
      }
    }
  }

  return { ...DEFAULT_STYLE };
}

function findConnectorColour(el: XmlNode): string | undefined {
  for (const child of el.children) {
    if (child.tag === "RenderObject2D" && child.attrs.color) {
      return child.attrs.color;
    }
    if (child.tag === "StaticImage" || child.tag === "Item") {
      const found = findConnectorColour(child);
      if (found) return found;
    }
  }
  return undefined;
}

// ── Panel extraction ──

function extractPanel(
  panelEl: XmlNode,
  gridColumns: number,
  gap: number = PANEL_GAP,
): DoctrinePanel {
  const panelWidth = parseInt(panelEl.attrs.sizeX);
  const panelHeight = parseInt(panelEl.attrs.sizeY);
  const colspan = inferColspanWithGap(panelWidth, gridColumns, gap);

  // First child is the panel background StaticImage
  const bgImage = panelEl.children[0];
  const {
    title,
    titleColor,
    titleBarHeight,
    titleBarColor,
    titleFont,
    bgColor,
  } = extractPanelBackground(bgImage);

  // Everything after the background
  const panelChildren = panelEl.children.slice(1);

  // Extract raw node positions
  const rawNodes = extractRawNodes(panelChildren);

  // Infer paddingTop and rowSpacing from node Y positions
  const { paddingTop, rowSpacing } = inferSpacing(rawNodes);

  // Infer panel columns and map nodes to grid positions
  const { panelColumns, nodes } = inferNodePositions(
    rawNodes,
    panelWidth,
    paddingTop,
    rowSpacing,
  );

  // Infer panel rows
  const panelRows =
    nodes.length > 0
      ? Math.max(...nodes.map((n) => n.row)) + 1
      : inferRowsFromHeight(panelHeight, paddingTop, rowSpacing);

  // Extract edges from connector structures
  const edges = extractEdges(
    panelChildren,
    nodes,
    panelColumns,
    panelWidth,
    rowSpacing,
  );

  // Extract anchors/decors from both direct panel children and inside the
  // background StaticImage (base game puts decors inside the bg wrapper)
  const anchors = extractAnchors(
    panelChildren,
    bgImage,
    panelWidth,
    panelHeight,
    titleBarHeight,
  );

  return {
    title,
    columns: panelColumns,
    rows: panelRows,
    colspan,
    rowspan: 1,
    nodes,
    edges,
    anchors,
    bgColor,
    titleColor,
    titleBarHeight,
    titleBarColor,
    titleFont,
    paddingTop:
      Math.abs(paddingTop - FIRST_ROW_OFFSET) > 1 ? paddingTop : undefined,
    rowSpacing: Math.abs(rowSpacing - ROW_SPACING) > 1 ? rowSpacing : undefined,
  };
}

function inferRowsFromHeight(
  height: number,
  paddingTop: number = FIRST_ROW_OFFSET,
  rowSpacing: number = ROW_SPACING,
): number {
  const rows = Math.round(
    (height - paddingTop - PANEL_BOTTOM_PADDING) / rowSpacing + 1,
  );
  return Math.max(1, rows);
}

function inferSpacing(rawNodes: RawNode[]): {
  paddingTop: number;
  rowSpacing: number;
} {
  if (rawNodes.length === 0) {
    return { paddingTop: FIRST_ROW_OFFSET, rowSpacing: ROW_SPACING };
  }

  // Node Y values: y = -(row * rowSpacing + paddingTop)
  // So -y = row * rowSpacing + paddingTop
  const yValues = rawNodes.map((n) => -n.y);
  const uniqueY = [...new Set(yValues.map((y) => Math.round(y)))].sort(
    (a, b) => a - b,
  );

  // The smallest Y value is paddingTop (row=0)
  const paddingTop = uniqueY[0];

  // If we have multiple unique Y values, the differences give us rowSpacing
  let rowSpacing = ROW_SPACING;
  if (uniqueY.length >= 2) {
    const diffs: number[] = [];
    for (let i = 1; i < uniqueY.length; i++) {
      diffs.push(uniqueY[i] - uniqueY[i - 1]);
    }
    const inferredSpacing = diffs.reduce((a, b) => gcd(a, b));

    // Prefer the default if it evenly divides the inferred spacing
    // (handles cases like empty rows: row 0, row 2 → diff=360, but actual spacing=180)
    if (inferredSpacing % ROW_SPACING === 0) {
      rowSpacing = ROW_SPACING;
    } else {
      rowSpacing = inferredSpacing;
    }
  }

  return { paddingTop, rowSpacing };
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

interface PanelBgInfo {
  title: string;
  bgColor: string;
  titleColor: string;
  titleBarHeight: number;
  titleBarColor: string;
  titleFont: string;
}

function extractPanelBackground(bgImage: XmlNode): PanelBgInfo {
  const defaults: PanelBgInfo = {
    title: "",
    bgColor: "211e1d80",
    titleColor: "f0e3cc",
    titleBarHeight: 72,
    titleBarColor: "211e1d40",
    titleFont: "header_3",
  };

  if (!bgImage || bgImage.tag !== "StaticImage") return defaults;

  // First RenderObject2D = panel background colour
  const bgRender = findChild(bgImage, "RenderObject2D");
  if (bgRender?.attrs.color) defaults.bgColor = bgRender.attrs.color;

  // Find the title text Item first, then look for the title bar StaticImage
  // immediately before it
  const children = bgImage.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.tag === "Item") {
      const staticText = findChild(child, "StaticText");
      if (staticText) {
        defaults.title = staticText.attrs.text ?? "";
        if (staticText.attrs.font) defaults.titleFont = staticText.attrs.font;
        if (staticText.attrs.textColor)
          defaults.titleColor = staticText.attrs.textColor;

        // The title bar is the StaticImage with square.tga, aligned to lt,
        // with a height matching or close to the title Item's height
        const titleItemHeight = parseInt(child.attrs.sizeY ?? "72");
        for (let j = i - 1; j >= 0; j--) {
          if (children[j].tag !== "StaticImage") continue;
          const align = children[j].attrs.align ?? "";
          if (align !== "lt") continue;
          const render = findChild(children[j], "RenderObject2D");
          if (
            render?.attrs.texture?.includes("square.tga") &&
            render.attrs.sizeY
          ) {
            const h = parseInt(render.attrs.sizeY);
            // Title bar height should be close to the title Item height
            if (Math.abs(h - titleItemHeight) <= 20) {
              defaults.titleBarHeight = h;
              if (render.attrs.color)
                defaults.titleBarColor = render.attrs.color;
              break;
            }
          }
        }
        break;
      }
    }
  }

  return defaults;
}

// ── Node extraction ──

interface RawNode {
  name: string;
  x: number;
  y: number;
  align: string;
  element: XmlNode;
}

function extractRawNodes(children: XmlNode[]): RawNode[] {
  const rawNodes: RawNode[] = [];

  for (const child of children) {
    if (child.tag !== "Item") continue;
    const name = child.attrs.name;
    if (!name || name.startsWith("#")) continue;

    const origin = parseOrigin(child.attrs.origin ?? "0 0");
    const align = child.attrs.align ?? "t";

    rawNodes.push({ name, x: origin.x, y: origin.y, align, element: child });
  }

  return rawNodes;
}

function normaliseToCentreX(
  x: number,
  align: string,
  panelWidth: number,
): number {
  switch (align) {
    case "lt":
      return x - panelWidth / 2;
    case "rt":
      return x + panelWidth / 2;
    default:
      return x; // "t", "ct", etc.
  }
}

function inferNodePositions(
  rawNodes: RawNode[],
  panelWidth: number,
  paddingTop: number = FIRST_ROW_OFFSET,
  rowSpacing: number = ROW_SPACING,
): { panelColumns: number; nodes: DoctrineNode[] } {
  if (rawNodes.length === 0) {
    return { panelColumns: 1, nodes: [] };
  }

  const centreXValues = rawNodes.map((n) =>
    normaliseToCentreX(n.x, n.align, panelWidth),
  );

  // Get unique X values
  const uniqueX = [...new Set(centreXValues.map((x) => Math.round(x)))].sort(
    (a, b) => a - b,
  );

  let panelColumns = 1;
  let spacing = 0;

  if (uniqueX.length === 1 && Math.abs(uniqueX[0]) < 5) {
    panelColumns = 1;
  } else {
    // Strategy 1: try doctgen-style spacing (min(panelWidth/pc, MAX_COLUMN_SPACING))
    let found = false;
    for (let pc = 1; pc <= 8; pc++) {
      const trySpacing =
        pc <= 1 ? 0 : Math.min(panelWidth / pc, MAX_COLUMN_SPACING);
      if (allNodesMatchColumns(centreXValues, pc, trySpacing)) {
        panelColumns = pc;
        spacing = trySpacing;
        found = true;
        break;
      }
    }

    // Strategy 2: derive spacing from actual node positions
    if (!found && uniqueX.length >= 2) {
      // Compute minimum difference between adjacent unique X values
      const diffs: number[] = [];
      for (let i = 1; i < uniqueX.length; i++) {
        diffs.push(uniqueX[i] - uniqueX[i - 1]);
      }
      // Try using the minimum diff as spacing (or half-spacing for fractional cols)
      const minDiff = Math.min(...diffs);
      for (const candidateSpacing of [minDiff, minDiff * 2]) {
        if (candidateSpacing < 10) continue;
        // Determine column count from the range of X values
        const range = uniqueX[uniqueX.length - 1] - uniqueX[0];
        const pc = Math.round(range / candidateSpacing) + 1;
        if (
          pc >= 1 &&
          pc <= 12 &&
          allNodesMatchColumns(centreXValues, pc, candidateSpacing)
        ) {
          panelColumns = pc;
          spacing = candidateSpacing;
          found = true;
          break;
        }
      }
    }

    // Strategy 3: each unique X position is its own column
    if (!found && uniqueX.length >= 2) {
      panelColumns = uniqueX.length;
      spacing = (uniqueX[uniqueX.length - 1] - uniqueX[0]) / (panelColumns - 1);
    }
  }

  if (panelColumns > 1 && spacing === 0) {
    spacing = Math.min(panelWidth / panelColumns, MAX_COLUMN_SPACING);
  }

  const nodes: DoctrineNode[] = rawNodes.map((raw, i) => {
    const centreX = centreXValues[i];
    const row = Math.round((-raw.y - paddingTop) / rowSpacing);

    let col: number;
    if (panelColumns <= 1) {
      col = 0;
    } else {
      col = centreX / spacing + (panelColumns - 1) / 2;
      // Round to nearest 0.5
      col = Math.round(col * 2) / 2;
    }

    return { name: raw.name, col, row };
  });

  return { panelColumns, nodes };
}

function allNodesMatchColumns(
  centreXValues: number[],
  panelColumns: number,
  spacing: number,
): boolean {
  if (panelColumns <= 1) return centreXValues.every((x) => Math.abs(x) < 5);
  if (spacing === 0) return false;

  for (const cx of centreXValues) {
    const col = cx / spacing + (panelColumns - 1) / 2;
    const rounded = Math.round(col * 2) / 2;
    if (Math.abs(col - rounded) > 0.15) return false;
    if (rounded < -0.1 || rounded > panelColumns - 0.9) return false;
  }
  return true;
}

// ── Edge extraction ──

function extractEdges(
  panelChildren: XmlNode[],
  nodes: DoctrineNode[],
  panelColumns: number,
  panelWidth: number,
  rowSpacing: number = ROW_SPACING,
): DoctrineEdge[] {
  const edges: DoctrineEdge[] = [];
  const spacing =
    panelColumns <= 1
      ? 0
      : Math.min(panelWidth / panelColumns, MAX_COLUMN_SPACING);

  for (const child of panelChildren) {
    if (child.tag !== "Item") continue;
    const parentName = child.attrs.name;
    if (!parentName || parentName.startsWith("#")) continue;

    const parentNode = nodes.find((n) => n.name === parentName);
    if (!parentNode) continue;

    const inactiveItem = child.children.find(
      (c) => c.tag === "Item" && c.attrs.name === "#child_link_inactive",
    );
    if (!inactiveItem) continue;

    // Parse connectors from StaticImage children
    for (const connectorImg of inactiveItem.children.filter(
      (c) => c.tag === "StaticImage",
    )) {
      const found = parseConnectorEdges(
        connectorImg,
        parentNode,
        nodes,
        panelColumns,
        spacing,
        rowSpacing,
      );
      edges.push(...found);
    }
  }

  return edges;
}

function parseConnectorEdges(
  el: XmlNode,
  parent: DoctrineNode,
  allNodes: DoctrineNode[],
  panelColumns: number,
  spacing: number,
  rowSpacing: number = ROW_SPACING,
): DoctrineEdge[] {
  const edges: DoctrineEdge[] = [];
  const render = findChild(el, "RenderObject2D");
  if (!render) return edges;

  const sizeX = render.attrs.sizeX ? parseInt(render.attrs.sizeX) : 0;
  const sizeY = render.attrs.sizeY ? parseInt(render.attrs.sizeY) : 0;

  if (sizeX === CONNECTOR_BAR_WIDTH && sizeY > 0) {
    // Vertical bar connector
    const barHeight = sizeY;
    const rowDelta =
      barHeight <= CONNECTOR_STRAIGHT_BAR_HEIGHT
        ? 1
        : Math.round((barHeight - CONNECTOR_STRAIGHT_BAR_HEIGHT) / rowSpacing) +
          1;

    // Same-column child
    const childRow = parent.row + rowDelta;
    const sameColChild = findNodeAt(allNodes, parent.col, childRow);
    if (sameColChild) {
      edges.push({ from: parent.name, to: sameColChild.name });
    }

    // Branch children: horizontal bars nested inside the vertical bar
    for (const branchEl of el.children) {
      if (branchEl.tag !== "StaticImage") continue;
      const branchRender = findChild(branchEl, "RenderObject2D");
      if (!branchRender) continue;

      const bSizeX = branchRender.attrs.sizeX
        ? parseInt(branchRender.attrs.sizeX)
        : 0;
      const bSizeY = branchRender.attrs.sizeY
        ? parseInt(branchRender.attrs.sizeY)
        : 0;

      if (bSizeY === CONNECTOR_BAR_WIDTH && bSizeX > 0) {
        // Horizontal bar = branch to another column
        const goesRight = branchEl.attrs.align === "l";
        const dx = goesRight ? bSizeX : -bSizeX;

        const parentCentreX = (parent.col - (panelColumns - 1) / 2) * spacing;
        const childCentreX = parentCentreX + dx;
        const childCol =
          Math.round((childCentreX / spacing + (panelColumns - 1) / 2) * 2) / 2;

        const branchChild = findNodeAt(allNodes, childCol, childRow);
        if (branchChild) {
          edges.push({ from: parent.name, to: branchChild.name });
        }
      }
    }
  } else if (sizeY === CONNECTOR_BAR_WIDTH && sizeX > 0) {
    // Horizontal bar connector (same-row edge)
    const goesRight = el.attrs.align === "l";
    const totalDx = sizeX + 2 * HORIZONTAL_BAR_START_X + HORIZONTAL_ARROW_WIDTH;
    const dx = goesRight ? totalDx : -totalDx;

    const parentCentreX = (parent.col - (panelColumns - 1) / 2) * spacing;
    const childCentreX = parentCentreX + dx;
    const childCol =
      Math.round((childCentreX / spacing + (panelColumns - 1) / 2) * 2) / 2;

    const child = findNodeAt(allNodes, childCol, parent.row);
    if (child) {
      edges.push({ from: parent.name, to: child.name });
    }
  }

  return edges;
}

function findNodeAt(
  nodes: DoctrineNode[],
  col: number,
  row: number,
): DoctrineNode | undefined {
  return nodes.find((n) => Math.abs(n.col - col) < 0.3 && n.row === row);
}

// ── Anchor/decor extraction ──

// Known structural textures inside the background wrapper
const STRUCTURAL_TEXTURES = ["squads/rangers_bg_01.dds"];

function isStructuralElement(el: XmlNode, titleBarHeight: number): boolean {
  const render = findChild(el, "RenderObject2D");
  if (!render) return true; // no render = skip (e.g. Item)
  const texture = render.attrs.texture ?? "";
  // Rangers bg overlay
  if (STRUCTURAL_TEXTURES.some((t) => texture.includes(t))) return true;
  // Title bar bg: square.tga at align="lt" with matching height
  if (
    texture.includes("square.tga") &&
    (el.attrs.align ?? "lt") === "lt" &&
    render.attrs.sizeY &&
    Math.abs(parseInt(render.attrs.sizeY) - titleBarHeight) <= 20
  ) {
    const origin = parseOrigin(el.attrs.origin ?? "0 0");
    if (Math.abs(origin.x) <= 1 && Math.abs(origin.y) <= 1) return true;
  }
  return false;
}

function normaliseDecorPosition(
  origin: { x: number; y: number },
  align: string,
  width: number | undefined,
  height: number | undefined,
  panelWidth: number,
  panelHeight: number,
): { x: number; y: number } {
  let x: number;
  let y: number;

  // Horizontal: determine top-left X
  if (align.includes("l") || align === "lt" || align === "lb") {
    x = origin.x;
  } else if (align.includes("r")) {
    // Right-aligned: origin is from right edge
    x = panelWidth + origin.x - (width ?? 0);
  } else {
    // Centre-aligned (t, ct, b, cb, i)
    x = panelWidth / 2 + origin.x - (width ?? 0) / 2;
  }

  // Vertical: determine top-left Y
  if (align.includes("b")) {
    // Bottom-aligned: origin.y is typically 0 or negative (upward)
    y = panelHeight + origin.y - (height ?? 0);
  } else {
    // Top-aligned (default)
    y = -origin.y;
  }

  return { x, y };
}

function extractAnchors(
  panelChildren: XmlNode[],
  bgImage: XmlNode | undefined,
  panelWidth: number,
  panelHeight: number,
  titleBarHeight: number,
): Anchor[] {
  const anchors: Anchor[] = [];

  function processDecorElement(el: XmlNode): void {
    if (el.tag !== "StaticImage") return;
    const render = findChild(el, "RenderObject2D");
    if (!render) return;

    const texture = render.attrs.texture ?? "";
    const align = el.attrs.align ?? "lt";
    const origin = parseOrigin(el.attrs.origin ?? "0 0");
    const width = render.attrs.sizeX ? parseInt(render.attrs.sizeX) : undefined;
    const height = render.attrs.sizeY
      ? parseInt(render.attrs.sizeY)
      : undefined;

    const pos = normaliseDecorPosition(
      origin,
      align,
      width,
      height,
      panelWidth,
      panelHeight,
    );

    const anchorXPct = reversePercentage(pos.x, width, panelWidth);
    const anchorYPct = reversePercentage(pos.y, height, panelHeight);

    const decor: Decor = { texture };
    if (width !== undefined) decor.width = reverseDimValue(width, panelWidth);
    if (height !== undefined)
      decor.height = reverseDimValue(height, panelHeight);
    if (render.attrs.color) decor.color = render.attrs.color;
    if (render.attrs.flipX === "true") decor.flipX = true;

    anchors.push({ x: anchorXPct, y: anchorYPct, decors: [decor] });
  }

  // Extract decors from direct panel children (doctgen-style)
  for (const child of panelChildren) {
    processDecorElement(child);
  }

  // Extract decors from inside the background wrapper (base game style)
  if (bgImage && bgImage.tag === "StaticImage") {
    for (const child of bgImage.children) {
      if (child.tag !== "StaticImage") continue;
      if (isStructuralElement(child, titleBarHeight)) continue;
      processDecorElement(child);
    }
  }

  return anchors;
}

function reversePercentage(
  pixelPos: number,
  size: number | undefined,
  panelDim: number,
): string {
  // At 0%? Check first — position 0 is always 0% regardless of size
  if (Math.abs(pixelPos) <= 1) {
    return "0%";
  }

  // Clamped from 100%? (position + size = panel dimension)
  if (size !== undefined && Math.abs(pixelPos + size - panelDim) <= 1) {
    return "100%";
  }

  // Check for integer percentage match
  const pct = (pixelPos / panelDim) * 100;
  const rounded = Math.round(pct);
  if (rounded > 0 && rounded < 100) {
    const reconstructed = Math.round((rounded / 100) * panelDim);
    if (reconstructed === Math.round(pixelPos)) {
      return `${rounded}%`;
    }
  }

  return `${Math.round(pct * 10) / 10}%`;
}

function reverseDimValue(pixels: number, panelDim: number): DimValue {
  // Check for integer percentage match
  const pct = (pixels / panelDim) * 100;
  const rounded = Math.round(pct);
  if (rounded > 0 && rounded <= 100) {
    const reconstructed = Math.round((rounded / 100) * panelDim);
    if (reconstructed === pixels) {
      return `${rounded}%`;
    }
  }
  return pixels;
}

// ============================================================
// KDL serialiser: DoctrineLayout → KDL string
// ============================================================

export function layoutToKdl(layout: DoctrineLayout): string {
  const lines: string[] = [];

  let gridProps = `columns=${layout.gridColumns} unit="${layout.unitName}"`;
  if (layout.style.inactiveColor !== DEFAULT_STYLE.inactiveColor) {
    gridProps += ` inactive-color="${layout.style.inactiveColor}"`;
  }
  if (layout.style.activeColor !== DEFAULT_STYLE.activeColor) {
    gridProps += ` active-color="${layout.style.activeColor}"`;
  }
  if (layout.gap !== undefined) {
    gridProps += ` gap=${layout.gap}`;
  }
  if (layout.columnGap !== undefined) {
    gridProps += ` column-gap=${layout.columnGap}`;
  }
  if (layout.rowGap !== undefined) {
    gridProps += ` row-gap=${layout.rowGap}`;
  }
  lines.push(`grid ${gridProps} {`);

  for (let i = 0; i < layout.panels.length; i++) {
    if (i > 0) lines.push("");
    lines.push(panelToKdl(layout.panels[i]));
  }

  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

function panelToKdl(panel: DoctrinePanel): string {
  const t = "    ";
  const lines: string[] = [];

  // Build property groups: structural then styling
  let structural = `title="${panel.title}" columns=${panel.columns} rows=${panel.rows}`;
  if (panel.colspan > 1) structural += ` colspan=${panel.colspan}`;
  if (panel.rowspan > 1) structural += ` rowspan=${panel.rowspan}`;
  if (panel.width !== undefined) structural += ` width=${panel.width}`;
  if (panel.height !== undefined) structural += ` height=${panel.height}`;
  if (panel.paddingTop !== undefined)
    structural += ` padding-top=${panel.paddingTop}`;
  if (panel.paddingBottom !== undefined)
    structural += ` padding-bottom=${panel.paddingBottom}`;
  if (panel.rowSpacing !== undefined)
    structural += ` row-spacing=${panel.rowSpacing}`;

  const styleParts: string[] = [];
  if (panel.bgColor !== "211e1d80")
    styleParts.push(`bg-color="${panel.bgColor}"`);
  if (panel.titleColor !== "f0e3cc")
    styleParts.push(`title-color="${panel.titleColor}"`);
  if (panel.titleBarHeight !== 72)
    styleParts.push(`title-bar-height=${panel.titleBarHeight}`);
  if (panel.titleBarColor !== "211e1d40")
    styleParts.push(`title-bar-color="${panel.titleBarColor}"`);
  if (panel.titleFont !== "header_3")
    styleParts.push(`title-font="${panel.titleFont}"`);

  const allProps =
    structural + (styleParts.length > 0 ? " " + styleParts.join(" ") : "");
  const panelLine = `${t}panel ${allProps} {`;

  if (panelLine.length <= 100) {
    lines.push(panelLine);
  } else {
    // Wrap: structural on first line, styling on continuation
    if (styleParts.length > 0) {
      lines.push(`${t}panel ${structural} \\`);
      lines.push(`${t}${t}${styleParts.join(" ")} {`);
    } else {
      lines.push(panelLine);
    }
  }

  // Anchors
  for (const anchor of panel.anchors) {
    lines.push(anchorToKdl(anchor, t + t));
  }

  if (panel.anchors.length > 0 && panel.nodes.length > 0) {
    lines.push("");
  }

  // Nodes
  for (const node of panel.nodes) {
    lines.push(nodeToKdl(node, t + t));
  }

  if (panel.nodes.length > 0 && panel.edges.length > 0) {
    lines.push("");
  }

  // Edges
  for (const edge of panel.edges) {
    lines.push(`${t}${t}edge "${edge.from}" "${edge.to}"`);
  }

  lines.push(`${t}}`);

  return lines.join("\n");
}

function anchorToKdl(anchor: Anchor, indent: string): string {
  const lines: string[] = [];
  lines.push(`${indent}anchor x="${anchor.x}" y="${anchor.y}" {`);

  for (const decor of anchor.decors) {
    let props = `"${decor.texture}"`;
    if (decor.x !== undefined && decor.x !== 0) props += ` x=${decor.x}`;
    if (decor.y !== undefined && decor.y !== 0) props += ` y=${decor.y}`;
    if (decor.width !== undefined) {
      props +=
        typeof decor.width === "string"
          ? ` width="${decor.width}"`
          : ` width=${decor.width}`;
    }
    if (decor.height !== undefined) {
      props +=
        typeof decor.height === "string"
          ? ` height="${decor.height}"`
          : ` height=${decor.height}`;
    }
    if (decor.color) props += ` color="${decor.color}"`;
    if (decor.flipX) props += ` flip-x="true"`;
    lines.push(`${indent}    decor ${props}`);
  }

  lines.push(`${indent}}`);
  return lines.join("\n");
}

function nodeToKdl(node: DoctrineNode, indent: string): string {
  return `${indent}node "${node.name}" col=${node.col} row=${node.row}`;
}
