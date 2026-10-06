#!/usr/bin/env node
/**
 * Build a face's `standard-adaptation` graph from its own rig, and graft it
 * into the face GLB's `VIZIJ_bundle`.
 *
 * A face GLB exported by the authoring app carries a `rig` graph and a
 * `pose-driver` graph, so it renders and it poses — but its rig listens on its
 * own paths, not on the Vizij face standard's `standard/vizij/*` controls. The
 * `standard-adaptation` graph is that last link: the asset-side mapping from
 * the `vizij-face` profile onto *this* face's controls. Without it a ROS4HRI
 * command travels as far as `standard/vizij/expression/happy` and stops — the
 * profile writes the control, and no graph reads it.
 *
 * The mapping is the shipped reference adaptation's, vizij-rs
 * `fixtures/faces/quori/standard-adaptation.json`, carried onto whatever
 * controls this face's rig has:
 *
 * - expressions and visemes: each face pose sums the standard controls that
 *   should drive it, clamped to [0, 1] (the profile's 27 expressions fold onto
 *   the seven emotion poses these faces author; the 15 viseme shapes onto the
 *   letter poses). `viseme/sil`, the closed-mouth rest, is listened to and
 *   drives nothing;
 * - gaze: nothing when the rig listens on `standard/vizij/*` itself; the
 *   legacy `standard/<eye>/pos/*` inputs one to one; the eyes' own
 *   `propsrig/<l|r>_eye/translation/*` through the rig input's authored range,
 *   -1 → min, 0 → its rest, 1 → max (what `@vizij/runtime-react`'s
 *   `mapNormalizedControlValue` does with the same metadata);
 * - top eyelids ([0, 1], 1 closed): nothing when the rig listens on
 *   `standard/vizij/*` itself; the legacy `standard/<eye>_top_eyelid/pos/y`
 *   inputs one to one;
 * - blink: the rig's `lids/blink` or `blink` input;
 * - conversation state: the rig's `speech/<state>` inputs.
 *
 * Only an input the face's graphs pass on counts as one of its controls. What
 * the face has no control for stays unmapped, and the script lists it: it
 * never invents a pose. `vizij-bundle validate` grades what the graph
 * listens on.
 *
 *   node scripts/add-standard-adaptation.mjs <face.glb> [-o <out.glb>]
 *        [--sidecar <adaptation.json>] [--dry-run]
 *
 * `--sidecar` also writes the graph as a pretty-printed sidecar, the form
 * `vizij-bundle add-graph --kind standard-adaptation` reads. Re-running
 * replaces the graph in place (it grafts under a stable id), so an adapted GLB
 * can be re-adapted after a re-export without accumulating copies.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

/** Emotion pose (canonical leaf name) ← the standard expressions that drive it. */
const EXPRESSION_MAPPING = {
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
  concerned: [
    "scared",
    "horrified",
    "suspicious",
    "skeptical",
    "confused",
    "concerned",
  ],
  surprise: ["surprised", "amazed"],
  happy: ["happy", "excited"],
  sleepy: ["bored", "tired", "asleep", "sleepy"],
  neutral: ["neutral"],
};

/** Letter pose (canonical leaf name) ← the standard viseme shapes. */
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

const STANDARD_EXPRESSIONS = Object.values(EXPRESSION_MAPPING).flat();
const STANDARD_VISEMES = ["sil", ...Object.values(VISEME_MAPPING).flat()];
const CONVERSATION = ["speaking", "user_speaking", "thinking"];
const EYES = [
  ["left", "x"],
  ["left", "y"],
  ["right", "x"],
  ["right", "y"],
];

/** The other names the exporters gave an emotion pose. */
const LEAF_ALIASES = { angry: "anger", surprised: "surprise" };

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
 * The face's controls: every input path its graphs read and pass on, relative
 * to the rig prefix, and the rig's authored input metadata (range, rest) by
 * relative path. An input no edge leaves drives nothing, so it is no control:
 * mapping onto it would list the standard path as covered while moving
 * nothing. An adaptation already embedded is not one of the face's controls.
 */
