import type {
  ComputedLayout,
  LayoutPanel,
  LayoutNodeWithConnectors,
  Connector,
  ConnectorSegment,
  ResolvedAnchor,
  ResolvedDecor,
} from "./layout.ts";
import type { DoctrineStyle } from "./compiler.ts";
import { SCREEN_CHROME, BUTTON_TEMPLATE, TOOLTIP } from "./templates.ts";

const VERTICAL_ARROW_TEXTURE = "data/textures/gui/doctrines/doctrine_arrow.dds";
const HORIZONTAL_ARROW_TEXTURE =
  "data/textures/gui/doctrines/gfl_doctrine_horizontal_arrow.dds";
const SQUARE_TEXTURE = "data/textures/gui/square.tga";

export function generateXml(layout: ComputedLayout): string {
  return generateCombinedXml([layout]);
}

export function generateCombinedXml(layouts: ComputedLayout[]): string {
  const parts: string[] = [];

  parts.push(SCREEN_CHROME);
  parts.push("");

  for (const layout of layouts) {
    parts.push(generateDoctrineTree(layout));
    parts.push("");
  }

  parts.push(TOOLTIP);
  parts.push("");
  parts.push("</GUIItems>");

  return parts.join("\n");
}

function generateDoctrineTree(layout: ComputedLayout): string {
  const { style } = layout;
  const lines: string[] = [];
  lines.push(
    `<Item name="#${layout.unitName}_DoctrineTree" align="i" hidden="true">`,
  );
  lines.push(generateButtonTemplate(style));

  for (const panel of layout.panels) {
    lines.push(generatePanel(panel, style));
  }

  lines.push("</Item>");
  return lines.join("\n");
}

function generateButtonTemplate(_style: DoctrineStyle): string {
  return BUTTON_TEMPLATE;
}

function generatePanel(panel: LayoutPanel, style: DoctrineStyle): string {
  const t = "\t";
  const lines: string[] = [];

  lines.push(
    `${t}<Item name="${panel.name}" align="${panel.align}" sizeX="${panel.sizeX}" sizeY="${panel.sizeY}" origin="${panel.origin}">`,
  );

  lines.push(`${t}\t<StaticImage origin="0 0" align="lt">`);
  lines.push(
    `${t}\t\t<RenderObject2D texture="${SQUARE_TEXTURE}" sizeX="${panel.sizeX}" sizeY="${panel.sizeY}" color="${panel.bgColor}"/>`,
  );
  lines.push(`${t}\t\t<StaticImage origin="0 0" align="lt">`);
  lines.push(
    `${t}\t\t\t<RenderObject2D texture="data/textures/gui/squads/rangers_bg_01.dds" sizeX="${panel.sizeX}" sizeY="490" color="0000004d"/>`,
  );
  lines.push(`${t}\t\t</StaticImage>`);
  lines.push(`${t}\t\t<StaticImage origin="0 0" align="lt">`);
  lines.push(
    `${t}\t\t\t<RenderObject2D texture="${SQUARE_TEXTURE}" sizeX="${panel.sizeX}" sizeY="${panel.titleBarHeight}" color="${panel.titleBarColor}"/>`,
  );
  lines.push(`${t}\t\t</StaticImage>`);
  const autoDownsize = panel.titleFont !== "header_3";
  lines.push(
    `${t}\t\t<Item sizeX="${panel.sizeX}" sizeY="${panel.titleBarHeight}" align="lt">`,
  );
  lines.push(
    `${t}\t\t\t<StaticText text="${panel.title}" font="${panel.titleFont}" fontAutoDownsize="${autoDownsize}" textColor="${panel.titleColor}"/>`,
  );
  lines.push(`${t}\t\t</Item>`);
  lines.push(`${t}\t</StaticImage>`);

  for (const anchor of panel.anchors) {
    lines.push(generateAnchor(anchor));
  }

  for (const nodeWithConnectors of panel.nodes) {
    lines.push(generateNode(nodeWithConnectors, style));
  }

  lines.push(`${t}</Item>`);
  return lines.join("\n");
}

function generateAnchor(anchor: ResolvedAnchor): string {
  const t = "\t\t";
  const lines: string[] = [];

  for (const decor of anchor.decors) {
    lines.push(`${t}<StaticImage origin="${decor.x} -${decor.y}" align="lt">`);

    let attrs = `texture="${decor.texture}"`;
    if (decor.width !== undefined) attrs += ` sizeX="${decor.width}"`;
    if (decor.height !== undefined) attrs += ` sizeY="${decor.height}"`;
    if (decor.color) attrs += ` color="${decor.color}"`;
    if (decor.flipX) attrs += ` flipX="true"`;

    lines.push(`${t}\t<RenderObject2D ${attrs}/>`);
    lines.push(`${t}</StaticImage>`);
  }

  return lines.join("\n");
}

function generateNode(
  nwc: LayoutNodeWithConnectors,
  style: DoctrineStyle,
): string {
  const t = "\t\t";
  const { node, connectors } = nwc;

  if (connectors.length === 0) {
    return `${t}<Item name="${node.name}" origin="${node.origin}" align="${node.align}"> </Item>`;
  }

  const lines: string[] = [];
  lines.push(
    `${t}<Item name="${node.name}" origin="${node.origin}" align="${node.align}">`,
  );

  for (const connector of connectors) {
    lines.push(generateConnectorPair(connector, style));
  }

  lines.push(`${t}</Item>`);
  return lines.join("\n");
}

