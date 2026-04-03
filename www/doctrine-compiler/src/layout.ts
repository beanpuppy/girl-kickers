import type {
  DoctrineLayout,
  DoctrinePanel,
  DoctrineNode,
  DoctrineEdge,
  DoctrineStyle,
  Anchor,
  DimValue,
} from "./compiler.ts";

// DK2 GUI constants
const SCREEN_WIDTH = 1290;
const ROW_SPACING = 180;
const FIRST_ROW_OFFSET = 160;
const TITLE_BAR_HEIGHT = 72;
const PANEL_TOP_PADDING = 70; // origin Y offset from screen top
const PANEL_GAP = 20;
const CONNECTOR_BAR_WIDTH = 8;
const CONNECTOR_BAR_START_Y = 60; // below node centre (bottom of ~120px icon)
const CONNECTOR_ARROW_OFFSET = 16; // arrow tip from bar end
const CONNECTOR_STRAIGHT_BAR_HEIGHT = 44; // for 1-row gap
const CONNECTOR_STUB_HEIGHT = 26; // vertical stub at end of horizontal bar
const CONNECTOR_T_JUNCTION_OFFSET = 4; // +-4px offset for T-junction horizontal bars
const HORIZONTAL_BAR_START_X = 60; // right edge of icon
const HORIZONTAL_ARROW_WIDTH = 17; // intrinsic width of the horizontal arrow texture
const MAX_COLUMN_SPACING = 200; // cap column spacing for wide panels

export type Align = "lt" | "rt" | "t" | "ct" | "l";

export interface LayoutNode {
  name: string;
  origin: string; // "X Y"
  align: Align;
}

export interface ConnectorSegment {
  type:
    | "vertical_bar"
    | "horizontal_bar"
    | "vertical_arrow"
    | "horizontal_arrow"
    | "vertical_stub";
  origin: string;
  align: Align;
  sizeX?: number;
  sizeY?: number;
}

export interface Connector {
  segments: ConnectorSegment[];
}

export interface LayoutNodeWithConnectors {
  node: LayoutNode;
  connectors: Connector[];
}

export interface ResolvedDecor {
  texture: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
  flipX?: boolean;
}

export interface ResolvedAnchor {
  decors: ResolvedDecor[];
}

export interface LayoutPanel {
  name: string;
  title: string;
  origin: string;
  align: Align;
  sizeX: number;
  sizeY: number;
  bgColor: string;
  titleBarHeight: number;
  titleBarColor: string;
  titleFont: string;
  anchors: ResolvedAnchor[];
  nodes: LayoutNodeWithConnectors[];
}

export interface ComputedLayout {
  unitName: string;
  style: DoctrineStyle;
  panels: LayoutPanel[];
}

interface GridCell {
  occupied: boolean;
}

interface PlacedPanel {
  panel: DoctrinePanel;
  gridCol: number;
  gridRow: number;
  index: number;
}

export function computeLayout(ir: DoctrineLayout): ComputedLayout {
  // CSS grid-style auto-flow placement
  const placed = placeOnGrid(ir.panels, ir.gridColumns);

  // Determine row heights from placed panels
  const maxGridRow = placed.reduce(
    (max, p) => Math.max(max, p.gridRow + p.panel.rowspan - 1),
    0,
  );
  const rowHeights: number[] = new Array(maxGridRow + 1).fill(0);

  // For rowspan=1 panels, their height contributes to their row
  // For rowspan>1 panels, distribute height evenly across spanned rows
  for (const p of placed) {
    const panelHeight = computePanelHeight(p.panel.rows);
    if (p.panel.rowspan === 1) {
      rowHeights[p.gridRow] = Math.max(rowHeights[p.gridRow], panelHeight);
    } else {
      const perRow = panelHeight / p.panel.rowspan;
      for (let r = 0; r < p.panel.rowspan; r++) {
        rowHeights[p.gridRow + r] = Math.max(rowHeights[p.gridRow + r], perRow);
      }
    }
  }

  const panels: LayoutPanel[] = placed.map((p) => {
    const yOffset = computeRowYOffset(p.gridRow, rowHeights);
    // Panel height = sum of spanned row heights + gaps between them
    let totalHeight = 0;
    for (let r = 0; r < p.panel.rowspan; r++) {
      totalHeight += rowHeights[p.gridRow + r];
      if (r > 0) totalHeight += PANEL_GAP;
    }
    return computePanel(
      p.panel,
      ir.gridColumns,
      p.gridCol,
      yOffset,
      p.index,
      ir.style,
      totalHeight,
    );
  });

  return { unitName: ir.unitName, style: ir.style, panels };
}