function faceControls(bundle, rigPrefix) {
  const paths = new Set();
  const metadata = new Map();
  for (const graph of bundle.graphs ?? []) {
    if (graph.kind === "standard-adaptation") {
      continue;
    }
    const read = new Set(
      (graph.spec?.edges ?? []).map((edge) => edge.from?.node_id),
    );
    for (const node of graph.spec?.nodes ?? []) {
      const path = node.params?.path;
      if (
        node.type?.toLowerCase() === "input" &&
        typeof path === "string" &&
        read.has(node.id)
      ) {
        paths.add(
          path.startsWith(rigPrefix) ? path.slice(rigPrefix.length) : path,
        );
      }
    }
    if (graph.kind === "rig") {
      for (const entry of graph.spec?.metadata?.vizij?.inputs ?? []) {
        metadata.set(entry.path.replace(/^\//, ""), entry);
      }
    }
  }
  return { paths, metadata };
}

/**
 * The face's pose weights by canonical leaf name — the pose's own name,
 * stripped of its container, the `pose_` prefix, the `.weight` suffix, and
 * the `d_…_d` wrapping some exporters add. `poses/pose_d_happy_d.weight`,
 * `poses/pose_happy.weight` and `emotions/happy.weight` are all `happy`.
 */
function posePaths(paths) {
  const expressions = new Map();
  const visemes = new Map();
  for (const path of [...paths].sort()) {
    const match = path.match(
      /^(poses|emotions|visemes|\w+_emotions_pose_graph|\w+_visemes_pose_graph)\/(?:pose_)?(?:d_(\w+?)_d|(\w+))\.weight$/,
    );
    if (!match) {
      continue;
    }
    const raw = match[2] ?? match[3];
    const leaf = LEAF_ALIASES[raw] ?? raw;
    const container = match[1];
    if (leaf in EXPRESSION_MAPPING && !container.includes("visemes")) {
      expressions.set(leaf, path);
    } else if (leaf in VISEME_MAPPING && !container.includes("emotions")) {
      visemes.set(leaf, path);
    }
  }
  return { expressions, visemes };
}

/** Build the adaptation graph for a face, and the report of what it maps. */
function buildSpec(rigPrefix, { paths, metadata }) {
  const nodes = [
    { id: "c0", type: "constant", params: { value: 0.0 } },
    { id: "c1", type: "constant", params: { value: 1.0 } },
  ];
  const edges = [];
  const inputs = new Map();
  const mapped = [];
  const unmapped = [];
  const native = [];
  const has = (path) => paths.has(path);
  const edge = (from, to, input) =>
    edges.push({ from: { node_id: from }, to: { node_id: to, input } });

  /** One `input` node per standard control, shared by everything it drives. */
  const control = (path, id) => {
    if (!inputs.has(path)) {
      nodes.push({
        id,
        type: "input",
        params: { path: `${rigPrefix}standard/vizij/${path}`, value: 0.0 },
      });
      inputs.set(path, id);
    }
    return inputs.get(path);
  };

  const output = (id, path, from) => {
    nodes.push({ id, type: "output", params: { path: `${rigPrefix}${path}` } });
    edge(from, id, "in");
  };

  /** `from` clamped to [0, 1] onto the face's `path`. */
  const clampTo = (from, key, path) => {
    nodes.push({ id: `clamp_${key}`, type: "clamp", params: {} });
    edge(from, `clamp_${key}`, "in");
    edge("c0", `clamp_${key}`, "min");
    edge("c1", `clamp_${key}`, "max");
    output(`out_${key}`, path, `clamp_${key}`);
  };

  const { expressions, visemes } = posePaths(paths);
  for (const [kind, short, mapping, poses] of [
    ["expression", "expr", EXPRESSION_MAPPING, expressions],
    ["viseme", "vis", VISEME_MAPPING, visemes],
  ]) {
    for (const [leaf, controls] of Object.entries(mapping)) {
      const path = poses.get(leaf);
      if (!path) {
        continue;
      }
      nodes.push({ id: `sum_${leaf}`, type: "add", params: {} });
      controls.forEach((name, i) => {
        edge(
          control(`${kind}/${name}`, `in_${short}_${name}`),
          `sum_${leaf}`,
          `operand_${i}`,
        );
      });
      clampTo(`sum_${leaf}`, leaf, path);
      mapped.push([path, controls.map((name) => `${kind}/${name}`).join(", ")]);
    }
  }
  if (visemes.size > 0) {
    // Silence is the closed-mouth rest the face already holds when no viseme
    // drives it: the face listens on the shape, with no pose to push.
    control("viseme/sil", "in_vis_sil");
  }

  // Gaze: the eyes' positions, [-1, 1].
  const eyePath = (side, axis) => `${side}_eye/pos/${axis}`;
  if (EYES.every(([s, a]) => has(`standard/vizij/${eyePath(s, a)}`))) {
    native.push("eye positions");
  } else if (EYES.every(([s, a]) => has(`standard/${eyePath(s, a)}`))) {
    for (const [side, axis] of EYES) {
      const from = control(eyePath(side, axis), `in_${side}_eye_${axis}`);
      output(
        `out_${side}_eye_${axis}`,
        `standard/${eyePath(side, axis)}`,
        from,
      );
      mapped.push([`standard/${eyePath(side, axis)}`, eyePath(side, axis)]);
    }
  } else if (
    EYES.every(([s, a]) => {
      const target = `propsrig/${s[0]}_eye/translation/${a}`;
      return has(target) && metadata.has(target);
    })
  ) {
    for (const [side, axis] of EYES) {
      const target = `propsrig/${side[0]}_eye/translation/${axis}`;
      const { range, defaultValue } = metadata.get(target);
      const remap = `remap_${side}_eye_${axis}`;
      nodes.push({
        id: remap,
        type: "piecewise_remap",
        input_defaults: {
          input_breakpoints: { value: { f32s: [-1.0, 0.0, 1.0] } },
          output_breakpoints: {
            value: { f32s: [range.min, defaultValue, range.max] },
          },
        },
      });
      edge(control(eyePath(side, axis), `in_${side}_eye_${axis}`), remap, "in");
      output(`out_${side}_eye_${axis}`, target, remap);
      mapped.push([
        target,
        `${eyePath(side, axis)}: -1, 0, 1 → ${range.min}, ${defaultValue}, ${range.max}`,
      ]);
    }
  } else {
    unmapped.push(...EYES.map(([s, a]) => eyePath(s, a)));
  }

  // Top eyelids, [0, 1], and the blink.
  const blink = ["lids/blink", "blink"].find(has);
  for (const side of ["left", "right"]) {
    const lid = `${side}_eye_top_eyelid/pos/y`;
    if (has(`standard/vizij/${lid}`)) {
      native.push(lid);
    } else if (has(`standard/${lid}`)) {
      const from = control(lid, `in_${side}_top_eyelid`);
      output(`out_${side}_top_eyelid`, `standard/${lid}`, from);
      mapped.push([`standard/${lid}`, lid]);
    } else {
      unmapped.push(lid);
    }
  }
  if (blink) {
    clampTo(control("blink", "in_blink"), "blink", blink);
    mapped.push([blink, "blink"]);
  } else {
    unmapped.push("blink");
  }

  for (const state of CONVERSATION) {
    if (has(`speech/${state}`)) {
      const from = control(`conversation/${state}`, `in_conv_${state}`);
      clampTo(from, `conv_${state}`, `speech/${state}`);
      mapped.push([`speech/${state}`, `conversation/${state}`]);
    } else {
      unmapped.push(`conversation/${state}`);
    }
  }

  for (const name of STANDARD_EXPRESSIONS) {
    if (!inputs.has(`expression/${name}`)) {
      unmapped.push(`expression/${name}`);
    }
  }
  for (const shape of STANDARD_VISEMES) {
    if (!inputs.has(`viseme/${shape}`)) {
      unmapped.push(`viseme/${shape}`);
    }
  }
  return { spec: { nodes, edges }, mapped, unmapped, native };
}

function main() {
  const argv = process.argv.slice(2);
  let dryRun = false;
  let input = null;
  let output = null;
  let sidecar = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "-o" || arg === "--out") {
      i += 1;
      output = argv[i];
    } else if (arg === "--sidecar") {
      i += 1;
      sidecar = argv[i];
    } else if (!input) {
      input = arg;
    }
  }
  if (!input) {
    console.error(
      "usage: node scripts/add-standard-adaptation.mjs <face.glb> [-o <out.glb>] [--sidecar <adaptation.json>] [--dry-run]",
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
  const { spec, mapped, unmapped, native } = buildSpec(
    rigPrefix,
    faceControls(bundle, rigPrefix),
  );
  if (mapped.length === 0) {
    throw new Error("nothing in this face's rig maps onto the face standard");
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

  console.log(`${basename(input)} — face ${faceId} (rig prefix ${rigPrefix})`);
  console.log(
    `  ${mapped.length} face controls driven, ${spec.nodes.length} nodes:`,
  );
  for (const [path, from] of mapped) {
    console.log(`    ${path.padEnd(44)} <- ${from}`);
  }
  if (native.length > 0) {
    console.log(
      `  the rig listens on the standard itself: ${native.join(", ")}`,
    );
  }
  if (unmapped.length > 0) {
    console.log(
      `  ${unmapped.length} standard controls unmapped: ${unmapped.join(", ")}`,
    );
  }
  if (sidecar) {
    writeFileSync(sidecar, `${JSON.stringify(spec, null, 2)}\n`);
    console.log(`  wrote ${sidecar}`);
  }
  if (dryRun) {
    console.log("  --dry-run: the GLB is not written");
    return;
  }
  writeFileSync(output, writeGlb(json, chunks));
  console.log(`  wrote ${output}`);
}

main();
