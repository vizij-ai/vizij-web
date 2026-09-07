#!/usr/bin/env node
/**
 * Generate d2 component-import diagrams by static analysis of `src/components`.
 *
 *   node scripts/component-graph.mjs layers > docs/references/component-graph-layers.d2
 *   node scripts/component-graph.mjs detail > docs/references/component-graph-detail.d2
 *
 * Reads relative `import` / `export … from` specifiers, resolves them to files on
 * disk, and emits one of two views:
 *
 * - `layers` aggregates every edge to LAYER granularity. A per-component graph of
 *   ~90 components is unreadable, and layer membership is the thing worth seeing
 *   at that zoom: whether the ui/ → editor/ → feature direction actually holds,
 *   and whether any edge points the wrong way.
 * - `detail` keeps per-component nodes for the three PORTABLE layers (`ui/`,
 *   `editor/`, `common/`) and draws only the edges BETWEEN them, plus their
 *   third-party substrate. That is the graph that matters for packaging: it shows
 *   exactly which primitives a reusable component drags along with it. Feature-code
 *   consumers are deliberately not drawn — 48 files importing 27 primitives is a
 *   12,000px hairball, and the layers view already summarises that direction. The
 *   information is kept as a `←N` consumer count in each node's label.
 *
 * Deliberately excludes `*.stories.tsx` and `*.test.tsx`: they import downward by
 * definition and would imply dependencies that do not exist at runtime.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "src");
const COMPONENTS = join(ROOT, "components");
const MODE = process.argv[2] === "detail" ? "detail" : "layers";

/** Layer definitions, most specific first. */
const LAYERS = [
  {
    id: "editor_atoms",
    label: "editor/atoms",
    match: "components/editor/atoms",
    cls: "emphasis",
  },
  {
    id: "editor_hooks",
    label: "editor/hooks",
    match: "components/editor/hooks",
    cls: "emphasis",
  },
  {
    id: "editor_molecules",
    label: "editor/molecules",
    match: "components/editor/molecules",
    cls: "primary",
  },
  {
    id: "ui",
    label: "ui/ primitives",
    match: "components/ui",
    cls: "highlight",
  },
  {
    id: "common",
    label: "common/",
    match: "components/common",
    cls: "neutral",
  },
  {
    id: "inspector",
    label: "inspector/",
    match: "components/inspector",
    cls: "secondary",
  },
  {
    id: "panels",
    label: "panels/",
    match: "components/panels",
    cls: "secondary",
  },
  { id: "app", label: "app/", match: "components/app", cls: "secondary" },
  {
    id: "animation",
    label: "animation/",
    match: "components/animation",
    cls: "secondary",
  },
  {
    id: "binding",
    label: "binding/",
    match: "components/binding",
    cls: "secondary",
  },
  {
    id: "scene_composer",
    label: "scene-composer/",
    match: "components/scene-composer",
    cls: "secondary",
  },
  {
    id: "poseRig",
    label: "poseRig/",
    match: "components/poseRig",
    cls: "secondary",
  },
  {
    id: "discrepancy",
    label: "discrepancy/",
    match: "components/discrepancy",
    cls: "secondary",
  },
];

/** Layers that `detail` mode expands to individual components. */
const PORTABLE = new Set([
  "ui",
  "common",
  "editor_atoms",
  "editor_hooks",
  "editor_molecules",
]);

const EXTERNAL = [
  {
    id: "semio_ui",
    label: "@semio/ui",
    test: (s) => s === "@semio/ui",
    cls: "neutral",
  },
  {
    id: "radix_ui",
    label: "radix-ui",
    test: (s) => s === "radix-ui",
    cls: "neutral",
  },
  {
    id: "tabler",
    label: "@tabler/icons-react",
    test: (s) => s === "@tabler/icons-react",
    cls: "neutral",
  },
  {
    id: "lucide",
    label: "lucide-react",
    test: (s) => s === "lucide-react",
    cls: "neutral",
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.(stories|test)\.tsx?$/.test(entry))
      out.push(full);
  }
  return out;
}

function layerOf(absPath) {
  const rel = relative(ROOT, absPath).replaceAll("\\", "/");
  const key = `components/${rel.replace(/^components\//, "")}`;
  return LAYERS.find((l) => key.startsWith(l.match)) ?? null;
}

/** d2 identifiers cannot carry `-`, `/` or `.`, so slugify every node id. */
const slug = (s) => s.replaceAll(/[^A-Za-z0-9]/g, "_");

/**
 * The node a file contributes in the current mode: itself in `detail` when it is
 * portable, otherwise its layer. The barrel (`ui/index.ts`) is folded into
 * whatever it re-exports, so `detail` never routes every edge through one hub.
 */
function nodeFor(absPath, layer) {
  if (MODE === "detail" && PORTABLE.has(layer.id)) {
    const name = basename(absPath).replace(/\.tsx?$/, "");
    if (name === "index") return null; // barrel: transparent, see resolveThrough
    return {
      id: `${layer.id}__${slug(name)}`,
      label: name,
      cls: layer.cls,
      group: layer.id,
    };
  }
  return { id: layer.id, label: layer.label, cls: layer.cls, group: null };
}

