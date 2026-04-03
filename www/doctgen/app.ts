import {
  EditorView,
  keymap,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  lineNumbers,
  drawSelection,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import {
  StreamLanguage,
  indentUnit,
  indentOnInput,
  bracketMatching,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  defaultKeymap,
  history as cmHistory,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { createTheme } from "thememirror";
import { vim } from "@replit/codemirror-vim";

import { parseKdl, CompileError } from "./src/compiler.ts";
import { computeLayout } from "./src/layout.ts";
import type { ComputedLayout, LayoutPanel } from "./src/layout.ts";
import { generateXml } from "./src/xmlgen.ts";

// ── Editor theme (ayu dark inspired, matching our palette) ──

const editorTheme = createTheme({
  variant: "dark",
  settings: {
    background: "#0e0e11",
    foreground: "#e8e8ec",
    caret: "#d4853b",
    selection: "rgba(212, 133, 59, 0.2)",
    lineHighlight: "rgba(255, 255, 255, 0.03)",
    gutterBackground: "#121216",
    gutterForeground: "#606068",
  },
  styles: [
    { tag: tags.comment, color: "#606068" },
    { tag: tags.lineComment, color: "#606068" },
    { tag: tags.blockComment, color: "#606068" },
    { tag: tags.string, color: "#aad94c" },
    { tag: tags.keyword, color: "#d4853b" },
    { tag: tags.number, color: "#d2a6ff" },
    { tag: tags.variableName, color: "#59c2ff" },
    { tag: tags.brace, color: "#a0a0a8" },
    { tag: tags.operator, color: "#f29668" },
  ],
});

// ── KDL language mode (simple stream parser) ──

const kdlLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/\/\/.*/)) return "lineComment";
    if (stream.match(/\/\*/)) {
      while (!stream.match(/\*\//) && !stream.eatWhile(() => true)) {
        stream.next();
      }
      return "blockComment";
    }
    if (stream.match(/"[^"]*"/)) return "string";
    if (stream.match(/\b(grid|panel|node|edge|anchor|decor)\b/))
      return "keyword";
    if (stream.match(/-?[0-9]+(\.[0-9]+)?%?/)) return "number";
    if (stream.match(/[a-zA-Z_][a-zA-Z0-9_-]*/)) return "variableName";
    if (stream.match(/[{}]/)) return "brace";
    if (stream.match(/=/)) return "operator";
    stream.next();
    return null;
  },
});

// ── Default example KDL ──