/**
 * CSS grid auto-flow placement: panels flow left-to-right, top-to-bottom,
 * skipping cells occupied by colspan/rowspan panels.
 */
function placeOnGrid(
  panels: DoctrinePanel[],
  gridColumns: number,
): PlacedPanel[] {
  // Sparse grid: grid[row][col] = occupied
  const grid: boolean[][] = [];

  function isOccupied(row: number, col: number): boolean {
    return grid[row]?.[col] ?? false;
  }

  function occupy(
    row: number,
    col: number,
    rowspan: number,
    colspan: number,
  ): void {
    for (let r = row; r < row + rowspan; r++) {
      if (!grid[r]) grid[r] = [];
      for (let c = col; c < col + colspan; c++) {
        grid[r][c] = true;
      }
    }
  }

  function fits(
    row: number,
    col: number,
    rowspan: number,
    colspan: number,
  ): boolean {
    if (col + colspan > gridColumns) return false;
    for (let r = row; r < row + rowspan; r++) {
      for (let c = col; c < col + colspan; c++) {
        if (isOccupied(r, c)) return false;
      }
    }
    return true;
  }

  const placed: PlacedPanel[] = [];

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    // Find the first available position scanning row by row, left to right
    let found = false;
    for (let row = 0; !found; row++) {
      for (let col = 0; col <= gridColumns - panel.colspan; col++) {
        if (fits(row, col, panel.rowspan, panel.colspan)) {
          occupy(row, col, panel.rowspan, panel.colspan);
          placed.push({ panel, gridCol: col, gridRow: row, index: i });
          found = true;
          break;
        }
      }
    }
  }

  return placed;
}

function computeRowYOffset(gridRow: number, rowHeights: number[]): number {
  let y = PANEL_TOP_PADDING;
  for (let r = 0; r < gridRow; r++) {
    y += (rowHeights[r] ?? 0) + PANEL_GAP;
  }
  return -y;
}

function computePanel(
  panel: DoctrinePanel,
  gridColumns: number,
  gridCol: number,
  yOffset: number,
  panelIndex: number,
  style: DoctrineStyle,
  heightOverride?: number,
): LayoutPanel {
  const panelWidth = computePanelWidth(gridColumns, panel.colspan);
  const panelHeight = heightOverride ?? computePanelHeight(panel.rows);
  const { origin, align } = computePanelPosition(
    gridColumns,
    gridCol,
    yOffset,
    panel.colspan,
  );

  const nodeMap = new Map<string, DoctrineNode>();
  for (const node of panel.nodes) {
    nodeMap.set(node.name, node);
  }

  // Group edges by parent (from node)
  const edgesByParent = new Map<string, DoctrineEdge[]>();
  for (const edge of panel.edges) {
    const existing = edgesByParent.get(edge.from) ?? [];
    existing.push(edge);
    edgesByParent.set(edge.from, existing);
  }

  const layoutNodes: LayoutNodeWithConnectors[] = panel.nodes.map((node) => {
    const layoutNode = computeNodePosition(node, panel.columns, panelWidth);
    const edges = edgesByParent.get(node.name) ?? [];
    const connectors =
      edges.length > 0
        ? computeConnectors(node, edges, nodeMap, panel.columns, panelWidth)
        : [];
    return { node: layoutNode, connectors };
  });

  const anchors = panel.anchors.map((a) =>
    resolveAnchor(a, panelWidth, panelHeight),
  );

  return {
    name: `panel_${panelIndex}`,
    title: panel.title,
    origin,
    align,
    sizeX: panelWidth,
    sizeY: panelHeight,
    bgColor: panel.bgColor ?? style.panelBgColor,
    titleBarHeight: panel.titleBarHeight,
    titleBarColor: panel.titleBarColor,
    titleFont: panel.titleFont,
    anchors,
    nodes: layoutNodes,
  };
}

function computePanelWidth(gridColumns: number, colspan: number): number {
  const totalGap = PANEL_GAP * (gridColumns + 1);
  const availableWidth = SCREEN_WIDTH - totalGap;
  const colWidth = availableWidth / gridColumns;
  return Math.round(colWidth * colspan + PANEL_GAP * (colspan - 1));
}