/** Resolve a relative specifier to a real file, trying the usual extensions. */
function resolveLocal(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

/** Captures the binding clause as well as the specifier, so named imports are known. */
const IMPORT_RE = /(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;

function statementsOf(file) {
  const out = [];
  for (const [, clause, spec] of readFileSync(file, "utf8").matchAll(
    IMPORT_RE,
  )) {
    out.push({ clause, spec });
  }
  return out;
}

/** The named bindings in an import clause: `{ A, B as C }` -> ["A", "B"]. */
function namesIn(clause) {
  const braced = clause.match(/\{([\s\S]*)\}/);
  if (!braced) return []; // default or namespace import — no names to resolve
  return braced[1]
    .split(",")
    .map((part) =>
      part
        .replace(/^\s*type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Which portable file owns each exported symbol. `ui/index.ts` is `export *`
 * only, so a barrel import cannot be attributed without this table — and without
 * attribution every `import { Button } from "../ui"` fans out to all 27
 * primitives, which produced a 193-edge hairball.
 */
const EXPORT_RE =
  /export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/g;
const ownerOfSymbol = new Map();

/** Populated after `walk`, below — needs the file list. */
function indexExports(files) {
  for (const file of files) {
    const layer = layerOf(file);
    if (!layer || !PORTABLE.has(layer.id)) continue;
    if (basename(file).replace(/\.tsx?$/, "") === "index") continue;
    for (const [, name] of readFileSync(file, "utf8").matchAll(EXPORT_RE)) {
      if (!ownerOfSymbol.has(name)) ownerOfSymbol.set(name, file);
    }
  }
}

/**
 * In `detail` mode an import of `../ui` lands on the barrel, which is not a real
 * dependency — attribute it to the files that actually own the imported symbols.
 * A barrel import whose names cannot all be resolved keeps an edge to whatever did
 * resolve; unresolvable names are dropped rather than fanned out.
 */
function resolveThrough(fromFile, spec, clause) {
  const target = resolveLocal(fromFile, spec);
  if (!target) return [];
  const isBarrel = basename(target).replace(/\.tsx?$/, "") === "index";
  if (MODE !== "detail" || !isBarrel)
    return [{ file: target, viaBarrel: false }];

  const owners = new Set();
  for (const name of namesIn(clause)) {
    const owner = ownerOfSymbol.get(name);
    if (owner) owners.add(owner);
  }
  return [...owners].map((file) => ({ file, viaBarrel: true }));
}

const edges = new Map(); // "from->to" -> { count, viaBarrel }
const nodes = new Map(); // id -> node
const featureFanIn = new Map(); // portable node id -> distinct feature files importing it

function addNode(n) {
  if (n && !nodes.has(n.id)) nodes.set(n.id, n);
}

const FILES = walk(COMPONENTS);
indexExports(FILES);

for (const file of FILES) {
  const fromLayer = layerOf(file);
  if (!fromLayer) continue;
  const from = nodeFor(file, fromLayer);
  if (!from) continue; // the barrel itself imports nothing meaningful

  // In detail mode a feature file is a counted consumer, not a drawn node.
  const fromIsFeature = MODE === "detail" && !PORTABLE.has(fromLayer.id);
  if (!fromIsFeature) addNode(from);

  for (const { clause, spec } of statementsOf(file)) {
    const targets = [];

    const ext = EXTERNAL.find((e) => e.test(spec));
    if (ext) {
      targets.push({
        node: { id: ext.id, label: ext.label, cls: ext.cls, group: "external" },
        viaBarrel: false,
      });
    } else if (spec.startsWith(".")) {
      for (const { file: target, viaBarrel } of resolveThrough(
        file,
        spec,
        clause,
      )) {
        const toLayer = layerOf(target);
        if (!toLayer) continue;
        const to = nodeFor(target, toLayer);
        if (to) targets.push({ node: to, viaBarrel });
      }
    }

    for (const { node: to, viaBarrel } of targets) {
      if (to.id === from.id) continue; // self / intra-node

      if (fromIsFeature) {
        // Only portable targets are tallied; feature→feature coupling is a
        // layers-view concern and would otherwise inflate these counts.
        if (to.group && to.group !== "external") {
          if (!featureFanIn.has(to.id)) featureFanIn.set(to.id, new Set());
          featureFanIn.get(to.id).add(file);
          addNode(to);
        }
        continue;
      }

      addNode(to);
      const key = `${from.id}->${to.id}`;
      const prev = edges.get(key);
      edges.set(key, {
        count: (prev?.count ?? 0) + 1,
        viaBarrel: prev?.viaBarrel ?? viaBarrel,
      });
    }
  }
}

const lines = [];
lines.push("# GENERATED — do not edit by hand.");
lines.push(
  `# Regenerate: node scripts/component-graph.mjs ${MODE} > docs/references/component-graph-${MODE}.d2`,
);
lines.push(
  "# Render:     d2 --font-regular <Questrial-Regular.ttf> <in>.d2 <out>.svg",
);
lines.push("");
// Brand classes are inlined rather than imported so the diagram renders anywhere
// in the repo without a path to the Semio brand settings. Values are the Semio
// palette: teal #50C4B6 / orange #F56B29 / yellow #FF9E00, #333333 text,
// #555555 connectors, white canvas, 8px radius. Font: Questrial (brand-approved
// free stand-in for the commercial Gilroy/Univia Pro).
lines.push(
  "vars: { d2-config: { theme-id: 0; pad: 24; sketch: false; layout-engine: dagre } }",
);
// `detail` runs left-to-right so the 27 ui/ primitives stack vertically instead of
// filling one dagre rank — top-down put them on a single 11,800px-wide row. elk
// handles wide graphs better in principle but does not terminate on this one.
if (MODE === "detail") lines.push("direction: right");
lines.push("");
lines.push("classes: {");
lines.push(
  '  primary:   { style: { fill: "#50C4B6"; stroke: "#2AA499"; font-color: "#FFFFFF"; border-radius: 8; stroke-width: 2 } }',
);
lines.push(
  '  secondary: { style: { fill: "#F56B29"; stroke: "#EC4D00"; font-color: "#FFFFFF"; border-radius: 8; stroke-width: 2 } }',
);
lines.push(
  '  highlight: { style: { fill: "#FF9E00"; stroke: "#F78600"; font-color: "#333333"; border-radius: 8; stroke-width: 2 } }',
);
lines.push(
  '  neutral:   { style: { fill: "#F7F8F8"; stroke: "#888888"; font-color: "#333333"; border-radius: 8; stroke-width: 2 } }',
);
lines.push(
  '  emphasis:  { style: { fill: "#48E2CE"; stroke: "#2AA499"; font-color: "#111111"; border-radius: 8; stroke-width: 2 } }',
);
lines.push(
  '  group:     { style: { fill: "#FFFFFF"; stroke: "#50C4B6"; font-color: "#333333"; border-radius: 8; stroke-width: 2 } }',
);
lines.push("}");
lines.push("");
// Plain title, not `|md #  … |`: d2's markdown renderer swallows part of a heading
// containing an em dash and drops the trailing word onto its own line.
lines.push(
  MODE === "detail"
    ? 'title: "vizij-authoring — portable component imports (ui/ · editor/ · common/)" { near: top-center; shape: text; style: { font-size: 32; bold: true; font-color: "#333333" } }'
    : 'title: "vizij-authoring — component import layers" { near: top-center; shape: text; style: { font-size: 32; bold: true; font-color: "#333333" } }',
);
lines.push("");

const GROUPS = [
  { id: "external", label: "third-party substrate" },
  { id: "ui", label: "ui/ — app primitives on @semio/ui" },
  { id: "editor_atoms", label: "editor/atoms" },
  { id: "editor_hooks", label: "editor/hooks" },
  { id: "editor_molecules", label: "editor/molecules" },
  { id: "common", label: "common/" },
];

/** `←N` = distinct feature files importing this component. Not drawn as edges. */
function labelFor(n) {
  const fanIn = featureFanIn.get(n.id)?.size ?? 0;
  return fanIn ? `${n.label}\\n←${fanIn}` : n.label;
}

// Grouped nodes first (detail mode only — in layers mode every node is top-level).
for (const g of GROUPS) {
  const members = [...nodes.values()].filter((n) => n.group === g.id);
  if (!members.length) continue;
  lines.push(`${g.id}_g: "${g.label}" {`);
  lines.push("  class: group");
  for (const n of members)
    lines.push(`  ${n.id}: "${labelFor(n)}" { class: ${n.cls} }`);
  lines.push("}");
}
lines.push("");

if (MODE === "detail") {
  lines.push(
    'legend: "←N = number of feature-code files importing this component.\\nDashed = reached through the ui/ barrel." { near: bottom-left; shape: text; style: { font-size: 20; font-color: "#555555" } }',
  );
  lines.push("");
}

for (const n of [...nodes.values()].filter((x) => !x.group)) {
  lines.push(`${n.id}: "${n.label}" { class: ${n.cls} }`);
}
lines.push("");

/** Fully-qualified d2 path for a node (grouped nodes live inside a container). */
const pathOf = (id) => {
  const n = nodes.get(id);
  return n.group ? `${n.group}_g.${id}` : id;
};

for (const [key, { count, viaBarrel }] of [...edges.entries()].sort(
  (a, b) => b[1].count - a[1].count,
)) {
  const [from, to] = key.split("->");
  const dash = viaBarrel ? "; stroke-dash: 3" : "";
  lines.push(
    `${pathOf(from)} -> ${pathOf(to)}: "${count}" { style: { stroke: "#555555"; stroke-width: 2${dash} } }`,
  );
}

console.log(lines.join("\n"));
