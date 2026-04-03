import { readFileSync, writeFileSync } from "fs";
import { parseKdl, CompileError } from "./compiler.ts";
import { computeLayout } from "./layout.ts";
import type { ComputedLayout } from "./layout.ts";
import { generateXml, generateCombinedXml } from "./xmlgen.ts";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: bun cli.ts <input.kdl> [-o output.xml]");
    console.log(
      "       bun cli.ts <input1.kdl> <input2.kdl> ... [-o output.xml]",
    );
    console.log("");
    console.log("Compiles KDL doctrine layout files to DK2 GUI XML.");
    console.log(
      "Multiple inputs are combined into a single XML with shared chrome.",
    );
    console.log("If no -o flag is given, output is written to stdout.");
    process.exit(args.length === 0 ? 1 : 0);
  }

  let outputPath: string | null = null;
  const inputPaths: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" || args[i] === "--output") {
      outputPath = args[++i];
      if (!outputPath) {
        console.error("Error: -o requires an output path");
        process.exit(1);
      }
    } else {
      inputPaths.push(args[i]);
    }
  }

  if (inputPaths.length === 0) {
    console.error("Error: no input files specified");
    process.exit(1);
  }

  try {
    const layouts: ComputedLayout[] = inputPaths.map((inputPath) => {
      const kdlText = readFileSync(inputPath, "utf-8");
      const ir = parseKdl(kdlText);
      return computeLayout(ir);
    });

    const result =
      layouts.length === 1
        ? generateXml(layouts[0])
        : generateCombinedXml(layouts);

    if (outputPath) {
      writeFileSync(outputPath, result);
      console.log(
        `Written to ${outputPath} (${layouts.length} unit${layouts.length > 1 ? "s" : ""})`,
      );
    } else {
      console.log(result);
    }
  } catch (err) {
    if (err instanceof CompileError) {
      console.error(`Compile error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

main();