const DEFAULT_KDL = `grid columns=3 unit="GFL-UNIT-DEFY" {
    panel title="@menu_doctrine_branch_calibration" columns=2 rows=4 {
        anchor x="0%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33"
        }
        anchor x="100%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33" flip-x="true"
        }

        node "GFL_LethalPrecision" col=0 row=0
        node "GFL_CQCProtocols" col=1 row=0
        node "GFL_RapidDeployment" col=0 row=1
        node "GFL_OverwhelmingForce" col=1 row=1
        node "GFL_WeaponTransition" col=0 row=2
        node "GFL_CombatEfficiency" col=1 row=2
        node "GFL_SuppressionProtocols" col=0.5 row=3

        edge "GFL_CQCProtocols" "GFL_OverwhelmingForce"
        edge "GFL_RapidDeployment" "GFL_WeaponTransition"
        edge "GFL_RapidDeployment" "GFL_CombatEfficiency"
    }

    panel title="@menu_doctrine_branch_neuralhelix" columns=2 rows=2 {
        anchor x="0%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33"
        }
        anchor x="100%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33" flip-x="true"
        }

        node "GFL_DEFY_FemaleGorilla" col=0 row=0
        node "GFL_DEFY_AlphaProtocol" col=1 row=0
        node "GFL_DEFY_PerfectMortality" col=0 row=1
        node "GFL_DEFY_IceAndBlood" col=1 row=1
    }

    panel title="@menu_doctrine_branch_remolder" columns=2 rows=3 {
        anchor x="0%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33"
        }
        anchor x="100%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=190 height=75 color="0c0b0b33" flip-x="true"
        }

        node "GFL_CommunicationProtocols" col=0 row=0
        node "GFL_OptimizedPerformance" col=1 row=0
        node "GFL_AdvancedProtocols" col=0 row=1
        node "GFL_TacticalIntelligence" col=0 row=2
        node "GFL_InformationExtraction" col=1 row=2

        edge "GFL_CommunicationProtocols" "GFL_AdvancedProtocols"
        edge "GFL_AdvancedProtocols" "GFL_TacticalIntelligence"
        edge "GFL_AdvancedProtocols" "GFL_InformationExtraction"
    }

    // Full-width veteran panel with accent styling and decorations
    panel title="@menu_doctrine_level_vet" colspan=3 columns=4 rows=1 \\
        title-bar-height=90 title-bar-color="E4E4E480" \\
        title-font="header_2" {

        // Wider diagonal bars for vet panel
        anchor x="0%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=220 height=95 color="0c0b0b33"
        }
        anchor x="100%" y="0%" {
            decor "data/textures/gui/deploy/deploy_class_diagonalbars.dds" width=220 height=95 color="0c0b0b33" flip-x="true"
        }

        // Borders
        anchor x="0%" y="100%" {
            decor "data/textures/gui/square.tga" width="100%" height=8 color="E4E4E480"
        }
        anchor x="0%" y="37%" {
            decor "data/textures/gui/square.tga" width=8 height="62%" color="E4E4E480"
        }
        anchor x="100%" y="37%" {
            decor "data/textures/gui/square.tga" width=8 height="62%" color="E4E4E480"
        }

        // Stars flanking the title
        anchor x="16%" y="10%" {
            decor "data/textures/gui/missions/pack_stars.tga"
            decor "data/textures/gui/missions/pack_stars.tga" x=50 color="f0e3cc"
            decor "data/textures/gui/missions/pack_stars.tga" x=100 color="f0e3cc"
        }
        anchor x="80%" y="10%" {
            decor "data/textures/gui/missions/pack_stars.tga"
            decor "data/textures/gui/missions/pack_stars.tga" x=-50 color="f0e3cc"
            decor "data/textures/gui/missions/pack_stars.tga" x=-100 color="f0e3cc"
        }

        node "GFL_DEFY_TacticalIndependence" col=0 row=0
        node "GFL_DEFY_SquadDefiance" col=1 row=0
        node "GFL_DEFY_BattlefieldEchoes" col=2 row=0
        node "GFL_DEFY_ViolentMomentum" col=3 row=0

        edge "GFL_DEFY_TacticalIndependence" "GFL_DEFY_SquadDefiance"
    }
}
`;

// ── Toast ──

function showToast(message: string, durationMs = 2000): void {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hiding");
    toast.addEventListener("animationend", () => toast.remove());
  }, durationMs);
}

// ── SVG Preview ──

// ── File manager (localStorage) ──

const STORAGE_KEY = "doctgen-files";
const ACTIVE_KEY = "doctgen-active";

interface FileStore {
  [name: string]: string;
}

const SIMPLE_KDL = `grid columns=2 unit="MyUnit" {
    panel title="@branch_one" columns=2 rows=3 {
        node "Alpha" col=0 row=0
        node "Bravo" col=1 row=0
        node "Charlie" col=0 row=1
        node "Delta" col=1 row=1
        node "Echo" col=0.5 row=2

        edge "Alpha" "Charlie"
        edge "Bravo" "Delta"
    }

    panel title="@branch_two" columns=1 rows=2 {
        node "Foxtrot" col=0 row=0
        node "Golf" col=0 row=1

        edge "Foxtrot" "Golf"
    }
}
`;

const FRESH = new URLSearchParams(window.location.search).has("fresh");

function loadFiles(): FileStore {
  if (!FRESH) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
  }
  return { "simple.kdl": SIMPLE_KDL, "defy.kdl": DEFAULT_KDL };
}

