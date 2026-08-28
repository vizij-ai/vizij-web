#!/usr/bin/env node
/**
 * Graft a `standard-adaptation` graph into a face GLB's `VIZIJ_bundle`.
 *
 * A face GLB exported by the authoring app carries a `rig` graph and a
 * `pose-driver` graph, so it renders and it poses — but nothing in it listens
 * on the Vizij face standard's `standard/vizij/*` control paths. That last link
 * is the `standard-adaptation` graph: the asset-side mapping from the standard
 * vocabulary onto *this* face's own pose weights. Without it a ROS4HRI command
 * travels as far as `standard/vizij/expression/happy` and stops — the profile
 * writes the control, and no graph reads it.
 *
 * This is the Node peer of `vizij-bundle add-graph --kind standard-adaptation`
 * (vizij-rs, crates/tools/vizij-bundle). It discovers the face's pose weights
 * from its pose-driver graph, matches them by name against the canonical
 * mapping below, and writes the graph back into the GLB.
 *
 * The mapping mirrors the shipped reference adaptation,
 * vizij-rs `fixtures/faces/quori/standard-adaptation.json`: each face pose sums
 * the standard controls that should drive it, clamped to [0, 1].
 *
 *   node scripts/add-standard-adaptation.mjs <face.glb> [-o <out.glb>] [--dry-run]
 *
 * Re-running replaces the graph in place (it grafts under a stable id), so an
 * adapted GLB can be re-adapted after a re-export without accumulating copies.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

/** Face pose (canonical leaf name) ← the standard controls that drive it. */
const MAPPING = {
  // Expressions: `standard/vizij/expression/<name>`, the ROS4HRI vocabulary
  // of 25 folded onto the seven poses these faces actually author.
  anger: ["angry", "furious", "annoyed", "disgusted"],
  sad: [
    "sad",
    "despaired",
    "disappointed",
    "guilty",
    "rejected",
    "vulnerable",
    "embarrassed",
    "pleading",
  ],
  concerned: ["scared", "horrified", "suspicious", "skeptical", "confused"],
  surprise: ["surprised", "amazed"],
  happy: ["happy", "excited"],
  sleepy: ["bored", "tired", "asleep"],
  neutral: ["neutral"],
};

/** Face pose (canonical leaf name) ← the standard viseme shapes. */
const VISEME_MAPPING = {
  p: ["PP"],
  f: ["FF"],
  t_2: ["TH"],
  t: ["DD", "nn"],
  k: ["kk"],
  s: ["CH", "SS"],
  r: ["RR"],
  a: ["aa"],
  e: ["E"],
  i: ["ih"],
  o: ["oh"],
  u: ["ou"],
};

const JSON_CHUNK = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;

/** Split a GLB into its JSON document and its trailing chunks, verbatim. */
function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("not a GLB (bad magic)");
  }
  const total = buf.readUInt32LE(8);
  const chunks = [];
  let json = null;
  let offset = 12;
  while (offset < total) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK && json === null) {
      json = JSON.parse(data.toString("utf8"));
      chunks.push({ type, data: null });
    } else {
      chunks.push({ type, data });
    }
    offset += 8 + length;
  }
  if (json === null) {
    throw new Error("the GLB carries no JSON chunk");
  }
  return { json, chunks };
}