const PANEL_BOTTOM_PADDING = 80; // space below last row's node centre

function computePanelHeight(rows: number): number {
  return FIRST_ROW_OFFSET + (rows - 1) * ROW_SPACING + PANEL_BOTTOM_PADDING;
}

function computePanelPosition(
  gridColumns: number,
  gridCol: number,
  yOffset: number,
  colspan: number,
): { origin: string; align: Align } {
  // All panels use align="lt" with Y from top-left for consistency
  if (colspan === gridColumns) {
    return { origin: `${PANEL_GAP} ${yOffset}`, align: "lt" as Align };
  }

  if (gridColumns === 1) {
    return { origin: `${PANEL_GAP} ${yOffset}`, align: "lt" as Align };
  }

  if (gridCol === 0) {
    return { origin: `${PANEL_GAP} ${yOffset}`, align: "lt" as Align };
  }
  if (gridCol + colspan === gridColumns) {
    return { origin: `-${PANEL_GAP} ${yOffset}`, align: "rt" as Align };
  }
  return { origin: `0 ${yOffset}`, align: "t" as Align };
}

export function computeNodePosition(
  node: DoctrineNode,
  panelColumns: number,
  panelWidth: number,
): LayoutNode {
  const y = -(node.row * ROW_SPACING + FIRST_ROW_OFFSET);
  const { x, align } = computeColumnPosition(
    node.col,
    panelColumns,
    panelWidth,
  );
  return { name: node.name, origin: `${x} ${y}`, align };
}

function getColumnSpacing(panelColumns: number, panelWidth: number): number {
  if (panelColumns <= 1) return 0;
  return Math.min(panelWidth / panelColumns, MAX_COLUMN_SPACING);
}

function computeColumnPosition(
  col: number,
  panelColumns: number,
  panelWidth: number,
): { x: number; align: Align } {
  if (panelColumns === 1) {
    return { x: 0, align: "t" };
  }

  const spacing = getColumnSpacing(panelColumns, panelWidth);
  // Position relative to panel centre
  const centreX = (col - (panelColumns - 1) / 2) * spacing;

  // When spacing is capped (nodes don't span full width), use centre-relative align
  const spacingCapped = panelWidth / panelColumns > MAX_COLUMN_SPACING;

  const tolerance = 1;
  if (Math.abs(centreX) < tolerance) {
    return { x: 0, align: "t" };
  }

  if (spacingCapped) {
    return { x: Math.round(centreX), align: "t" };
  }

  if (centreX < 0) {
    // Left side: offset from left edge
    const xFromLeft = centreX + panelWidth / 2;
    return { x: Math.round(xFromLeft), align: "lt" };
  }
  // Right side: offset from right edge (negative)
  const xFromRight = centreX - panelWidth / 2;
  return { x: Math.round(xFromRight), align: "rt" };
}

function computeConnectors(
  parentNode: DoctrineNode,
  edges: DoctrineEdge[],
  nodeMap: Map<string, DoctrineNode>,
  panelColumns: number,
  panelWidth: number,
): Connector[] {
  const children = edges.map((e) => nodeMap.get(e.to)!);

  // Classify children by position relative to parent
  const sameCol = children.filter((c) => c.col === parentNode.col);
  const diffCol = children.filter((c) => c.col !== parentNode.col);

  // Same row = horizontal connectors
  const sameRow = children.filter((c) => c.row === parentNode.row);
  const diffRow = children.filter((c) => c.row !== parentNode.row);

  const connectors: Connector[] = [];

  // Horizontal connectors (same row, different column)
  for (const child of sameRow) {
    if (child.col === parentNode.col) continue;
    connectors.push(
      buildHorizontalConnector(parentNode, child, panelColumns, panelWidth),
    );
  }

  // Vertical connectors
  const verticalChildren = diffRow;
  if (verticalChildren.length === 0) return connectors;

  const sameColVertical = verticalChildren.filter(
    (c) => c.col === parentNode.col,
  );
  const diffColVertical = verticalChildren.filter(
    (c) => c.col !== parentNode.col,
  );

  if (sameColVertical.length > 0 && diffColVertical.length === 0) {
    // Straight vertical to same-column child(ren)
    for (const child of sameColVertical) {
      connectors.push(buildStraightVerticalConnector(parentNode, child));
    }
  } else if (sameColVertical.length > 0 && diffColVertical.length > 0) {
    // Branching: vertical bar to same-col child + horizontal branches to diff-col children
    connectors.push(
      buildBranchConnector(
        parentNode,
        sameColVertical[0],
        diffColVertical,
        panelColumns,
        panelWidth,
      ),
    );
  } else if (diffColVertical.length > 0) {
    // Only cross-column children - check if this is a T-junction (parent centred, children on both sides)
    const leftChildren = diffColVertical.filter((c) => c.col < parentNode.col);
    const rightChildren = diffColVertical.filter((c) => c.col > parentNode.col);

    if (leftChildren.length > 0 && rightChildren.length > 0) {
      // T-junction
      connectors.push(
        buildTJunctionConnector(
          parentNode,
          leftChildren,
          rightChildren,
          diffColVertical,
          panelColumns,
          panelWidth,
        ),
      );
    } else {
      // L-shaped connectors
      for (const child of diffColVertical) {
        connectors.push(
          buildLShapedConnector(parentNode, child, panelColumns, panelWidth),
        );
      }
    }
  }

  return connectors;
}

