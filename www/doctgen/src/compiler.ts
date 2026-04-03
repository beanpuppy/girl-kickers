import { parse } from "kdljs";

export interface DoctrineNode {
  name: string;
  col: number;
  row: number;
}

export interface DoctrineEdge {
  from: string;
  to: string;
}

// A dimension value: number = pixels, string = percentage of panel dimension (e.g. "50%")
export type DimValue = number | string;

export interface Decor {
  texture: string;
  x?: number;
  y?: number;
  width?: DimValue;
  height?: DimValue;
  color?: string;
  flipX?: boolean;
}

export interface Anchor {
  x: string; // percentage, e.g. "50%"
  y: string; // percentage, e.g. "50%"
  decors: Decor[];
}

export interface DoctrinePanel {
  title: string;
  columns: number;
  rows: number;
  colspan: number;
  nodes: DoctrineNode[];
  edges: DoctrineEdge[];
  anchors: Anchor[];
  bgColor: string;
  titleColor: string;
  rowspan: number;
  titleBarHeight: number;
  titleBarColor: string;
  titleFont: string;
}

export interface DoctrineStyle {
  inactiveColor: string;
  activeColor: string;
}

export const DEFAULT_STYLE: DoctrineStyle = {
  inactiveColor: "716b5f",
  activeColor: "f97b03",
};

export interface DoctrineLayout {
  gridColumns: number;
  unitName: string;
  panels: DoctrinePanel[];
  style: DoctrineStyle;
}

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompileError";
  }
}

interface KdlNode {
  name: string;
  properties: Record<string, string | number | boolean | null>;
  values: (string | number | boolean | null)[];
  children: KdlNode[];
}

export function parseKdl(kdlText: string): DoctrineLayout {
  const result = parse(kdlText);

  if (result.errors.length > 0) {
    throw new CompileError(`KDL parse error: ${result.errors[0]}`);
  }

  if (!result.output) {
    throw new CompileError("KDL parse failed");
  }

  const gridNode = result.output.find((n: KdlNode) => n.name === "grid");
  if (!gridNode) {
    throw new CompileError('Missing top-level "grid" node');
  }

  const gridColumns = gridNode.properties.columns;
  if (
    typeof gridColumns !== "number" ||
    gridColumns < 1 ||
    !Number.isInteger(gridColumns)
  ) {
    throw new CompileError(
      '"grid" requires a positive integer "columns" property',
    );
  }

  const unitName = gridNode.properties.unit;
  if (typeof unitName !== "string" || unitName.length === 0) {
    throw new CompileError('"grid" requires a "unit" string property');
  }

  const panels: DoctrinePanel[] = [];
  for (const child of gridNode.children) {
    if (child.name === "panel") {
      panels.push(parsePanel(child, gridColumns));
    } else {
      throw new CompileError(
        `Unexpected node "${child.name}" inside grid, expected "panel"`,
      );
    }
  }

  if (panels.length === 0) {
    throw new CompileError("Grid must contain at least one panel");
  }

  const style: DoctrineStyle = {
    inactiveColor:
      optionalString(gridNode, "inactive-color") ?? DEFAULT_STYLE.inactiveColor,
    activeColor:
      optionalString(gridNode, "active-color") ?? DEFAULT_STYLE.activeColor,
  };

  return { gridColumns, unitName, panels, style };
}

function optionalString(node: KdlNode, key: string): string | undefined {
  const val = node.properties[key];
  if (val === undefined || val === null) return undefined;
  if (typeof val !== "string") {
    throw new CompileError(`"${key}" must be a string`);
  }
  return val;
}

function parsePanel(panelNode: KdlNode, gridColumns: number): DoctrinePanel {
  const title = panelNode.properties.title;
  if (typeof title !== "string") {
    throw new CompileError('Panel requires a "title" string property');
  }

  const columns = panelNode.properties.columns;
  if (
    typeof columns !== "number" ||
    columns < 1 ||
    !Number.isInteger(columns)
  ) {
    throw new CompileError(
      `Panel "${title}": requires a positive integer "columns" property`,
    );
  }

  const rows = panelNode.properties.rows;
  if (typeof rows !== "number" || rows < 1 || !Number.isInteger(rows)) {
    throw new CompileError(
      `Panel "${title}": requires a positive integer "rows" property`,
    );
  }

  const colspan = (panelNode.properties.colspan as number | undefined) ?? 1;
  if (
    typeof colspan !== "number" ||
    colspan < 1 ||
    !Number.isInteger(colspan)
  ) {
    throw new CompileError(
      `Panel "${title}": "colspan" must be a positive integer`,
    );
  }
  if (colspan > gridColumns) {
    throw new CompileError(
      `Panel "${title}": colspan ${colspan} exceeds grid columns ${gridColumns}`,
    );
  }

  const nodes: DoctrineNode[] = [];
  const edges: DoctrineEdge[] = [];
  const anchors: Anchor[] = [];
  const nodeNames = new Set<string>();

  for (const child of panelNode.children) {
    if (child.name === "node") {
      const node = parseNode(child, title, columns, rows);
      if (nodeNames.has(node.name)) {
        throw new CompileError(
          `Panel "${title}": duplicate node "${node.name}"`,
        );
      }
      nodeNames.add(node.name);
      nodes.push(node);
    } else if (child.name === "edge") {
      edges.push(parseEdge(child, title));
    } else if (child.name === "anchor") {
      anchors.push(parseAnchor(child, title));
    } else {
      throw new CompileError(
        `Panel "${title}": unexpected node "${child.name}", expected "node", "edge", or "anchor"`,
      );
    }
  }

  for (const edge of edges) {
    if (!nodeNames.has(edge.from)) {
      throw new CompileError(
        `Panel "${title}": edge references unknown node "${edge.from}"`,
      );
    }
    if (!nodeNames.has(edge.to)) {
      throw new CompileError(
        `Panel "${title}": edge references unknown node "${edge.to}"`,
      );
    }
    if (edge.from === edge.to) {
      throw new CompileError(
        `Panel "${title}": edge cannot connect a node to itself ("${edge.from}")`,
      );
    }
  }

  const rowspan = (panelNode.properties.rowspan as number | undefined) ?? 1;
  if (
    typeof rowspan !== "number" ||
    rowspan < 1 ||
    !Number.isInteger(rowspan)
  ) {
    throw new CompileError(
      `Panel "${title}": "rowspan" must be a positive integer`,
    );
  }

  const bgColor = optionalString(panelNode, "bg-color") ?? "211e1d80";
  const titleColor = optionalString(panelNode, "title-color") ?? "f0e3cc";
  const titleBarHeight =
    (panelNode.properties["title-bar-height"] as number | undefined) ?? 72;
  const titleBarColor =
    optionalString(panelNode, "title-bar-color") ?? "211e1d40";
  const titleFont = optionalString(panelNode, "title-font") ?? "header_3";

  return {
    title,
    columns,
    rows,
    colspan,
    rowspan,
    nodes,
    edges,
    anchors,
    bgColor,
    titleColor,
    titleBarHeight,
    titleBarColor,
    titleFont,
  };
}