function generateConnectorPair(
  connector: Connector,
  style: DoctrineStyle,
): string {
  const lines: string[] = [];
  lines.push(
    generateConnectorState(
      connector,
      style.inactiveColor,
      "#child_link_inactive",
    ),
  );
  lines.push(
    generateConnectorState(connector, style.activeColor, "#child_link_active"),
  );
  return lines.join("\n");
}

function generateConnectorState(
  connector: Connector,
  colour: string,
  name: string,
): string {
  const t = "\t\t\t";
  const lines: string[] = [];
  lines.push(`${t}<Item name="${name}">`);
  lines.push(renderSegments(connector.segments, 0, colour, `${t}\t`));
  lines.push(`${t}</Item>`);
  return lines.join("\n");
}

function renderSegments(
  segments: ConnectorSegment[],
  startIndex: number,
  colour: string,
  indent: string,
): string {
  if (startIndex >= segments.length) return "";

  const segment = segments[startIndex];
  const lines: string[] = [];

  switch (segment.type) {
    case "vertical_bar": {
      lines.push(
        `${indent}<StaticImage origin="${segment.origin}" align="${segment.align}">`,
      );
      lines.push(
        `${indent}\t<RenderObject2D texture="${SQUARE_TEXTURE}" sizeX="${segment.sizeX}" sizeY="${segment.sizeY}" color="${colour}"/>`,
      );

      const nextIdx = startIndex + 1;
      if (
        nextIdx < segments.length &&
        segments[nextIdx].type === "vertical_arrow"
      ) {
        lines.push(
          `${indent}\t<StaticImage origin="${segments[nextIdx].origin}" align="${segments[nextIdx].align}">`,
        );
        lines.push(
          `${indent}\t\t<RenderObject2D texture="${VERTICAL_ARROW_TEXTURE}" color="${colour}"/>`,
        );
        lines.push(`${indent}\t</StaticImage>`);

        for (let i = nextIdx + 1; i < segments.length; ) {
          const result = renderBranchSegment(
            segments,
            i,
            colour,
            `${indent}\t`,
          );
          lines.push(result.xml);
          i = result.nextIndex;
        }
      }

      lines.push(`${indent}</StaticImage>`);
      break;
    }

    case "horizontal_bar": {
      lines.push(
        `${indent}<StaticImage origin="${segment.origin}" align="${segment.align}">`,
      );
      lines.push(
        `${indent}\t<RenderObject2D texture="${SQUARE_TEXTURE}" sizeX="${segment.sizeX}" sizeY="${segment.sizeY}" color="${colour}"/>`,
      );

      const nextIdx = startIndex + 1;
      if (
        nextIdx < segments.length &&
        segments[nextIdx].type === "horizontal_arrow"
      ) {
        lines.push(
          `${indent}\t<StaticImage origin="${segments[nextIdx].origin}" align="${segments[nextIdx].align}">`,
        );
        lines.push(
          `${indent}\t\t<RenderObject2D texture="${HORIZONTAL_ARROW_TEXTURE}" color="${colour}"/>`,
        );
        lines.push(`${indent}\t</StaticImage>`);
      }

      lines.push(`${indent}</StaticImage>`);
      break;
    }

    default:
      break;
  }

  return lines.join("\n");
}

function renderBranchSegment(
  segments: ConnectorSegment[],
  index: number,
  colour: string,
  indent: string,
): { xml: string; nextIndex: number } {
  const segment = segments[index];
  const lines: string[] = [];

  if (segment.type === "horizontal_bar") {
    lines.push(
      `${indent}<StaticImage origin="${segment.origin}" align="${segment.align}">`,
    );
    lines.push(
      `${indent}\t<RenderObject2D texture="${SQUARE_TEXTURE}" sizeX="${segment.sizeX}" sizeY="${segment.sizeY}" color="${colour}"/>`,
    );

    let nextIdx = index + 1;

    if (
      nextIdx < segments.length &&
      segments[nextIdx].type === "vertical_stub"
    ) {
      const stub = segments[nextIdx];
      lines.push(
        `${indent}\t<StaticImage origin="${stub.origin}" align="${stub.align}">`,
      );
      lines.push(
        `${indent}\t\t<RenderObject2D texture="${SQUARE_TEXTURE}" sizeX="${stub.sizeX}" sizeY="${stub.sizeY}" color="${colour}"/>`,
      );

      nextIdx++;
      if (
        nextIdx < segments.length &&
        segments[nextIdx].type === "vertical_arrow"
      ) {
        lines.push(
          `${indent}\t\t<StaticImage origin="${segments[nextIdx].origin}" align="${segments[nextIdx].align}">`,
        );
        lines.push(
          `${indent}\t\t\t<RenderObject2D texture="${VERTICAL_ARROW_TEXTURE}" color="${colour}"/>`,
        );
        lines.push(`${indent}\t\t</StaticImage>`);
        nextIdx++;
      }

      lines.push(`${indent}\t</StaticImage>`);
    } else if (
      nextIdx < segments.length &&
      segments[nextIdx].type === "horizontal_arrow"
    ) {
      lines.push(
        `${indent}\t<StaticImage origin="${segments[nextIdx].origin}" align="${segments[nextIdx].align}">`,
      );
      lines.push(
        `${indent}\t\t<RenderObject2D texture="${HORIZONTAL_ARROW_TEXTURE}" color="${colour}"/>`,
      );
      lines.push(`${indent}\t</StaticImage>`);
      nextIdx++;
    }

    lines.push(`${indent}</StaticImage>`);
    return { xml: lines.join("\n"), nextIndex: nextIdx };
  }

  return { xml: "", nextIndex: index + 1 };
}