function buildStraightVerticalConnector(
  parent: DoctrineNode,
  child: DoctrineNode,
): Connector {
  const rowDelta = child.row - parent.row;
  const barHeight =
    rowDelta === 1
      ? CONNECTOR_STRAIGHT_BAR_HEIGHT
      : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * ROW_SPACING;

  return {
    segments: [
      {
        type: "vertical_bar",
        origin: `0 -${CONNECTOR_BAR_START_Y}`,
        align: "t",
        sizeX: CONNECTOR_BAR_WIDTH,
        sizeY: barHeight,
      },
      {
        type: "vertical_arrow",
        origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
        align: "b" as Align,
      },
    ],
  };
}

function buildHorizontalConnector(
  parent: DoctrineNode,
  child: DoctrineNode,
  panelColumns: number,
  panelWidth: number,
): Connector {
  const parentX = getColumnCentreX(parent.col, panelColumns, panelWidth);
  const childX = getColumnCentreX(child.col, panelColumns, panelWidth);
  const dx = childX - parentX;
  const barWidth = Math.round(
    Math.abs(dx) - 2 * HORIZONTAL_BAR_START_X - HORIZONTAL_ARROW_WIDTH,
  );

  if (dx > 0) {
    return {
      segments: [
        {
          type: "horizontal_bar",
          origin: `${HORIZONTAL_BAR_START_X} 0`,
          align: "l" as Align,
          sizeX: Math.max(barWidth, 10),
          sizeY: CONNECTOR_BAR_WIDTH,
        },
        {
          type: "horizontal_arrow",
          origin: `${CONNECTOR_ARROW_OFFSET} 0`,
          align: "r" as Align,
        },
      ],
    };
  }
  return {
    segments: [
      {
        type: "horizontal_bar",
        origin: `-${HORIZONTAL_BAR_START_X} 0`,
        align: "r" as Align,
        sizeX: Math.max(barWidth, 10),
        sizeY: CONNECTOR_BAR_WIDTH,
      },
      {
        type: "horizontal_arrow",
        origin: `-${CONNECTOR_ARROW_OFFSET} 0`,
        align: "l" as Align,
      },
    ],
  };
}