function parseNode(
  nodeNode: KdlNode,
  panelTitle: string,
  panelColumns: number,
  panelRows: number,
): DoctrineNode {
  const name = nodeNode.values[0];
  if (typeof name !== "string" || name.length === 0) {
    throw new CompileError(
      `Panel "${panelTitle}": node requires a string name as first argument`,
    );
  }

  const col = nodeNode.properties.col;
  if (typeof col !== "number" || col < 0) {
    throw new CompileError(
      `Panel "${panelTitle}", node "${name}": requires a non-negative "col" property`,
    );
  }
  if (col > panelColumns - 1) {
    throw new CompileError(
      `Panel "${panelTitle}", node "${name}": col ${col} exceeds panel columns (0-${panelColumns - 1})`,
    );
  }

  const row = nodeNode.properties.row;
  if (typeof row !== "number" || row < 0 || !Number.isInteger(row)) {
    throw new CompileError(
      `Panel "${panelTitle}", node "${name}": requires a non-negative integer "row" property`,
    );
  }
  if (row > panelRows - 1) {
    throw new CompileError(
      `Panel "${panelTitle}", node "${name}": row ${row} exceeds panel rows (0-${panelRows - 1})`,
    );
  }

  return { name, col, row };
}

function parsePercentage(
  val: string | number | boolean | null | undefined,
  name: string,
  context: string,
): string {
  if (typeof val !== "string" || !val.endsWith("%")) {
    throw new CompileError(
      `${context}: "${name}" must be a percentage string (e.g. "50%")`,
    );
  }
  const num = parseFloat(val.slice(0, -1));
  if (isNaN(num)) {
    throw new CompileError(
      `${context}: "${name}" percentage is not a number: "${val}"`,
    );
  }
  return val;
}

function parseDimValue(
  val: string | number | boolean | null | undefined,
  name: string,
  context: string,
): DimValue | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "number") return val;
  if (typeof val === "string" && val.endsWith("%")) {
    const num = parseFloat(val.slice(0, -1));
    if (isNaN(num)) {
      throw new CompileError(
        `${context}: "${name}" percentage is not a number: "${val}"`,
      );
    }
    return val;
  }
  throw new CompileError(
    `${context}: "${name}" must be a number or percentage string (e.g. "50%")`,
  );
}

function parseAnchor(anchorNode: KdlNode, panelTitle: string): Anchor {
  const ctx = `Panel "${panelTitle}" anchor`;
  const x = parsePercentage(anchorNode.properties.x, "x", ctx);
  const y = parsePercentage(anchorNode.properties.y, "y", ctx);

  const decors: Decor[] = [];
  for (const child of anchorNode.children) {
    if (child.name === "decor") {
      decors.push(parseDecor(child, panelTitle));
    } else {
      throw new CompileError(
        `${ctx}: unexpected node "${child.name}", expected "decor"`,
      );
    }
  }

  if (decors.length === 0) {
    throw new CompileError(`${ctx}: anchor must contain at least one decor`);
  }

  return { x, y, decors };
}

function parseDecor(decorNode: KdlNode, panelTitle: string): Decor {
  const ctx = `Panel "${panelTitle}" decor`;
  const texture = decorNode.values[0];
  if (typeof texture !== "string" || texture.length === 0) {
    throw new CompileError(`${ctx}: requires a texture path as first argument`);
  }

  const x = decorNode.properties.x;
  const y = decorNode.properties.y;

  return {
    texture,
    x: typeof x === "number" ? x : undefined,
    y: typeof y === "number" ? y : undefined,
    width: parseDimValue(decorNode.properties.width, "width", ctx),
    height: parseDimValue(decorNode.properties.height, "height", ctx),
    color: optionalString(decorNode, "color"),
    flipX: decorNode.properties["flip-x"] === "true" ? true : undefined,
  };
}

function parseEdge(edgeNode: KdlNode, panelTitle: string): DoctrineEdge {
  const from = edgeNode.values[0];
  const to = edgeNode.values[1];

  if (typeof from !== "string" || typeof to !== "string") {
    throw new CompileError(
      `Panel "${panelTitle}": edge requires two string arguments (from, to)`,
    );
  }

  return { from, to };
}
