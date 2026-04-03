import { describe, test, expect } from "bun:test";
import { computeLayout, computeNodePosition } from "../src/layout.ts";
import { parseKdl } from "../src/compiler.ts";

describe("computeNodePosition", () => {
  test("2-column 400px panel: left column", () => {
    const pos = computeNodePosition({ name: "A", col: 0, row: 0 }, 2, 400);
    expect(pos.align).toBe("lt");
    expect(pos.origin).toBe("100 -160");
  });

  test("2-column 400px panel: right column", () => {
    const pos = computeNodePosition({ name: "A", col: 1, row: 0 }, 2, 400);
    expect(pos.align).toBe("rt");
    expect(pos.origin).toBe("-100 -160");
  });

  test("2-column panel: centred node at col=0.5", () => {
    const pos = computeNodePosition({ name: "A", col: 0.5, row: 0 }, 2, 400);
    expect(pos.align).toBe("t");
    expect(pos.origin).toBe("0 -160");
  });

  test("row spacing: row 0 at -160, row 1 at -340", () => {
    const pos0 = computeNodePosition({ name: "A", col: 0, row: 0 }, 2, 400);
    const pos1 = computeNodePosition({ name: "B", col: 0, row: 1 }, 2, 400);
    expect(pos0.origin).toContain("-160");
    expect(pos1.origin).toContain("-340");
  });

  test("row 2 at -520, row 3 at -700", () => {
    const pos2 = computeNodePosition({ name: "A", col: 0, row: 2 }, 2, 400);
    const pos3 = computeNodePosition({ name: "B", col: 0, row: 3 }, 2, 400);
    expect(pos2.origin).toContain("-520");
    expect(pos3.origin).toContain("-700");
  });

  test("3-column 500px panel: left, centre, right", () => {
    const left = computeNodePosition({ name: "A", col: 0, row: 0 }, 3, 500);
    const centre = computeNodePosition({ name: "B", col: 1, row: 0 }, 3, 500);
    const right = computeNodePosition({ name: "C", col: 2, row: 0 }, 3, 500);

    expect(left.align).toBe("lt");
    expect(centre.align).toBe("t");
    expect(right.align).toBe("rt");
  });

  test("1-column panel: always centred", () => {
    const pos = computeNodePosition({ name: "A", col: 0, row: 0 }, 1, 400);
    expect(pos.align).toBe("t");
    expect(pos.origin).toBe("0 -160");
  });
});

describe("computeLayout", () => {
  test("3 panels in a 3-column grid: left, centre, right alignment", () => {
    const ir = parseKdl(`
      grid columns=3 unit="Test" {
        panel title="@left" columns=2 rows=2 {
          node "A" col=0 row=0
        }
        panel title="@centre" columns=2 rows=2 {
          node "B" col=0 row=0
        }
        panel title="@right" columns=2 rows=2 {
          node "C" col=0 row=0
        }
      }
    `);

    const layout = computeLayout(ir);
    expect(layout.panels).toHaveLength(3);
    expect(layout.panels[0].align).toBe("lt");
    expect(layout.panels[1].align).toBe("t");
    expect(layout.panels[2].align).toBe("rt");
  });

  test('full-width panel uses align="lt"', () => {
    const ir = parseKdl(`
      grid columns=3 unit="Test" {
        panel title="@full" columns=4 rows=1 colspan=3 {
          node "A" col=0 row=0
        }
      }
    `);

    const layout = computeLayout(ir);
    expect(layout.panels[0].align).toBe("lt");
  });

  test("panel wraps to next row when grid is full", () => {
    const ir = parseKdl(`
      grid columns=2 unit="Test" {
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
    `);

    const layout = computeLayout(ir);
    // Third panel wraps to second row, should be back at left
    expect(layout.panels[2].align).toBe("lt");
    // Its Y should be further down than the first row
    const y0 = parseInt(layout.panels[0].origin.split(" ")[1]);
    const y2 = parseInt(layout.panels[2].origin.split(" ")[1]);
    expect(y2).toBeLessThan(y0);
  });

  test("nodes without edges have no connectors", () => {
    const ir = parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=1 row=1
        }
      }
    `);

    const layout = computeLayout(ir);
    for (const n of layout.panels[0].nodes) {
      expect(n.connectors).toHaveLength(0);
    }
  });

  test("straight vertical edge produces connector on parent", () => {
    const ir = parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "Parent" col=0 row=0
          node "Child" col=0 row=1
          edge "Parent" "Child"
        }
      }
    `);

    const layout = computeLayout(ir);
    const parent = layout.panels[0].nodes.find(
      (n) => n.node.name === "Parent",
    )!;
    const child = layout.panels[0].nodes.find((n) => n.node.name === "Child")!;

    expect(parent.connectors).toHaveLength(1);
    expect(child.connectors).toHaveLength(0);

    const connector = parent.connectors[0];
    expect(connector.segments.some((s) => s.type === "vertical_bar")).toBe(
      true,
    );
    expect(connector.segments.some((s) => s.type === "vertical_arrow")).toBe(
      true,
    );
  });

  test("branch connector has horizontal bar and stub", () => {
    const ir = parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "Parent" col=0 row=0
          node "ChildA" col=0 row=1
          node "ChildB" col=1 row=1
          edge "Parent" "ChildA"
          edge "Parent" "ChildB"
        }
      }
    `);

    const layout = computeLayout(ir);
    const parent = layout.panels[0].nodes.find(
      (n) => n.node.name === "Parent",
    )!;

    expect(parent.connectors).toHaveLength(1);
    const segments = parent.connectors[0].segments;
    expect(segments.some((s) => s.type === "vertical_bar")).toBe(true);
    expect(segments.some((s) => s.type === "horizontal_bar")).toBe(true);
    expect(segments.some((s) => s.type === "vertical_stub")).toBe(true);
  });

  test("horizontal edge produces horizontal connector", () => {
    const ir = parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=4 rows=1 {
          node "Left" col=0 row=0
          node "Right" col=1 row=0
          edge "Left" "Right"
        }
      }
    `);

    const layout = computeLayout(ir);
    const parent = layout.panels[0].nodes.find((n) => n.node.name === "Left")!;

    expect(parent.connectors).toHaveLength(1);
    const segments = parent.connectors[0].segments;
    expect(segments.some((s) => s.type === "horizontal_bar")).toBe(true);
    expect(segments.some((s) => s.type === "horizontal_arrow")).toBe(true);
  });

  test("unitName is preserved", () => {
    const ir = parseKdl(`
      grid columns=1 unit="GFL-UNIT-DEFY" {
        panel title="@t" columns=1 rows=1 {
          node "A" col=0 row=0
        }
      }
    `);

    const layout = computeLayout(ir);
    expect(layout.unitName).toBe("GFL-UNIT-DEFY");
  });
});