function saveFiles(files: FileStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

function getActiveFile(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? Object.keys(loadFiles())[0];
}

function setActiveFile(name: string): void {
  localStorage.setItem(ACTIVE_KEY, name);
}

// ── SVG Preview ──

function renderPreview(layout: ComputedLayout): string {
  const padding = 10;
  // Compute tight bounds from panels
  let minX = Infinity,
    minY = Infinity,
    maxX = 0,
    maxY = 0;

  for (const panel of layout.panels) {
    const [ox, oy] = panel.origin.split(" ").map(Number);
    let px: number, py: number;
    if (panel.align === "lt") {
      px = ox;
      py = -oy;
    } else if (panel.align === "rt") {
      px = 1290 + ox - panel.sizeX;
      py = -oy;
    } else {
      px = (1290 - panel.sizeX) / 2 + ox;
      py = -oy;
    }
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px + panel.sizeX);
    maxY = Math.max(maxY, py + panel.sizeY);
  }

  const viewX = minX - padding;
  const viewY = minY - padding;
  const viewW = maxX - minX + padding * 2;
  const viewH = maxY - minY + padding * 2;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewX} ${viewY} ${viewW} ${viewH}" width="100%">`,
  );

  // Arrow marker
  parts.push(`<defs>`);
  parts.push(
    `<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">`,
  );
  parts.push(`<polygon points="0 0, 8 3, 0 6" fill="#a0a0a8"/>`);
  parts.push(`</marker>`);
  parts.push(`</defs>`);

  for (const panel of layout.panels) {
    renderPanelSvg(parts, panel);
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

function renderPanelSvg(parts: string[], panel: LayoutPanel): void {
  const [ox, oy] = panel.origin.split(" ").map(Number);
  let px: number, py: number;
  if (panel.align === "lt") {
    px = ox;
    py = -oy;
  } else if (panel.align === "rt") {
    px = 1290 + ox - panel.sizeX;
    py = -oy;
  } else {
    px = (1290 - panel.sizeX) / 2 + ox;
    py = -oy;
  }

  // Panel rectangle
  parts.push(
    `<rect x="${px}" y="${py}" width="${panel.sizeX}" height="${panel.sizeY}" fill="rgba(30,30,36,0.8)" stroke="#404048" stroke-width="1"/>`,
  );

  // Title bar
  parts.push(
    `<rect x="${px}" y="${py}" width="${panel.sizeX}" height="${panel.titleBarHeight}" fill="rgba(50,50,58,0.6)"/>`,
  );

  // Title text
  parts.push(
    `<text x="${px + panel.sizeX / 2}" y="${py + panel.titleBarHeight / 2 + 5}" text-anchor="middle" fill="#d4853b" font-size="14" font-family="DM Sans, sans-serif" font-weight="500">${panel.title}</text>`,
  );

  const NODE_R = 35;
  const LABEL_SIZE = 14;

  // First pass: compute node positions for edge lookups
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const nwc of panel.nodes) {
    const [nox, noy] = nwc.node.origin.split(" ").map(Number);
    let nx: number;
    if (nwc.node.align === "lt") {
      nx = px + nox;
    } else if (nwc.node.align === "rt") {
      nx = px + panel.sizeX + nox;
    } else {
      nx = px + panel.sizeX / 2 + nox;
    }
    const ny = py + -noy;
    nodePositions.set(nwc.node.name, { x: nx, y: ny });
  }

  // Second pass: render nodes and edges
  for (const nwc of panel.nodes) {
    const pos = nodePositions.get(nwc.node.name)!;
    const { x: nx, y: ny } = pos;

    // Node circle
    parts.push(
      `<circle cx="${nx}" cy="${ny}" r="${NODE_R}" fill="rgba(30,30,36,0.9)" stroke="#a0a0a8" stroke-width="1.5"/>`,
    );

    // Node label (centred with background)
    const name =
      nwc.node.name.length > 20
        ? nwc.node.name.slice(0, 19) + "…"
        : nwc.node.name;
    const textWidth = name.length * LABEL_SIZE * 0.55;
    const labelY = ny - NODE_R + LABEL_SIZE;
    parts.push(
      `<rect x="${nx - textWidth / 2 - 4}" y="${labelY - LABEL_SIZE / 2 - 2}" width="${textWidth + 8}" height="${LABEL_SIZE + 4}" fill="rgba(14,14,17,0.6)" rx="2"/>`,
    );
    parts.push(
      `<text x="${nx}" y="${labelY + LABEL_SIZE * 0.35}" text-anchor="middle" fill="#e8e8ec" font-size="${LABEL_SIZE}" font-family="DM Sans, sans-serif">${name}</text>`,
    );

    // Edges: draw line from this node to each child
    for (const childName of nwc.childNames) {
      const child = nodePositions.get(childName);
      if (!child) continue;
      const cx = child.x;
      const cy = child.y;

      if (cx === nx) {
        // Vertical: straight down
        parts.push(
          `<line x1="${nx}" y1="${ny + NODE_R}" x2="${cx}" y2="${cy - NODE_R}" stroke="#606068" stroke-width="2" marker-end="url(#arrowhead)"/>`,
        );
      } else if (cy === ny) {
        // Horizontal: same row
        const dir = cx > nx ? 1 : -1;
        parts.push(
          `<line x1="${nx + dir * NODE_R}" y1="${ny}" x2="${cx - dir * NODE_R}" y2="${cy}" stroke="#606068" stroke-width="2" marker-end="url(#arrowhead)"/>`,
        );
      } else {
        // L-shaped: vertical then horizontal
        const midY = ny + NODE_R + 30;
        parts.push(
          `<line x1="${nx}" y1="${ny + NODE_R}" x2="${nx}" y2="${midY}" stroke="#606068" stroke-width="2"/>`,
        );
        parts.push(
          `<line x1="${nx}" y1="${midY}" x2="${cx}" y2="${midY}" stroke="#606068" stroke-width="2"/>`,
        );
        parts.push(
          `<line x1="${cx}" y1="${midY}" x2="${cx}" y2="${cy - NODE_R}" stroke="#606068" stroke-width="2" marker-end="url(#arrowhead)"/>`,
        );
      }
    }
  }
}

