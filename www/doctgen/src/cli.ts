import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, basename } from "path";
import { parseKdl, CompileError } from "./compiler.ts";
import { computeLayout } from "./layout.ts";
import type { ComputedLayout } from "./layout.ts";
import { generateXml, generateCombinedXml } from "./xmlgen.ts";
import { importDoctrineXml, layoutToKdl } from "./import.ts";

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: bun cli.ts <input.kdl> [-o output.xml]");
    console.log(
      "       bun cli.ts <input1.kdl> <input2.kdl> ... [-o output.xml]",
    );
    console.log("       bun cli.ts --import <input.xml> [-o output_dir/]");
    console.log("");
    console.log("Generates DK2 GUI XML from KDL doctrine layout files.");
    console.log(
      "Multiple inputs are combined into a single XML with shared chrome.",
    );
    console.log("If no -o flag is given, output is written to stdout.");
    console.log("");
    console.log("  --import    Convert DK2 doctrine XML back to KDL files");
    process.exit(args.length === 0 ? 1 : 0);
  }

  const isImport = args.includes("--import");

  let outputPath: string | null = null;
  const inputPaths: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--import") continue;
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

  if (isImport) {
    runImport(inputPaths[0], outputPath);
  } else {
    runGenerate(inputPaths, outputPath);
  }
}

function runGenerate(inputPaths: string[], outputPath: string | null) {
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

function runImport(inputPath: string, outputPath: string | null) {
  const xml = readFileSync(inputPath, "utf-8");
  const layouts = importDoctrineXml(xml);

  if (layouts.length === 0) {
    console.error("No doctrine trees found in the XML");
    process.exit(1);
  }

  const kdlOutputs = layouts.map((layout) => ({
    unitName: layout.unitName,
    kdl: layoutToKdl(layout),
  }));

  if (outputPath && (outputPath.endsWith("/") || outputPath.endsWith("\\"))) {
    // Output to directory: one file per doctrine tree
    if (!existsSync(outputPath)) mkdirSync(outputPath, { recursive: true });
    for (const { unitName, kdl } of kdlOutputs) {
      const filename =
        unitName.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".kdl";
      const filePath = join(outputPath, filename);
      writeFileSync(filePath, kdl);
      console.log(`Written ${filePath}`);
    }
  } else if (outputPath) {
    // Output to single file
    writeFileSync(outputPath, kdlOutputs.map((o) => o.kdl).join("\n"));
    console.log(
      `Written to ${outputPath} (${layouts.length} unit${layouts.length > 1 ? "s" : ""})`,
    );
  } else {
    // stdout
    for (const { unitName, kdl } of kdlOutputs) {
      if (kdlOutputs.length > 1) console.log(`// ${unitName}`);
      console.log(kdl);
    }
  }
}

main();
