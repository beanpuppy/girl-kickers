import { describe, test, expect } from "bun:test";
import { parseKdl, CompileError } from "../src/compiler.ts";

describe("parseKdl", () => {
  test("parses a minimal valid KDL", () => {
    const ir = parseKdl(`
      grid columns=2 unit="TestUnit" {
        panel title="@branch_one" columns=2 rows=2 {
          node "NodeA" col=0 row=0
          node "NodeB" col=1 row=0
        }
      }
    `);

    expect(ir.gridColumns).toBe(2);
    expect(ir.unitName).toBe("TestUnit");
    expect(ir.panels).toHaveLength(1);
    expect(ir.panels[0].title).toBe("@branch_one");
    expect(ir.panels[0].columns).toBe(2);
    expect(ir.panels[0].rows).toBe(2);
    expect(ir.panels[0].colspan).toBe(1);
    expect(ir.panels[0].nodes).toHaveLength(2);
    expect(ir.panels[0].nodes[0]).toEqual({ name: "NodeA", col: 0, row: 0 });
    expect(ir.panels[0].edges).toHaveLength(0);
  });

  test("parses edges", () => {
    const ir = parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=2 {
          node "A" col=0 row=0
          node "B" col=1 row=1
          edge "A" "B"
        }
      }
    `);

    expect(ir.panels[0].edges).toEqual([{ from: "A", to: "B" }]);
  });

  test("parses colspan", () => {
    const ir = parseKdl(`
      grid columns=3 unit="Test" {
        panel title="@t" columns=4 rows=1 colspan=3 {
          node "A" col=0 row=0
        }
      }
    `);

    expect(ir.panels[0].colspan).toBe(3);
  });

  test("supports fractional col for centring", () => {
    const ir = parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=1 {
          node "Centre" col=0.5 row=0
        }
      }
    `);

    expect(ir.panels[0].nodes[0].col).toBe(0.5);
  });

  test("parses multiple panels", () => {
    const ir = parseKdl(`
      grid columns=3 unit="Test" {
        panel title="@a" columns=2 rows=2 {
          node "A" col=0 row=0
        }
        panel title="@b" columns=2 rows=2 {
          node "B" col=0 row=0
        }
        panel title="@c" columns=2 rows=2 {
          node "C" col=0 row=0
        }
      }
    `);

    expect(ir.panels).toHaveLength(3);
  });

  // Error cases

  test("rejects missing grid node", () => {
    expect(() => parseKdl('panel title="@t" columns=1 rows=1 {}')).toThrow(
      CompileError,
    );
  });

  test("rejects grid without columns", () => {
    expect(() => parseKdl('grid unit="Test" {}')).toThrow("columns");
  });

  test("rejects grid without unit", () => {
    expect(() => parseKdl("grid columns=1 {}")).toThrow("unit");
  });

  test("rejects panel without title", () => {
    expect(() =>
      parseKdl(`
      grid columns=1 unit="Test" {
        panel columns=1 rows=1 {
          node "A" col=0 row=0
        }
      }
    `),
    ).toThrow("title");
  });

  test("rejects node with col out of bounds", () => {
    expect(() =>
      parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=1 {
          node "A" col=2 row=0
        }
      }
    `),
    ).toThrow("col");
  });

  test("rejects node with row out of bounds", () => {
    expect(() =>
      parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=2 {
          node "A" col=0 row=2
        }
      }
    `),
    ).toThrow("row");
  });

  test("rejects edge referencing unknown node", () => {
    expect(() =>
      parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=2 rows=1 {
          node "A" col=0 row=0
          edge "A" "B"
        }
      }
    `),
    ).toThrow('unknown node "B"');
  });

  test("rejects self-referencing edge", () => {
    expect(() =>
      parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=1 {
          node "A" col=0 row=0
          edge "A" "A"
        }
      }
    `),
    ).toThrow("itself");
  });

  test("rejects duplicate node names in same panel", () => {
    expect(() =>
      parseKdl(`
      grid columns=1 unit="Test" {
        panel title="@t" columns=1 rows=2 {
          node "A" col=0 row=0
          node "A" col=0 row=1
        }
      }
    `),
    ).toThrow("duplicate");
  });

  test("rejects colspan exceeding grid columns", () => {
    expect(() =>
      parseKdl(`
      grid columns=2 unit="Test" {
        panel title="@t" columns=1 rows=1 colspan=3 {
          node "A" col=0 row=0
        }
      }
    `),
    ).toThrow("colspan");
  });

  test("rejects empty grid", () => {
    expect(() => parseKdl('grid columns=1 unit="Test" {}')).toThrow(
      "at least one panel",
    );
  });
});
