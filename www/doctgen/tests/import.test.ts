import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { importDoctrineXml, layoutToKdl } from "../src/import.ts";
import { parseKdl } from "../src/compiler.ts";
import { computeLayout } from "../src/layout.ts";
import { generateXml, generateCombinedXml } from "../src/xmlgen.ts";

// Helper: KDL → XML → imported DoctrineLayout
function roundTrip(kdl: string) {
  const ir = parseKdl(kdl);
  const layout = computeLayout(ir);
  const xml = generateXml(layout);
  const layouts = importDoctrineXml(xml);
  expect(layouts).toHaveLength(1);
  return layouts[0];
}

// Helper: full XML round-trip, returns true if XML output is identical
function xmlRoundTrip(kdl: string): boolean {
  const ir = parseKdl(kdl);
  const layout = computeLayout(ir);
  const originalXml = generateXml(layout);

  const imported = importDoctrineXml(originalXml);
  const reimportedLayouts = imported.map((l) => computeLayout(l));
  const reimportedXml =
    reimportedLayouts.length === 1
      ? generateXml(reimportedLayouts[0])
      : generateCombinedXml(reimportedLayouts);

  return originalXml === reimportedXml;
}

describe("importDoctrineXml", () => {
  test("extracts unit name from doctrine tree", () => {
    const layout = roundTrip(`
      grid columns=1 unit="TestUnit" {
        panel title="@t" columns=1 rows=1 {
          node "A" col=0 row=0
        }
      }
    `);
    expect(layout.unitName).toBe("TestUnit");
  });

  test("extracts grid columns", () => {
    const layout = roundTrip(`
      grid columns=3 unit="Test" {
        panel title="@a" columns=2 rows=1 {
          node "A" col=0 row=0
        }
        panel title="@b" columns=2 rows=1 {
          node "B" col=0 row=0
        }
        panel title="@c" columns=2 rows=1 {
          node "C" col=0 row=0
        }
      }
    `);
    expect(layout.gridColumns).toBe(3);
  });

  test("extracts panel title and properties", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@my_title" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=1 row=1
        }
      }
    `);
    expect(layout.panels[0].title).toBe("@my_title");
    expect(layout.panels[0].columns).toBe(2);
    expect(layout.panels[0].rows).toBe(2);
  });

  test("extracts custom panel styling", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=1 bg-color="ff0000" \
            title-color="00ff00" title-bar-height=90 \
            title-bar-color="0000ff" title-font="header_2" {
          node "A" col=0 row=0
        }
      }
    `);
    const p = layout.panels[0];
    expect(p.bgColor).toBe("ff0000");
    expect(p.titleColor).toBe("00ff00");
    expect(p.titleBarHeight).toBe(90);
    expect(p.titleBarColor).toBe("0000ff");
    expect(p.titleFont).toBe("header_2");
  });

  test("extracts colspan", () => {
    const layout = roundTrip(`
      grid columns=3 unit="Test" {
        panel title="@a" columns=1 rows=1 {
          node "A" col=0 row=0
        }
        panel title="@b" columns=1 rows=1 {
          node "B" col=0 row=0
        }
        panel title="@c" columns=1 rows=1 {
          node "C" col=0 row=0
        }
        panel title="@full" columns=4 rows=1 colspan=3 {
          node "D" col=0 row=0
        }
      }
    `);
    expect(layout.panels[3].colspan).toBe(3);
  });

  test("extracts node positions", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=3 {
          node "A" col=0 row=0
          node "B" col=1 row=0
          node "C" col=0 row=1
          node "D" col=1 row=2
        }
      }
    `);
    const nodes = layout.panels[0].nodes;
    expect(nodes).toHaveLength(4);
    expect(nodes[0]).toEqual({ name: "A", col: 0, row: 0 });
    expect(nodes[1]).toEqual({ name: "B", col: 1, row: 0 });
    expect(nodes[2]).toEqual({ name: "C", col: 0, row: 1 });
    expect(nodes[3]).toEqual({ name: "D", col: 1, row: 2 });
  });

  test("extracts fractional column positions", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=1 row=0
          node "C" col=0.5 row=1
        }
      }
    `);
    expect(layout.panels[0].nodes[2].col).toBe(0.5);
  });

  test("extracts 4-column nodes", () => {
    const layout = roundTrip(`
      grid columns=3 unit="Test" {
        panel title="@t" columns=4 rows=1 colspan=3 {
          node "A" col=0 row=0
          node "B" col=1 row=0
          node "C" col=2 row=0
          node "D" col=3 row=0
        }
      }
    `);
    const nodes = layout.panels[0].nodes;
    expect(nodes[0].col).toBe(0);
    expect(nodes[1].col).toBe(1);
    expect(nodes[2].col).toBe(2);
    expect(nodes[3].col).toBe(3);
  });

  test("extracts straight vertical edges", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=0 row=1
          edge "A" "B"
        }
      }
    `);
    expect(layout.panels[0].edges).toEqual([{ from: "A", to: "B" }]);
  });

  test("extracts branch edges", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=0 row=1
          node "C" col=1 row=1
          edge "A" "B"
          edge "A" "C"
        }
      }
    `);
    const edges = layout.panels[0].edges;
    expect(edges).toHaveLength(2);
    expect(edges).toContainEqual({ from: "A", to: "B" });
    expect(edges).toContainEqual({ from: "A", to: "C" });
  });

  test("extracts horizontal edges", () => {
    const layout = roundTrip(`
      grid columns=3 unit="Test" {
        panel title="@t" columns=4 rows=1 colspan=3 {
          node "A" col=0 row=0
          node "B" col=1 row=0
          edge "A" "B"
        }
      }
    `);
    expect(layout.panels[0].edges).toEqual([{ from: "A", to: "B" }]);
  });

  test("extracts decors with pixel dimensions", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=1 {
          anchor x="0%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33"
          }
          node "A" col=0 row=0
        }
      }
    `);
    const anchors = layout.panels[0].anchors;
    expect(anchors).toHaveLength(1);
    expect(anchors[0].x).toBe("0%");
    expect(anchors[0].y).toBe("0%");
    expect(anchors[0].decors[0].texture).toBe(
      "data/textures/gui/deploy/deploy_class_diagonalbars.dds",
    );
    expect(anchors[0].decors[0].width).toBe(190);
    expect(anchors[0].decors[0].height).toBe(75);
    expect(anchors[0].decors[0].color).toBe("0c0b0b33");
  });

  test("extracts decors with percentage dimensions", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=1 {
          anchor x="0%" y="100%" {
            decor "data/textures/gui/square.tga" width="100%" height=8 color="aabbcc"
          }
          node "A" col=0 row=0
        }
      }
    `);
    const anchors = layout.panels[0].anchors;
    expect(anchors[0].x).toBe("0%");
    expect(anchors[0].y).toBe("100%");
    expect(anchors[0].decors[0].width).toBe("100%");
  });

  test("extracts flip-x on decors", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=1 {
          anchor x="100%" y="0%" {
            decor "tex.dds" width=100 height=50 flip-x="true"
          }
          node "A" col=0 row=0
        }
      }
    `);
    expect(layout.panels[0].anchors[0].decors[0].flipX).toBe(true);
  });

  test("extracts connector style colours", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" inactive-color="aabbcc" active-color="ddeeff" {
        panel title="@t" columns=1 rows=2 {
          node "A" col=0 row=0
          node "B" col=0 row=1
          edge "A" "B"
        }
      }
    `);
    expect(layout.style.inactiveColor).toBe("aabbcc");
    expect(layout.style.activeColor).toBe("ddeeff");
  });

  test("defaults style when no connectors exist", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=1 {
          node "A" col=0 row=0
        }
      }
    `);
    expect(layout.style.inactiveColor).toBe("716b5f");
    expect(layout.style.activeColor).toBe("f97b03");
  });
});

describe("XML round-trip", () => {
  test("simple 2-column panel", () => {
    expect(
      xmlRoundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=3 {
          node "A" col=0 row=0
          node "B" col=1 row=0
          node "C" col=0.5 row=2
          edge "A" "C"
        }
      }
    `),
    ).toBe(true);
  });

  test("3-column grid with colspan", () => {
    expect(
      xmlRoundTrip(`
      grid columns=3 unit="Test" {
        panel title="@a" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=1 row=1
          edge "A" "B"
        }
        panel title="@b" columns=1 rows=1 {
          node "C" col=0 row=0
        }
        panel title="@c" columns=1 rows=1 {
          node "D" col=0 row=0
        }
        panel title="@full" columns=4 rows=1 colspan=3 {
          node "E" col=0 row=0
          node "F" col=1 row=0
          node "G" col=2 row=0
          node "H" col=3 row=0
          edge "E" "F"
        }
      }
    `),
    ).toBe(true);
  });

  test("panel with decors and custom styling", () => {
    expect(
      xmlRoundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 title-bar-height=90 \
            title-bar-color="aabb00" title-font="header_2" {
          anchor x="0%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33"
          }
          anchor x="100%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33" flip-x="true"
          }
          node "A" col=0 row=0
          node "B" col=1 row=1
        }
      }
    `),
    ).toBe(true);
  });

  test("branch and straight vertical edges", () => {
    expect(
      xmlRoundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=4 {
          node "A" col=0 row=0
          node "B" col=1 row=0
          node "C" col=0 row=1
          node "D" col=1 row=1
          node "E" col=0 row=2
          node "F" col=1 row=2
          node "G" col=0.5 row=3
          edge "B" "D"
          edge "C" "E"
          edge "C" "F"
        }
      }
    `),
    ).toBe(true);
  });

  test("full DEFY doctrine from file", () => {
    const kdl = readFileSync("../../doctrines/defy.kdl", "utf-8");
    expect(xmlRoundTrip(kdl)).toBe(true);
  });

  test("all 6 units from committed XML", () => {
    const xml = readFileSync("../../mod/gui/gfl_doctrine.xml", "utf-8");
    const layouts = importDoctrineXml(xml);
    expect(layouts).toHaveLength(6);

    // Re-generate and compare
    const reimported = layouts.map((l) => computeLayout(l));
    const reimportedXml = generateCombinedXml(reimported);

    // The committed XML has a trailing newline
    expect(reimportedXml + "\n").toBe(xml);
  });

  test("panel with explicit width and height", () => {
    expect(
      xmlRoundTrip(`
      grid columns=3 unit="Test" {
        panel title="@a" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=1 row=1
        }
        panel title="@b" columns=1 rows=1 {
          node "C" col=0 row=0
        }
        panel title="@c" columns=1 rows=1 {
          node "D" col=0 row=0
        }
        panel title="@big" columns=4 rows=1 colspan=3 width=1200 height=300 {
          node "E" col=0 row=0
          node "F" col=1 row=0
          node "G" col=2 row=0
          node "H" col=3 row=0
        }
      }
    `),
    ).toBe(true);
  });

  test("panel with custom padding and row spacing", () => {
    expect(
      xmlRoundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=3 padding-top=200 padding-bottom=100 row-spacing=150 {
          node "A" col=0 row=0
          node "B" col=1 row=0
          node "C" col=0 row=1
          node "D" col=1 row=2
          edge "A" "C"
        }
      }
    `),
    ).toBe(true);
  });

  test("grid with custom gap", () => {
    expect(
      xmlRoundTrip(`
      grid columns=3 unit="Test" gap=10 {
        panel title="@a" columns=1 rows=1 {
          node "A" col=0 row=0
        }
        panel title="@b" columns=1 rows=1 {
          node "B" col=0 row=0
        }
        panel title="@c" columns=1 rows=1 {
          node "C" col=0 row=0
        }
      }
    `),
    ).toBe(true);
  });

  test("grid with column-gap and row-gap", () => {
    expect(
      xmlRoundTrip(`
      grid columns=3 unit="Test" column-gap=10 row-gap=30 {
        panel title="@a" columns=1 rows=1 {
          node "A" col=0 row=0
        }
        panel title="@b" columns=1 rows=1 {
          node "B" col=0 row=0
        }
        panel title="@c" columns=1 rows=1 {
          node "C" col=0 row=0
        }
        panel title="@d" columns=2 rows=1 colspan=3 {
          node "D" col=0 row=0
        }
      }
    `),
    ).toBe(true);
  });

  test("L-shaped connector", () => {
    expect(
      xmlRoundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=1 row=1
          edge "A" "B"
        }
      }
    `),
    ).toBe(true);
  });

  test("multi-row vertical connector", () => {
    expect(
      xmlRoundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=4 {
          node "A" col=0 row=0
          node "B" col=0 row=3
          edge "A" "B"
        }
      }
    `),
    ).toBe(true);
  });

  test("base game XML import", () => {
    const xml = readFileSync(
      "/home/justin/.local/share/Steam/steamapps/common/DoorKickers2/data/gui/doctrine.xml",
      "utf-8",
    );
    const layouts = importDoctrineXml(xml);
    expect(layouts).toHaveLength(3);
    expect(layouts.map((l) => l.unitName)).toEqual([
      "Rangers",
      "CIA",
      "Nowheraki",
    ]);

    // Rangers: 3 standard panels + 1 elite
    const rangers = layouts[0];
    expect(rangers.panels).toHaveLength(4);
    expect(rangers.panels[0].nodes.length).toBeGreaterThan(0);
    expect(rangers.panels[0].edges.length).toBeGreaterThan(0);

    // Common width (350) is omitted, only outlier (500) gets explicit width
    expect(rangers.panels[0].width).toBeUndefined();
    expect(rangers.panels[1].width).toBe(500);

    // Elite panel has non-default row spacing
    expect(rangers.panels[3].rowSpacing).toBe(160);

    // Decors should be extracted (diagonal bars)
    expect(rangers.panels[0].anchors.length).toBeGreaterThan(0);
  });
});

describe("layoutToKdl", () => {
  test("omits default property values", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=1 {
          node "A" col=0 row=0
        }
      }
    `);
    const kdl = layoutToKdl(layout);
    expect(kdl).not.toContain("bg-color");
    expect(kdl).not.toContain("title-color");
    expect(kdl).not.toContain("title-bar-height");
    expect(kdl).not.toContain("title-bar-color");
    expect(kdl).not.toContain("title-font");
    expect(kdl).not.toContain("inactive-color");
    expect(kdl).not.toContain("active-color");
    expect(kdl).not.toContain("colspan");
    expect(kdl).not.toContain("rowspan");
  });

  test("includes non-default property values", () => {
    const layout = roundTrip(`
      grid columns=1 unit="Test" inactive-color="aabb00" {
        panel title="@t" columns=1 rows=2 title-bar-height=90 {
          node "A" col=0 row=0
          node "B" col=0 row=1
          edge "A" "B"
        }
      }
    `);
    const kdl = layoutToKdl(layout);
    expect(kdl).toContain('inactive-color="aabb00"');
    expect(kdl).toContain("title-bar-height=90");
  });

  test("produces valid KDL that re-parses", () => {
    const layout = roundTrip(`
      grid columns=3 unit="Test" {
        panel title="@a" columns=2 rows=2 {
          node "X" col=0 row=0
          node "Y" col=1 row=1
          edge "X" "Y"
        }
        panel title="@b" columns=1 rows=1 {
          node "Z" col=0 row=0
        }
        panel title="@c" columns=1 rows=1 {
          node "W" col=0 row=0
        }
      }
    `);
    const kdl = layoutToKdl(layout);
    // Should parse without errors
    const reparsed = parseKdl(kdl);
    expect(reparsed.unitName).toBe("Test");
    expect(reparsed.panels).toHaveLength(3);
  });
});