// ── Help modal (FORMAT.md) ──

async function loadHelp(): Promise<string> {
  try {
    const resp = await fetch("FORMAT.md");
    if (!resp.ok) return "<p>Could not load FORMAT.md</p>";
    const md = await resp.text();
    return renderMarkdown(md);
  } catch {
    return "<p>Could not load FORMAT.md</p>";
  }
}

function renderMarkdown(md: string): string {
  // Extract code blocks first (before HTML escaping)
  const codeBlocks: string[] = [];
  let processed = md.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_match, lang, code) => {
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const highlighted = lang === "kdl" ? highlightKdl(escaped) : escaped;
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre><code>${highlighted}</code></pre>`);
      return `%%CODEBLOCK_${idx}%%`;
    },
  );

  // Inline code
  const inlineCodes: string[] = [];
  processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escaped}</code>`);
    return `%%INLINE_${idx}%%`;
  });

  processed = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" style="color: var(--accent)">$1</a>',
    )
    .replace(/(^\|.+\|$\n?)+/gm, (block) => {
      const rows = block.trim().split("\n");
      let html = "<table>";
      let headerDone = false;
      for (let i = 0; i < rows.length; i++) {
        const cells = rows[i]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        // Skip separator row, mark previous as header
        if (cells.every((c) => /^-+$/.test(c))) {
          headerDone = true;
          continue;
        }
        const tag = !headerDone ? "th" : "td";
        html += `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
      }
      html += "</table>";
      return html;
    })
    .replace(/^(?!<[htp1-6oul]|<tr|<table|%%CODE)(.+)$/gm, "<p>$1</p>");

  // Restore code blocks and inline code
  processed = processed.replace(
    /%%CODEBLOCK_(\d+)%%/g,
    (_m, idx) => codeBlocks[parseInt(idx)],
  );
  processed = processed.replace(
    /%%INLINE_(\d+)%%/g,
    (_m, idx) => inlineCodes[parseInt(idx)],
  );

  return processed;
}

// ── KDL syntax highlighting for markdown code blocks ──

function highlightKdl(code: string): string {
  return code.replace(
    /(\/\/[^\n]*)|(&quot;[^&]*?&quot;)|(\b(?:grid|panel|node|edge|anchor|decor)\b)|(-?\d+(?:\.\d+)?%?)|([a-zA-Z_][\w-]*)(=)|([{}])/g,
    (match, comment, str, keyword, num, prop, eq, brace) => {
      if (comment) return `<span style="color:#606068">${comment}</span>`;
      if (str) return `<span style="color:#aad94c">${str}</span>`;
      if (keyword) return `<span style="color:#d4853b">${keyword}</span>`;
      if (num) return `<span style="color:#d2a6ff">${num}</span>`;
      if (prop && eq) return `<span style="color:#59c2ff">${prop}</span><span style="color:#f29668">${eq}</span>`;
      if (brace) return `<span style="color:#a0a0a8">${brace}</span>`;
      return match;
    },
  );
}

// ── XML syntax highlighting for output ──

function highlightXml(xml: string): string {
  return xml.replace(
    /(<!\-\-[\s\S]*?\-\->)|(<\/?\w[\w-]*)|(\/?>)|(\w[\w-]*)(=)("[^"]*")|("[^"]*")/g,
    (match, comment, tagName, tagClose, attrName, eq, attrVal, strVal) => {
      if (comment) return `<span style="color:#606068">${comment}</span>`;
      if (tagName) return `<span style="color:#d4853b">${tagName}</span>`;
      if (tagClose) return `<span style="color:#d4853b">${tagClose}</span>`;
      if (attrName && eq && attrVal)
        return `<span style="color:#59c2ff">${attrName}</span><span style="color:#f29668">${eq}</span><span style="color:#aad94c">${attrVal}</span>`;
      if (strVal) return `<span style="color:#aad94c">${strVal}</span>`;
      return match;
    },
  );
}

// ── Main ──

function main() {
  const editorEl = document.getElementById("editorPane")!;
  const errorBar = document.getElementById("errorBar")!;
  const previewContainer = document.getElementById("previewContainer")!;
  const xmlOutput = document.getElementById("xmlOutput")!;
  const copyBtn = document.getElementById("copyBtn")!;
  const downloadBtn = document.getElementById("downloadBtn")!;
  const helpBtn = document.getElementById("helpBtn")!;
  const formatBtn = document.getElementById("formatBtn")!;
  const helpModal = document.getElementById("helpModal")!;
  const helpClose = document.getElementById("helpClose")!;
  const helpContent = document.getElementById("helpContent")!;
  const vimToggle = document.getElementById("vimToggle") as HTMLInputElement;
  const infoBar = document.getElementById("infoBar")!;
  const infoDismiss = document.getElementById("infoDismiss")!;
  const infoHelpLink = document.getElementById("infoHelpLink")!;

  // Info bar - hidden by default in HTML to prevent flash
  if (FRESH || localStorage.getItem("doctgen-info-dismissed") !== "1") {
    // Disable transition for initial show, re-enable after paint
    infoBar.style.transition = "none";
    infoBar.classList.remove("hidden");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        infoBar.style.transition = "";
      });
    });
  }

  infoDismiss.addEventListener("click", () => {
    infoBar.classList.add("hidden");
    localStorage.setItem("doctgen-info-dismissed", "1");
  });

  // Tabs
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((tc) => {
        tc.classList.toggle("active", tc.id === `tab-${tab.dataset.tab}`);
      });
    });
  });

  // File manager
  const fileTabsEl = document.getElementById("fileTabs")!;
  const fileAddBtn = document.getElementById("fileAdd")!;
  let files = loadFiles();
  let activeFileName = getActiveFile();
  if (!files[activeFileName]) activeFileName = Object.keys(files)[0];

  // CodeMirror setup
  const vimCompartment = new Compartment();

  const view = new EditorView({
    state: EditorState.create({
      doc: files[activeFileName] ?? DEFAULT_KDL,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        cmHistory(),
        indentUnit.of("    "),
        keymap.of([
          // Prevent Escape from being swallowed (needed for vim mode)
          { key: "Escape", run: () => false },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        kdlLanguage,
        editorTheme,
        vimCompartment.of([]),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet) {
            const hasSelection = update.state.selection.ranges.some(
              (r) => !r.empty,
            );
            update.view.dom.classList.toggle("has-selection", hasSelection);
          }
          if (update.docChanged) {
            // Save to file store on change
            files[activeFileName] = view.state.doc.toString();
            saveFiles(files);
            debouncedCompile();
          }
        }),
      ],
    }),
    parent: editorEl,
  });

  function switchToFile(name: string) {
    // Save current
    files[activeFileName] = view.state.doc.toString();
    saveFiles(files);
    // Switch
    activeFileName = name;
    setActiveFile(name);
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: files[name] ?? "",
      },
    });
    renderFileTabs();
    // Clear previous output before compiling new file
    previewContainer.innerHTML = "";
    xmlOutput.textContent = "";
    lastXml = "";
    errorBar.classList.remove("visible");
    errorBar.textContent = "";
    compile();
  }

  // Context menu
  function showContextMenu(x: number, y: number, name: string) {
    closeContextMenu();
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", () => {
      closeContextMenu();
      const newName = prompt("Rename file:", name);
      if (newName && newName !== name && !files[newName]) {
        files[newName] = files[name];
        delete files[name];
        if (activeFileName === name) activeFileName = newName;
        setActiveFile(activeFileName);
        saveFiles(files);
        renderFileTabs();
      }
    });
    menu.appendChild(renameBtn);

    if (Object.keys(files).length > 1) {
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.className = "danger";
      deleteBtn.addEventListener("click", () => {
        closeContextMenu();
        if (!confirm(`Delete ${name}?`)) return;
        delete files[name];
        saveFiles(files);
        if (activeFileName === name) {
          activeFileName = Object.keys(files)[0];
          setActiveFile(activeFileName);
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: files[activeFileName] ?? "",
            },
          });
          compile();
        }
        renderFileTabs();
      });
      menu.appendChild(deleteBtn);
    }

    document.body.appendChild(menu);

    // Close on click outside
    const onClickOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        closeContextMenu();
        document.removeEventListener("click", onClickOutside);
      }
    };
    setTimeout(() => document.addEventListener("click", onClickOutside), 0);
  }

  function closeContextMenu() {
    document.querySelector(".context-menu")?.remove();
  }

  function renderFileTabs() {
    fileTabsEl.innerHTML = "";
    for (const name of Object.keys(files)) {
      const tab = document.createElement("button");
      tab.className = `file-tab${name === activeFileName ? " active" : ""}`;
      tab.textContent = name;

      tab.addEventListener("click", () => {
        if (name !== activeFileName) switchToFile(name);
      });

      tab.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, name);
      });

      if (Object.keys(files).length > 1) {
        const close = document.createElement("span");
        close.className = "file-close";
        close.textContent = "\u00d7";
        close.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!confirm(`Delete ${name}?`)) return;
          delete files[name];
          saveFiles(files);
          if (activeFileName === name) {
            activeFileName = Object.keys(files)[0];
            setActiveFile(activeFileName);
            view.dispatch({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: files[activeFileName] ?? "",
              },
            });
            compile();
          }
          renderFileTabs();
        });
        tab.appendChild(close);
      }

      fileTabsEl.appendChild(tab);
    }
  }

  fileAddBtn.addEventListener("click", () => {
    const name = prompt("File name:", "new.kdl");
    if (!name || files[name]) {
      if (name && files[name]) showToast("File already exists");
      return;
    }
    files[name] = `grid columns=3 unit="MyUnit" {\n    \n}\n`;
    saveFiles(files);
    switchToFile(name);
  });

  renderFileTabs();

  // Vim toggle
  if (localStorage.getItem("doctgen-vim") === "1") {
    vimToggle.checked = true;
    view.dispatch({
      effects: vimCompartment.reconfigure(vim()),
    });
  }

  vimToggle.addEventListener("change", () => {
    localStorage.setItem("doctgen-vim", vimToggle.checked ? "1" : "0");
    view.dispatch({
      effects: vimCompartment.reconfigure(vimToggle.checked ? vim() : []),
    });
  });

  // Compile
  let lastXml = "";
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function compile() {
    const kdlText = view.state.doc.toString();
    try {
      const ir = parseKdl(kdlText);
      const layout = computeLayout(ir);
      lastXml = generateXml(layout);

      const escaped = lastXml
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      xmlOutput.innerHTML = highlightXml(escaped);
      previewContainer.innerHTML = renderPreview(layout);
      errorBar.classList.remove("visible");
      errorBar.textContent = "";
    } catch (err) {
      const message =
        err instanceof CompileError ? err.message : `Internal error: ${err}`;
      errorBar.textContent = message;
      errorBar.classList.add("visible");
    }
  }

  function debouncedCompile() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(compile, 300);
  }

  // Copy XML
  copyBtn.addEventListener("click", () => {
    if (lastXml) {
      navigator.clipboard.writeText(lastXml).then(() => {
        showToast("Copied to clipboard");
      });
    }
  });

  // Download XML
  downloadBtn.addEventListener("click", () => {
    if (!lastXml) return;
    const blob = new Blob([lastXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "doctrine.xml";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Help modal
  async function openHelp() {
    if (!helpContent.innerHTML) {
      helpContent.innerHTML = await loadHelp();
    }
    helpModal.classList.add("visible");
  }

  helpBtn.addEventListener("click", () => {
    const hidden = infoBar.classList.toggle("hidden");
    localStorage.setItem("doctgen-info-dismissed", hidden ? "1" : "0");
  });

  formatBtn.addEventListener("click", openHelp);
  infoHelpLink.addEventListener("click", (e) => {
    e.preventDefault();
    openHelp();
  });

  helpClose.addEventListener("click", () => {
    helpModal.classList.remove("visible");
  });

  helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) {
      helpModal.classList.remove("visible");
    }
  });

  // Initial compile
  compile();
}

main();