function buildBranchConnector(
  parent: DoctrineNode,
  sameColChild: DoctrineNode,
  diffColChildren: DoctrineNode[],
  panelColumns: number,
  panelWidth: number,
): Connector {
  const rowDelta = sameColChild.row - parent.row;
  const barHeight =
    rowDelta === 1
      ? CONNECTOR_STRAIGHT_BAR_HEIGHT
      : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * ROW_SPACING;

  const segments: ConnectorSegment[] = [
    {
      type: "vertical_bar",
      origin: `0 -${CONNECTOR_BAR_START_Y}`,
      align: "t",
      sizeX: CONNECTOR_BAR_WIDTH,
      sizeY: barHeight,
    },
    {
      type: "vertical_arrow",
      origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
      align: "b" as Align,
    },
  ];

  for (const child of diffColChildren) {
    const hBarWidth = getHorizontalBarWidth(
      parent,
      child,
      panelColumns,
      panelWidth,
    );
    const goesRight = child.col > parent.col;

    if (goesRight) {
      segments.push(
        {
          type: "horizontal_bar",
          origin: `${CONNECTOR_BAR_WIDTH} 0`,
          align: "l" as Align,
          sizeX: hBarWidth,
          sizeY: CONNECTOR_BAR_WIDTH,
        },
        {
          type: "vertical_stub",
          origin: "0 0",
          align: "rt" as Align,
          sizeX: CONNECTOR_BAR_WIDTH,
          sizeY: CONNECTOR_STUB_HEIGHT,
        },
        {
          type: "vertical_arrow",
          origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
          align: "b" as Align,
        },
      );
    } else {
      segments.push(
        {
          type: "horizontal_bar",
          origin: `-${CONNECTOR_BAR_WIDTH} 0`,
          align: "r" as Align,
          sizeX: hBarWidth,
          sizeY: CONNECTOR_BAR_WIDTH,
        },
        {
          type: "vertical_stub",
          origin: "0 0",
          align: "lt" as Align,
          sizeX: CONNECTOR_BAR_WIDTH,
          sizeY: CONNECTOR_STUB_HEIGHT,
        },
        {
          type: "vertical_arrow",
          origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
          align: "b" as Align,
        },
      );
    }
  }

  return { segments };
}

function buildTJunctionConnector(
  parent: DoctrineNode,
  leftChildren: DoctrineNode[],
  rightChildren: DoctrineNode[],
  allChildren: DoctrineNode[],
  panelColumns: number,
  panelWidth: number,
): Connector {
  // Find the directly-below child (if any) for the vertical bar
  const belowChild = allChildren.find((c) => c.col === parent.col);
  const segments: ConnectorSegment[] = [];

  if (belowChild) {
    const rowDelta = belowChild.row - parent.row;
    const barHeight =
      rowDelta === 1
        ? CONNECTOR_STRAIGHT_BAR_HEIGHT
        : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * ROW_SPACING;
    segments.push(
      {
        type: "vertical_bar",
        origin: `0 -${CONNECTOR_BAR_START_Y}`,
        align: "t",
        sizeX: CONNECTOR_BAR_WIDTH,
        sizeY: barHeight,
      },
      {
        type: "vertical_arrow",
        origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
        align: "b" as Align,
      },
    );
  }

  // Junction Y: where horizontal bars branch off from vertical
  const junctionY =
    CONNECTOR_BAR_START_Y +
    CONNECTOR_STRAIGHT_BAR_HEIGHT / 2 +
    CONNECTOR_ARROW_OFFSET;

  for (const child of leftChildren) {
    const hBarWidth = getHorizontalBarWidth(
      parent,
      child,
      panelColumns,
      panelWidth,
    );
    segments.push(
      {
        type: "horizontal_bar",
        origin: `-${CONNECTOR_T_JUNCTION_OFFSET} -${junctionY}`,
        align: "r" as Align,
        sizeX: hBarWidth,
        sizeY: CONNECTOR_BAR_WIDTH,
      },
      {
        type: "vertical_stub",
        origin: "0 0",
        align: "lt" as Align,
        sizeX: CONNECTOR_BAR_WIDTH,
        sizeY: CONNECTOR_STUB_HEIGHT,
      },
      {
        type: "vertical_arrow",
        origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
        align: "b" as Align,
      },
    );
  }

  for (const child of rightChildren) {
    const hBarWidth = getHorizontalBarWidth(
      parent,
      child,
      panelColumns,
      panelWidth,
    );
    segments.push(
      {
        type: "horizontal_bar",
        origin: `${CONNECTOR_T_JUNCTION_OFFSET} -${junctionY}`,
        align: "l" as Align,
        sizeX: hBarWidth,
        sizeY: CONNECTOR_BAR_WIDTH,
      },
      {
        type: "vertical_stub",
        origin: "0 0",
        align: "rt" as Align,
        sizeX: CONNECTOR_BAR_WIDTH,
        sizeY: CONNECTOR_STUB_HEIGHT,
      },
      {
        type: "vertical_arrow",
        origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
        align: "b" as Align,
      },
    );
  }

  return { segments };
}