/** Re-encode a GLB, the JSON chunk rewritten and every other chunk verbatim. */
function writeGlb(json, chunks) {
  const encoded = chunks.map((chunk) => {
    const data =
      chunk.data === null
        ? Buffer.from(JSON.stringify(json), "utf8")
        : chunk.data;
    // glTF requires 4-byte-aligned chunks: JSON pads with spaces, binary with
    // zeroes, so a padded chunk stays valid as its own content type.
    const padding = (4 - (data.length % 4)) % 4;
    const pad = Buffer.alloc(padding, chunk.type === JSON_CHUNK ? 0x20 : 0x00);
    const header = Buffer.alloc(8);
    header.writeUInt32LE(data.length + padding, 0);
    header.writeUInt32LE(chunk.type, 4);
    return Buffer.concat([header, data, pad]);
  });
  const body = Buffer.concat(encoded);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/**
 * The `VIZIJ_bundle` object: on a node's `extensions`, else the document's —
 * the same two places `vizij-bundle` looks, in the same order.
 */
function findBundle(json) {
  for (const node of json.nodes ?? []) {
    const bundle = node.extensions?.VIZIJ_bundle;
    if (bundle) {
      return bundle;
    }
  }
  const bundle = json.extensions?.VIZIJ_bundle;
  if (bundle) {
    return bundle;
  }
  throw new Error("the GLB carries no VIZIJ_bundle");
}

/**
 * The canonical leaf name of a pose weight path: the pose's own name, stripped
 * of the container, the `pose_` prefix, the `.weight` suffix, and the `d_…_d`
 * wrapping some exporters add. `rig/quori/poses/pose_d_happy_d.weight` → `happy`.
 */
function poseLeaf(path) {
  let leaf = path.split("/").pop() ?? "";
  leaf = leaf.replace(/\.weight$/, "").replace(/^pose_/, "");
  leaf = leaf.replace(/^d_/, "").replace(/_d$/, "");
  // The exporters disagree on the adjective; the pose is the same one.
  return leaf === "angry" ? "anger" : leaf;
}

/** Every store path the bundle's pose-driver graphs read. */
function posePaths(bundle) {
  const paths = [];
  for (const graph of bundle.graphs ?? []) {
    if (graph.kind !== "pose-driver") {
      continue;
    }
    for (const node of graph.spec?.nodes ?? []) {
      if (node.type === "input" && typeof node.params?.path === "string") {
        paths.push(node.params.path);
      }
    }
  }
  return [...new Set(paths)];
}

/**
 * Build the adaptation graph: for each of the face's poses that the canonical
 * mapping covers, sum its standard controls and clamp the total to [0, 1]
 * (several expressions fold onto one pose, so the sum can exceed 1).
 */
function buildSpec(rigPrefix, poses) {
  const nodes = [
    { id: "c0", type: "constant", params: { value: 0.0 } },
    { id: "c1", type: "constant", params: { value: 1.0 } },
  ];
  const edges = [];
  const inputs = new Map();
  const mapped = [];

  /** One `input` node per standard control, shared across the poses it drives. */
  const controlNode = (kind, name) => {
    const key = `${kind}/${name}`;
    if (!inputs.has(key)) {
      const id = `in_${kind}_${name}`;
      nodes.push({
        id,
        type: "input",
        params: {
          path: `${rigPrefix}standard/vizij/${kind}/${name}`,
          value: 0.0,
        },
      });
      inputs.set(key, id);
    }
    return inputs.get(key);
  };

  for (const [kind, mapping] of [
    ["expression", MAPPING],
    ["viseme", VISEME_MAPPING],
  ]) {
    for (const [leaf, controls] of Object.entries(mapping)) {
      const path = poses.get(leaf);
      if (!path) {
        continue;
      }
      const sum = `sum_${leaf}`;
      const clamp = `clamp_${leaf}`;
      const out = `out_${leaf}`;
      nodes.push({ id: sum, type: "add", params: {} });
      nodes.push({ id: clamp, type: "clamp", params: {} });
      nodes.push({ id: out, type: "output", params: { path } });
      controls.forEach((control, i) => {
        edges.push({
          from: { node_id: controlNode(kind, control) },
          to: { node_id: sum, input: `operand_${i}` },
        });
      });
      edges.push({
        from: { node_id: sum },
        to: { node_id: clamp, input: "in" },
      });
      edges.push({
        from: { node_id: "c0" },
        to: { node_id: clamp, input: "min" },
      });
      edges.push({
        from: { node_id: "c1" },
        to: { node_id: clamp, input: "max" },
      });
      edges.push({
        from: { node_id: clamp },
        to: { node_id: out, input: "in" },
      });
      mapped.push({ leaf, kind, path, controls });
    }
  }

  // `sil` is silence — the closed-mouth rest shape, which is what the face
  // already does when no viseme drives it. It gets an input node wired to
  // nothing: the face listens on the shape (so coverage counts it, and the
  // viseme tier completes) without a pose to push. The shipped reference
  // adaptation declares it the same way.
  if (mapped.some((m) => m.kind === "viseme")) {
    controlNode("viseme", "sil");
  }

  return { spec: { nodes, edges }, mapped };
}

function main() {
  const argv = process.argv.slice(2);
  let dryRun = false;
  let input = null;
  let output = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "-o" || arg === "--out") {
      i += 1;
      output = argv[i];
    } else if (!input) {
      input = arg;
    }
  }
  if (!input) {
    console.error(
      "usage: node scripts/add-standard-adaptation.mjs <face.glb> [-o <out.glb>] [--dry-run]",
    );
    process.exit(2);
  }
  output = output ?? input;

  const { json, chunks } = parseGlb(readFileSync(input));
  const bundle = findBundle(json);
  const faceId = bundle.metadata?.faceId;
  if (!faceId) {
    throw new Error(
      "the bundle declares no metadata.faceId, so it has no rig prefix",
    );
  }
  const rigPrefix = `rig/${faceId}/`;

  const paths = posePaths(bundle);
  if (paths.length === 0) {
    throw new Error("the bundle carries no pose-driver graph to adapt onto");
  }
  const poses = new Map(paths.map((p) => [poseLeaf(p), p]));
  const { spec, mapped } = buildSpec(rigPrefix, poses);

  if (mapped.length === 0) {
    throw new Error(
      `none of this face's poses match the canonical mapping: ${[...poses.keys()].join(", ")}`,
    );
  }

  const id = `${faceId}_standard_adaptation`;
  const entry = { kind: "standard-adaptation", id, spec };
  bundle.graphs = bundle.graphs ?? [];
  const existing = bundle.graphs.findIndex((g) => g.id === id);
  if (existing === -1) {
    bundle.graphs.push(entry);
  } else {
    bundle.graphs[existing] = entry;
  }

  const covered = new Set(mapped.map((m) => m.leaf));
  const unmapped = [...poses.keys()].filter((leaf) => !covered.has(leaf));

  console.log(`${basename(input)} — face ${faceId} (rig prefix ${rigPrefix})`);
  console.log(`  ${mapped.length} poses adapted, ${spec.nodes.length} nodes:`);
  for (const m of mapped) {
    console.log(
      `    ${m.path.slice(rigPrefix.length).padEnd(44)} <- ${m.kind}/${m.controls.join(", ")}`,
    );
  }
  if (unmapped.length > 0) {
    console.log(
      `  ${unmapped.length} poses left unmapped: ${unmapped.join(", ")}`,
    );
  }
  if (dryRun) {
    console.log("  --dry-run: nothing written");
    return;
  }
  writeFileSync(output, writeGlb(json, chunks));
  console.log(`  wrote ${output}`);
}

main();
