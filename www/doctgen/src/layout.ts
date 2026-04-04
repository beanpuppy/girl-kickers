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
const DEFAULT_ROW_SPACING = 180;
const DEFAULT_FIRST_ROW_OFFSET = 160;
const DEFAULT_PANEL_BOTTOM_PADDING = 80;
const TITLE_BAR_HEIGHT = 72;
const PANEL_TOP_PADDING = 70; // origin Y offset from screen top
const DEFAULT_PANEL_GAP = 20;
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
  childNames: string[];
}

export interface LayoutNodeWithConnectors {
  node: LayoutNode;
  connectors: Connector[];
  childNames: string[];
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
  titleColor: string;
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
  const baseGap = ir.gap ?? DEFAULT_PANEL_GAP;
  const colGap = ir.columnGap ?? baseGap;
  const rowGap = ir.rowGap ?? baseGap;

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
    const panelHeight =
      p.panel.height ??
      computePanelHeight(
        p.panel.rows,
        p.panel.paddingTop,
        p.panel.paddingBottom,
        p.panel.rowSpacing,
      );
    if (p.panel.rowspan === 1) {
      rowHeights[p.gridRow] = Math.max(rowHeights[p.gridRow], panelHeight);
    } else {
      const perRow = panelHeight / p.panel.rowspan;
      for (let r = 0; r < p.panel.rowspan; r++) {
        rowHeights[p.gridRow + r] = Math.max(rowHeights[p.gridRow + r], perRow);
      }
    }
  }

  // Compute effective widths: if some panels in a row have explicit widths,
  // distribute the remaining screen space among auto-width panels
  const effectiveWidths = computeEffectiveWidths(
    placed,
    ir.gridColumns,
    colGap,
  );

  const panels: LayoutPanel[] = placed.map((p, i) => {
    const yOffset = computeRowYOffset(p.gridRow, rowHeights, rowGap);
    // Panel height = sum of spanned row heights + gaps between them
    let totalHeight = 0;
    for (let r = 0; r < p.panel.rowspan; r++) {
      totalHeight += rowHeights[p.gridRow + r];
      if (r > 0) totalHeight += rowGap;
    }
    return computePanel(
      p.panel,
      ir.gridColumns,
      p.gridCol,
      yOffset,
      p.index,
      ir.style,
      totalHeight,
      effectiveWidths[i],
      colGap,
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

function computeRowYOffset(
  gridRow: number,
  rowHeights: number[],
  gap: number,
): number {
  let y = PANEL_TOP_PADDING;
  for (let r = 0; r < gridRow; r++) {
    y += (rowHeights[r] ?? 0) + gap;
  }
  return -y;
}

function computeEffectiveWidths(
  placed: PlacedPanel[],
  gridColumns: number,
  gap: number,
): (number | undefined)[] {
  const widths: (number | undefined)[] = new Array(placed.length).fill(
    undefined,
  );

  // Check if any panel has an explicit width
  const hasExplicitWidth = placed.some((p) => p.panel.width !== undefined);
  if (!hasExplicitWidth) return widths;

  // Group panels by grid row
  const rowPanels = new Map<number, number[]>();
  for (let i = 0; i < placed.length; i++) {
    const row = placed[i].gridRow;
    const group = rowPanels.get(row) ?? [];
    group.push(i);
    rowPanels.set(row, group);
  }

  for (const indices of rowPanels.values()) {
    let explicitTotal = 0;
    let autoColspanTotal = 0;

    for (const i of indices) {
      if (placed[i].panel.width !== undefined) {
        explicitTotal += placed[i].panel.width!;
      } else {
        autoColspanTotal += placed[i].panel.colspan;
      }
    }

    if (autoColspanTotal === 0) continue; // all explicit, nothing to distribute

    // Available space = screen width minus gaps minus explicit widths
    const totalGaps = gap * (indices.length + 1);
    const availableForAuto = SCREEN_WIDTH - totalGaps - explicitTotal;
    const perColspan = availableForAuto / autoColspanTotal;

    for (const i of indices) {
      if (placed[i].panel.width === undefined) {
        widths[i] = Math.round(perColspan * placed[i].panel.colspan);
      }
    }
  }

  return widths;
}

function computePanel(
  panel: DoctrinePanel,
  gridColumns: number,
  gridCol: number,
  yOffset: number,
  panelIndex: number,
  style: DoctrineStyle,
  heightOverride?: number,
  widthOverride?: number,
  gap: number = DEFAULT_PANEL_GAP,
): LayoutPanel {
  const panelWidth =
    widthOverride ??
    panel.width ??
    computePanelWidth(gridColumns, panel.colspan, gap);
  const panelHeight =
    panel.height ??
    heightOverride ??
    computePanelHeight(
      panel.rows,
      panel.paddingTop,
      panel.paddingBottom,
      panel.rowSpacing,
    );
  const { origin, align } = computePanelPosition(
    gridColumns,
    gridCol,
    yOffset,
    panel.colspan,
    gap,
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

  const pTop = panel.paddingTop ?? DEFAULT_FIRST_ROW_OFFSET;
  const pRowSpacing = panel.rowSpacing ?? DEFAULT_ROW_SPACING;

  const layoutNodes: LayoutNodeWithConnectors[] = panel.nodes.map((node) => {
    const layoutNode = computeNodePosition(
      node,
      panel.columns,
      panelWidth,
      pTop,
      pRowSpacing,
    );
    const edges = edgesByParent.get(node.name) ?? [];
    const connectors =
      edges.length > 0
        ? computeConnectors(
            node,
            edges,
            nodeMap,
            panel.columns,
            panelWidth,
            pRowSpacing,
          )
        : [];
    const childNames = edges.map((e) => e.to);
    return { node: layoutNode, connectors, childNames };
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
    bgColor: panel.bgColor,
    titleColor: panel.titleColor,
    titleBarHeight: panel.titleBarHeight,
    titleBarColor: panel.titleBarColor,
    titleFont: panel.titleFont,
    anchors,
    nodes: layoutNodes,
  };
}

function computePanelWidth(
  gridColumns: number,
  colspan: number,
  gap: number = DEFAULT_PANEL_GAP,
): number {
  const totalGap = gap * (gridColumns + 1);
  const availableWidth = SCREEN_WIDTH - totalGap;
  const colWidth = availableWidth / gridColumns;
  return Math.round(colWidth * colspan + gap * (colspan - 1));
}

function computePanelHeight(
  rows: number,
  paddingTop: number = DEFAULT_FIRST_ROW_OFFSET,
  paddingBottom: number = DEFAULT_PANEL_BOTTOM_PADDING,
  rowSpacing: number = DEFAULT_ROW_SPACING,
): number {
  return paddingTop + (rows - 1) * rowSpacing + paddingBottom;
}

function computePanelPosition(
  gridColumns: number,
  gridCol: number,
  yOffset: number,
  colspan: number,
  gap: number,
): { origin: string; align: Align } {
  if (colspan === gridColumns) {
    return { origin: `${gap} ${yOffset}`, align: "lt" as Align };
  }

  if (gridColumns === 1) {
    return { origin: `${gap} ${yOffset}`, align: "lt" as Align };
  }

  if (gridCol === 0) {
    return { origin: `${gap} ${yOffset}`, align: "lt" as Align };
  }
  if (gridCol + colspan === gridColumns) {
    return { origin: `-${gap} ${yOffset}`, align: "rt" as Align };
  }
  return { origin: `0 ${yOffset}`, align: "t" as Align };
}

export function computeNodePosition(
  node: DoctrineNode,
  panelColumns: number,
  panelWidth: number,
  paddingTop: number = DEFAULT_FIRST_ROW_OFFSET,
  rowSpacing: number = DEFAULT_ROW_SPACING,
): LayoutNode {
  const y = -(node.row * rowSpacing + paddingTop);
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
  rowSpacing: number = DEFAULT_ROW_SPACING,
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
      connectors.push(
        buildStraightVerticalConnector(parentNode, child, rowSpacing),
      );
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
        rowSpacing,
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
          rowSpacing,
        ),
      );
    } else {
      // L-shaped connectors
      for (const child of diffColVertical) {
        connectors.push(
          buildLShapedConnector(
            parentNode,
            child,
            panelColumns,
            panelWidth,
            rowSpacing,
          ),
        );
      }
    }
  }

  return connectors;
}

function buildStraightVerticalConnector(
  parent: DoctrineNode,
  child: DoctrineNode,
  rowSpacing: number = DEFAULT_ROW_SPACING,
): Connector {
  const rowDelta = child.row - parent.row;
  const barHeight =
    rowDelta === 1
      ? CONNECTOR_STRAIGHT_BAR_HEIGHT
      : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * rowSpacing;

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
  rowSpacing: number = DEFAULT_ROW_SPACING,
): Connector {
  const rowDelta = sameColChild.row - parent.row;
  const barHeight =
    rowDelta === 1
      ? CONNECTOR_STRAIGHT_BAR_HEIGHT
      : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * rowSpacing;

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
  rowSpacing: number = DEFAULT_ROW_SPACING,
): Connector {
  // Find the directly-below child (if any) for the vertical bar
  const belowChild = allChildren.find((c) => c.col === parent.col);
  const segments: ConnectorSegment[] = [];

  if (belowChild) {
    const rowDelta = belowChild.row - parent.row;
    const barHeight =
      rowDelta === 1
        ? CONNECTOR_STRAIGHT_BAR_HEIGHT
        : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * rowSpacing;
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
  rowSpacing: number = DEFAULT_ROW_SPACING,
): Connector {
  const rowDelta = child.row - parent.row;
  const barHeight =
    rowDelta === 1
      ? CONNECTOR_STRAIGHT_BAR_HEIGHT
      : CONNECTOR_STRAIGHT_BAR_HEIGHT + (rowDelta - 1) * rowSpacing;

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