function buildLShapedConnector(
  parent: DoctrineNode,
  child: DoctrineNode,
  panelColumns: number,
  panelWidth: number,
): Connector {
  const rowDelta = child.row - parent.row;
  const barHeight =
    rowDelta === 1
      ? CONNECTOR_STRAIGHT_BAR_HEIGHT
      : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * ROW_SPACING;

  const hBarWidth = getHorizontalBarWidth(
    parent,
    child,
    panelColumns,
    panelWidth,
  );
  const goesRight = child.col > parent.col;

  const segments: ConnectorSegment[] = [
    {
      type: "vertical_bar",
      origin: `0 -${CONNECTOR_BAR_START_Y}`,
      align: "t",
      sizeX: CONNECTOR_BAR_WIDTH,
      sizeY: barHeight,
    },
    {
      type: "vertical_arrow",
      origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
      align: "b" as Align,
    },
  ];

  if (goesRight) {
    segments.push(
      {
        type: "horizontal_bar",
        origin: `${CONNECTOR_BAR_WIDTH} 0`,
        align: "l" as Align,
        sizeX: hBarWidth,
        sizeY: CONNECTOR_BAR_WIDTH,
      },
      {
        type: "vertical_stub",
        origin: "0 0",
        align: "rt" as Align,
        sizeX: CONNECTOR_BAR_WIDTH,
        sizeY: CONNECTOR_STUB_HEIGHT,
      },
      {
        type: "vertical_arrow",
        origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
        align: "b" as Align,
      },
    );
  } else {
    segments.push(
      {
        type: "horizontal_bar",
        origin: `-${CONNECTOR_BAR_WIDTH} 0`,
        align: "r" as Align,
        sizeX: hBarWidth,
        sizeY: CONNECTOR_BAR_WIDTH,
      },
      {
        type: "vertical_stub",
        origin: "0 0",
        align: "lt" as Align,
        sizeX: CONNECTOR_BAR_WIDTH,
        sizeY: CONNECTOR_STUB_HEIGHT,
      },
      {
        type: "vertical_arrow",
        origin: `0 -${CONNECTOR_ARROW_OFFSET}`,
        align: "b" as Align,
      },
    );
  }

  return { segments };
}

function getColumnCentreX(
  col: number,
  panelColumns: number,
  panelWidth: number,
): number {
  const spacing = getColumnSpacing(panelColumns, panelWidth);
  return (col - (panelColumns - 1) / 2) * spacing;
}

function getHorizontalBarWidth(
  parent: DoctrineNode,
  child: DoctrineNode,
  panelColumns: number,
  panelWidth: number,
): number {
  const parentX = getColumnCentreX(parent.col, panelColumns, panelWidth);
  const childX = getColumnCentreX(child.col, panelColumns, panelWidth);
  return Math.round(Math.abs(childX - parentX));
}

function resolvePercentage(value: string, reference: number): number {
  return Math.round((parseFloat(value.slice(0, -1)) / 100) * reference);
}

function resolveDimValue(
  value: DimValue,
  widthRef: number,
  heightRef: number,
  axis: "x" | "y",
): number {
  if (typeof value === "number") return value;
  const ref = axis === "x" ? widthRef : heightRef;
  return resolvePercentage(value, ref);
}

function resolveAnchor(
  anchor: Anchor,
  panelWidth: number,
  panelHeight: number,
): ResolvedAnchor {
  const anchorX = resolvePercentage(anchor.x, panelWidth);
  const anchorY = resolvePercentage(anchor.y, panelHeight);

  const decors: ResolvedDecor[] = anchor.decors.map((d) => {
    const width =
      d.width !== undefined
        ? resolveDimValue(d.width, panelWidth, panelHeight, "x")
        : undefined;
    const height =
      d.height !== undefined
        ? resolveDimValue(d.height, panelWidth, panelHeight, "y")
        : undefined;

    let x = anchorX + (d.x ?? 0);
    let y = anchorY + (d.y ?? 0);

    // Clamp to panel bounds when dimensions are known
    if (width !== undefined) {
      if (x + width > panelWidth) x = panelWidth - width;
      if (x < 0) x = 0;
    }
    if (height !== undefined) {
      if (y + height > panelHeight) y = panelHeight - height;
      if (y < 0) y = 0;
    }

    return {
      texture: d.texture,
      x,
      y,
      width,
      height,
      color: d.color,
      flipX: d.flipX,
    };
  });

  return { decors };
}
