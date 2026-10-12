#!/usr/bin/env node
/**
 * Put Quori's conversational program, "Speaks", on the Vizij face standard,
 * in the face GLB's `VIZIJ_bundle`.
 *
 * "Speaks" is a face's active program (`metadata.activeMotionGraphId`): idle
 * eye exploration and jitter, brow and mouth twitches and breathing, switched
 * on the conversation state. It writes the face's standard gaze, lid, brow
 * and mouth controls every step. The edit leaves its motion as authored and
 * changes what it reads and writes:
 *
 * - **Conversation state** — it reads the standard's
 *   `standard/vizij/conversation/{speaking,user_speaking,thinking}` (0/1,
 *   resting at 0) in place of the rig's `speech/*` inputs.
 * - **Idle tuning** — its six knobs are the face's own inputs,
 *   `idle/{eyes/explore,eyes/jitter_amplitude,eyes/jitter_speed,
 *   brows/twitch,mouth/breathing,mouth/twitch}` under the rig prefix, each
 *   resting at the value the program was authored with (the constant it added
 *   to the knob), so the face moves as authored when nobody sets them. Each
 *   declares its range on its input node (`params.min`, `params.max`): 0 is
 *   off and the authored amount the middle — explore [0, 2], jitter_amplitude
 *   [0, 0.3], jitter_speed [0, 1.2], brows/twitch [0, 1], mouth/breathing
 *   [0, 1], mouth/twitch [0, 0.4].
 * - **Gaze target** — it reads `standard/vizij/gaze/target/{x,y}` ([0, 1] of
 *   the face's frame, origin top-left, y downward, resting at 0.5) and the
 *   target's weight, `standard/vizij/gaze/target/weight` ([0, 1], resting at
 *   0). The target maps onto the eye position range — x 0 → -1, 0.5 → 0,
 *   1 → +1; y 0 → +1 (up), 1 → -1 — and, with w the weight:
 *   - the centre of the gaze is w × the mapped target;
 *   - the slow wander (the `explore` terms) is scaled by (1 − w) and by the
 *     edge factor 1 − |w × mapped target| per axis, so it shrinks as the
 *     centre nears the frame's edge rather than pinning the eyes at the
 *     limit;
 *   - the jitter is unchanged, so at w = 1 the eyes hold the target with
 *     micro-motion only;
 *   - then the program's spring, then a clamp to [-1, 1].
 *   At w = 0 the centre term is 0 and the wander's factor exactly 1, so the
 *   program moves exactly as authored whatever the target says. A caller
 *   directs the gaze through the target and its weight: the eye positions
 *   are the program's output, and a write to them is overwritten on the next
 *   step.
 * - **Jaw** — it no longer writes `standard/vizij/mouth/morph/jaw_open`, which
 *   the viseme players own through the face's poses. The breathing lane that
 *   fed only the jaw goes with it; breathing still moves the mouth.
 *
 * Around the program, so nothing reads or lists a path it no longer uses:
 *
 * - the rig's input declarations of the old paths (`speech/*`,
 *   `standard/vmotion/idle/*`), which no edge of the rig reads, are removed
 *   from its spec, its IR and their input metadata;
 * - the standard adaptation's `conversation/* → speech/*` mapping is removed:
 *   the program reads the conversation state itself;
 * - `metadata.speechConfig`, when present, names the standard conversation
 *   paths, so a page that drives the conversation state from it reaches the
 *   program.
 *
 *   node scripts/standardize-speaks-program.mjs <face.glb> [-o <out.glb>]
 *        [--dry-run]
 *
 * A GLB whose program already reads the gaze target's weight is left as it
 * is.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { findBundle, parseGlb, writeGlb } from "./glb-bundle.mjs";

const CONVERSATION = ["speaking", "user_speaking", "thinking"];
const STANDARD = "standard/vizij/";
const OLD_KNOBS = "standard/vmotion/idle/";
const KNOBS = "idle/";
/** Each knob's declared range: 0 is off, the authored amount the middle. */
const KNOB_RANGES = {
  "eyes/explore": [0, 2],
  "eyes/jitter_amplitude": [0, 0.3],
  "eyes/jitter_speed": [0, 1.2],
  "brows/twitch": [0, 1],
  "mouth/breathing": [0, 1],
  "mouth/twitch": [0, 0.4],
};

const f32 = (value) => ({ f32: value });
const valueOf = (node) => {
  const value = node.params?.value;
  return typeof value === "number" ? value : value?.f32;
};

/** A graph spec with lookups over its nodes and edges, edited in place. */
function graphOf(spec) {
  const node = (id) => {
    const found = spec.nodes.find((n) => n.id === id);
    if (!found) {
      throw new Error(`no node ${id}`);
    }
    return found;
  };
  const into = (id, input) =>
    spec.edges.filter(
      (e) =>
        e.to.node_id === id && (input === undefined || e.to.input === input),
    );
  const from = (id, output) =>
    spec.edges.filter(
      (e) =>
        e.from.node_id === id &&
        (output === undefined || e.from.output === output),
    );
  const only = (edges, what) => {
    if (edges.length !== 1) {
      throw new Error(`expected one edge ${what}, found ${edges.length}`);
    }
    return edges[0];
  };
  const byPath = (type, path) =>
    spec.nodes.filter((n) => n.type === type && n.params?.path === path);
  /** Remove `ids`, their edges and layout, then every node that fed only
   * removed nodes, upstream — never a node that fed nothing to begin with. */
  const remove = (ids) => {
    let doomed = new Set(ids);
    while (doomed.size > 0) {
      const feeders = new Set(
        spec.edges
          .filter((e) => doomed.has(e.to.node_id))
          .map((e) => e.from.node_id),
      );
      spec.nodes = spec.nodes.filter((n) => !doomed.has(n.id));
      spec.edges = spec.edges.filter(
        (e) => !doomed.has(e.to.node_id) && !doomed.has(e.from.node_id),
      );
      for (const id of doomed) {
        delete spec.layout?.[id];
      }
      doomed = new Set(
        [...feeders].filter(
          (id) =>
            spec.nodes.some((n) => n.id === id) &&
            !spec.edges.some((e) => e.from.node_id === id),
        ),
      );
    }
  };
  /** Rename a node, its edges and its layout entry. */
  const rename = (oldId, newId) => {
    if (oldId === newId) {
      return;
    }
    node(oldId).id = newId;
    for (const e of spec.edges) {
      if (e.from.node_id === oldId) e.from.node_id = newId;
      if (e.to.node_id === oldId) e.to.node_id = newId;
    }
    if (spec.layout?.[oldId]) {
      spec.layout[newId] = spec.layout[oldId];
      delete spec.layout[oldId];
    }
  };
  /** Add a node beside `near` in the editor's layout. */
  const add = (entry, near, dx, dy) => {
    spec.nodes.push(entry);
    const at = spec.layout?.[near];
    if (at) {
      spec.layout[entry.id] = { x: at.x + dx, y: at.y + dy };
    }
    return entry.id;
  };
  /** A constant feeding `id`'s `input`, named the way the editor names one. */
  const constant = (id, input, value) => {
    const constId = `__const_${id}_${input}`;
    spec.nodes.push({
      id: constId,
      type: "constant",
      params: { value: f32(value) },
    });
    spec.edges.push({ from: { node_id: constId }, to: { node_id: id, input } });
  };
  const edge = (fromId, output, toId, input) =>
    spec.edges.push({
      from:
        output === undefined
          ? { node_id: fromId }
          : { node_id: fromId, output },
      to: { node_id: toId, input },
    });
  return {
    spec,
    node,
    into,
    from,
    only,
    byPath,
    remove,
    rename,
    add,
    constant,
    edge,
  };
}

/** The value a buildrecord holds under each of its keys: its connected
 * `field_*` slots in order, each keyed by the record key at its position. */
function connectedFields(g, id) {
  const index = (e) => Number(e.to.input.slice("field_".length));
  return g
    .into(id)
    .filter((e) => e.to.input?.startsWith("field_"))
    .sort((a, b) => index(a) - index(b));
}

/** Drop lane `lane` of a readrecord → tovector → spring → fromvector chain:
 * the read key, the vector operand and the element, later lanes shifting
 * down one. */
function dropLane(g, { read, toVector, fromVector }, lane) {
  const shift = (name, prefix) => {
    const i = Number(name.slice(prefix.length));
    return i > lane ? `${prefix}${i - 1}` : name;
  };
  g.node(read).params.record_keys.splice(lane, 1);
  g.spec.edges = g.spec.edges.filter(
    (e) =>
      !(e.from.node_id === read && e.from.output === `field_${lane}`) &&
      !(e.from.node_id === fromVector && e.from.output === `elements_${lane}`),
  );
  for (const e of g.spec.edges) {
    if (e.from.node_id === read) e.from.output = shift(e.from.output, "field_");
    if (e.to.node_id === toVector) e.to.input = shift(e.to.input, "operand_");
    if (e.from.node_id === fromVector) {
      e.from.output = shift(e.from.output, "elements_");
    }
  }
}

/** The vector chain feeding an output: fromvector ← spring ← tovector, each
 * operand read off one readrecord. */
function vectorChain(g, outputId) {
  const out = g.only(g.into(outputId, "in"), `into ${outputId}`);
  const fromVector = out.from.node_id;
  const element = Number(out.from.output.slice("elements_".length));
  const spring = g.only(g.into(fromVector, "in"), "into the fromvector").from
    .node_id;
  const toVector = g.only(g.into(spring, "in"), "into the spring").from.node_id;
  const operand = g.only(
    g.into(toVector, `operand_${element}`),
    `into operand ${element}`,
  );
  if (
    g.node(fromVector).type !== "fromvector" ||
    g.node(spring).type !== "spring" ||
    g.node(toVector).type !== "tovector" ||
    g.node(operand.from.node_id).type !== "readrecord"
  ) {
    throw new Error(`${outputId} is not fed by a read → vector → spring chain`);
  }
  return {
    read: operand.from.node_id,
    toVector,
    spring,
    fromVector,
    element,
    key: g.node(operand.from.node_id).params.record_keys[element],
  };
}

/** The idle wander on one eye axis: the term the `explore` knob scales,
 * and the edge carrying it into the eye's sum — the one whose sum the idle
 * record keys `eye_<axis>`. */
function wanderTerm(g, rig, axis) {
  const [explore] = g.byPath("input", `${rig}${KNOBS}eyes/explore`);
  if (!explore) {
    throw new Error("the program reads no idle/eyes/explore");
  }
  const found = [];
  for (const scale of g.from(explore.id)) {
    const term = scale.to.node_id;
    const into = g.only(g.from(term), `out of ${term}`);
    const sum = g.node(into.to.node_id);
    const toRecord = g.only(g.from(sum.id), `out of ${sum.id}`);
    const record = g.node(toRecord.to.node_id);
    if (sum.type !== "add" || record.type !== "buildrecord") {
      throw new Error(`the wander ${term} does not feed an eye's sum`);
    }
    const position = connectedFields(g, record.id).indexOf(toRecord);
    if (record.params.record_keys[position] === `eye_${axis}`) {
      found.push({ term, edge: into });
    }
  }
  if (found.length !== 1) {
    throw new Error(
      `expected one wander on eye ${axis}, found ${found.length}`,
    );
  }
  return found[0];
}

function editProgram(spec, rig) {
  const g = graphOf(spec);
  const report = [];

  // Conversation state: the standard's, in place of the rig's speech flags.
  for (const state of CONVERSATION) {
    const [input] = g.byPath("input", `${rig}speech/${state}`);
    if (!input) {
      throw new Error(`the program reads no ${rig}speech/${state}`);
    }
    const path = `${rig}${STANDARD}conversation/${state}`;
    input.params = { path, value: f32(0) };
    g.rename(input.id, `__input_source_${path}`);
    report.push(`speech/${state} → ${STANDARD}conversation/${state}`);
  }

  // Idle tuning: each knob's authored offset becomes its rest.
  const knobs = spec.nodes.filter(
    (n) =>
      n.type === "input" && n.params?.path?.startsWith(`${rig}${OLD_KNOBS}`),
  );
  if (knobs.length !== 6) {
    throw new Error(`expected six idle knobs, found ${knobs.length}`);
  }
  for (const knob of knobs) {
    const sum = g.node(g.only(g.from(knob.id), `out of ${knob.id}`).to.node_id);
    const operands = g.into(sum.id);
    const offset = operands.find((e) => e.from.node_id !== knob.id);
    if (
      sum.type !== "add" ||
      operands.length !== 2 ||
      g.node(offset.from.node_id).type !== "constant"
    ) {
      throw new Error(`${knob.params.path} does not feed an authored offset`);
    }
    const rest = valueOf(g.node(offset.from.node_id));
    for (const e of g.from(sum.id)) {
      e.from = { node_id: knob.id };
    }
    g.remove([sum.id]);
    const old = knob.params.path.slice(rig.length);
    const name = old.slice(OLD_KNOBS.length);
    const range = KNOB_RANGES[name];
    if (!range) {
      throw new Error(`no declared range for the knob ${name}`);
    }
    const [min, max] = range;
    const path = `${rig}${KNOBS}${name}`;
    knob.params = { path, value: f32(rest), min, max };
    g.rename(knob.id, `__input_source_${path}`);
    report.push(
      `${old} → ${path.slice(rig.length)} (rests at ${Number(rest.toPrecision(6))}, in [${min}, ${max}])`,
    );
  }

  // Jaw: the jaw-open output, its lane, and the record key only it read.
  const [jaw] = g.byPath("output", `${rig}${STANDARD}mouth/morph/jaw_open`);
  if (!jaw) {
    throw new Error("the program writes no jaw_open");
  }
  const mouth = vectorChain(g, jaw.id);
  if (g.from(mouth.fromVector, `elements_${mouth.element}`).length !== 1) {
    throw new Error("the jaw lane feeds more than the jaw");
  }
  g.remove([jaw.id]);
  dropLane(g, mouth, mouth.element);
  let dropped = 0;
  for (const record of spec.nodes.filter((n) => n.type === "buildrecord")) {
    const keys = record.params?.record_keys ?? [];
    const fields = connectedFields(g, record.id);
    const at = keys.findIndex((k, i) => k === mouth.key && i < fields.length);
    if (at === -1) {
      continue;
    }
    // Record keys are positional over the connected fields: drop the key
    // and its field, and renumber the rest in order so each keeps its key.
    keys.splice(at, 1);
    const source = fields[at].from.node_id;
    spec.edges = spec.edges.filter((e) => e !== fields[at]);
    fields.splice(at, 1);
    fields.forEach((e, i) => {
      e.to.input = `field_${i}`;
    });
    if (!spec.edges.some((e) => e.from.node_id === source)) {
      g.remove([source]);
    }
    dropped += 1;
  }
  if (dropped === 0) {
    throw new Error(`no record builds ${mouth.key}`);
  }
  report.push(
    `${STANDARD}mouth/morph/jaw_open no longer written (${mouth.key} dropped)`,
  );

  // Gaze target, held by its weight w: the centre of the gaze moves to
  // w × the target's offset, the slow wander fades by (1 − w) and by the
  // edge factor 1 − |w × offset|, the jitter stays, and the eyes are clamped
  // to their range after the spring. At w = 0 the centre term is 0 and the
  // wander's factor exactly 1, so the motion is the program's own.
  const eyes = {};
  for (const axis of ["x", "y"]) {
    const outputs = ["left_eye", "right_eye"].map((eye) => {
      const [out] = g.byPath("output", `${rig}${STANDARD}${eye}/pos/${axis}`);
      if (!out) {
        throw new Error(`the program writes no ${eye}/pos/${axis}`);
      }
      return out;
    });
    const chains = outputs.map((out) => vectorChain(g, out.id));
    if (
      chains.some(
        (c) =>
          c.fromVector !== chains[0].fromVector ||
          c.element !== chains[0].element,
      )
    ) {
      throw new Error(`the eyes' ${axis} are not one lane`);
    }
    eyes[axis] = {
      outputs,
      chain: chains[0],
      wander: wanderTerm(g, rig, axis),
    };
  }
  const anchor = eyes.x.chain.toVector;
  const weightPath = `${rig}${STANDARD}gaze/target/weight`;
  const weight = g.add(
    {
      id: `__input_source_${weightPath}`,
      type: "input",
      params: { path: weightPath, value: f32(0) },
    },
    anchor,
    -1200,
    -360,
  );
  const released = g.add(
    { id: "gaze_target_released", type: "subtract" },
    anchor,
    -900,
    -360,
  );
  g.constant(released, "lhs", 1);
  g.edge(weight, undefined, released, "rhs");
  for (const [axis, [top, bottom]] of [
    ["x", [-1, 1]],
    ["y", [1, -1]],
  ]) {
    const { outputs, chain, wander } = eyes[axis];
    const row = axis === "x" ? -260 : -160;
    const target = `${rig}${STANDARD}gaze/target/${axis}`;
    const input = g.add(
      {
        id: `__input_source_${target}`,
        type: "input",
        params: { path: target, value: f32(0.5) },
      },
      chain.toVector,
      -1200,
      row,
    );
    const offset = g.add(
      { id: `gaze_target_${axis}_offset`, type: "remap" },
      chain.toVector,
      -900,
      row,
    );
    g.edge(input, undefined, offset, "in");
    g.constant(offset, "in_min", 0);
    g.constant(offset, "in_max", 1);
    g.constant(offset, "out_min", top);
    g.constant(offset, "out_max", bottom);
    // The centre: the offset, held by the weight.
    const held = g.add(
      { id: `gaze_target_${axis}_held`, type: "multiply" },
      chain.toVector,
      -600,
      row,
    );
    g.edge(offset, undefined, held, "operand_0");
    g.edge(weight, undefined, held, "operand_1");
    const aimed = g.add(
      { id: `gaze_target_${axis}_aimed`, type: "add" },
      chain.toVector,
      -300,
      row,
    );
    const lane = g.only(
      g.into(chain.toVector, `operand_${chain.element}`),
      `into the eye ${axis} operand`,
    );
    g.edge(lane.from.node_id, lane.from.output, aimed, "operand_0");
    g.edge(held, undefined, aimed, "operand_1");
    lane.from = { node_id: aimed };
    // The wander's factor: (1 − w) × (1 − |w × offset|).
    const distance = g.add(
      { id: `gaze_target_${axis}_distance`, type: "abs" },
      chain.toVector,
      -600,
      row + 40,
    );
    g.edge(held, undefined, distance, "in");
    const edge = g.add(
      { id: `gaze_target_${axis}_edge`, type: "subtract" },
      chain.toVector,
      -300,
      row + 40,
    );
    g.constant(edge, "lhs", 1);
    g.edge(distance, undefined, edge, "rhs");
    const factor = g.add(
      { id: `gaze_target_${axis}_wander`, type: "multiply" },
      wander.term,
      0,
      80,
    );
    g.edge(released, undefined, factor, "operand_0");
    g.edge(edge, undefined, factor, "operand_1");
    const faded = g.add(
      { id: `gaze_target_${axis}_faded`, type: "multiply" },
      wander.term,
      150,
      40,
    );
    g.edge(wander.term, undefined, faded, "operand_0");
    g.edge(factor, undefined, faded, "operand_1");
    wander.edge.from = { node_id: faded };
    const clamped = g.add(
      { id: `gaze_target_${axis}_clamped`, type: "clamp" },
      chain.fromVector,
      300,
      row,
    );
    g.edge(chain.fromVector, `elements_${chain.element}`, clamped, "in");
    g.constant(clamped, "min", -1);
    g.constant(clamped, "max", 1);
    for (const out of outputs) {
      g.only(g.into(out.id, "in"), `into ${out.id}`).from = {
        node_id: clamped,
      };
    }
    report.push(
      `eyes ${axis} ← ${STANDARD}gaze/target/${axis} (${top} … ${bottom}) held by its weight, the wander faded, clamped to [-1, 1]`,
    );
  }
  return report;
}

/** Remove the rig's declarations of `paths` (relative): input nodes no edge
 * reads, from its spec and its IR, and their input metadata. */
function pruneRigInputs(graph, rig, paths) {
  const absolute = new Set(paths.map((p) => `${rig}${p}`));
  const relative = new Set(paths.map((p) => `/${p}`));
  const pruned = [];
  for (const spec of [graph.spec, graph.ir].filter(Boolean)) {
    const ids = new Set(
      spec.nodes
        .filter((n) => n.type === "input" && absolute.has(n.params?.path))
        .map((n) => n.id),
    );
    if ((spec.edges ?? []).some((e) => ids.has(e.from.node_id))) {
      throw new Error("the rig reads an input this edit removes");
    }
    spec.nodes = spec.nodes.filter((n) => !ids.has(n.id));
    pruned.push(ids.size);
  }
  for (const metadata of [
    graph.spec?.metadata?.vizij,
    graph.ir?.metadata?.annotations?.graphSpecMetadata?.vizij,
  ].filter(Boolean)) {
    metadata.inputs = metadata.inputs?.filter((i) => !relative.has(i.path));
  }
  if (graph.ir?.summary?.inputs) {
    graph.ir.summary.inputs = graph.ir.summary.inputs.filter(
      (p) => !absolute.has(p),
    );
  }
  return pruned[0] ?? 0;
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
      "usage: node scripts/standardize-speaks-program.mjs <face.glb> [-o <out.glb>] [--dry-run]",
    );
    process.exit(2);
  }
  output = output ?? input;

  const { json, chunks } = parseGlb(readFileSync(input));
  const bundle = findBundle(json);
  const faceId = bundle.metadata?.faceId;
  const programId = bundle.metadata?.activeMotionGraphId;
  if (!faceId || !programId) {
    throw new Error("the bundle declares no faceId or no active program");
  }
  const rig = `rig/${faceId}/`;
  const program = bundle.graphs?.find((g) => g.id === programId);
  if (program?.kind !== "motiongraph") {
    throw new Error(`the active program ${programId} is not a motiongraph`);
  }
  console.log(
    `${basename(input)} — face ${faceId}, program ${programId} ("${program.label}")`,
  );
  const weight = `${rig}${STANDARD}gaze/target/weight`;
  if (
    program.spec.nodes.some(
      (n) => n.type === "input" && n.params?.path === weight,
    )
  ) {
    console.log("  the program already reads the gaze target and its weight");
    // A face put on the standard before the knobs declared their ranges
    // gains them here, so the script brings any edition of the face to the
    // same result.
    const declared = [];
    for (const [name, [min, max]] of Object.entries(KNOB_RANGES)) {
      const path = `${rig}${KNOBS}${name}`;
      for (const knob of program.spec.nodes.filter(
        (n) => n.type === "input" && n.params?.path === path,
      )) {
        if (knob.params.min !== min || knob.params.max !== max) {
          knob.params = { ...knob.params, min, max };
          declared.push(`${KNOBS}${name} in [${min}, ${max}]`);
        }
      }
    }
    if (declared.length === 0) {
      console.log("  its knobs declare their ranges: nothing to do");
      return;
    }
    for (const line of declared) {
      console.log(`  ${line}`);
    }
    if (dryRun) {
      console.log("  --dry-run: the GLB is not written");
      return;
    }
    writeFileSync(output, writeGlb(json, chunks));
    console.log(`  wrote ${output}`);
    return;
  }

  const oldPaths = program.spec.nodes
    .filter((n) => n.type === "input")
    .map((n) => n.params.path.slice(rig.length));
  for (const line of editProgram(program.spec, rig)) {
    console.log(`  ${line}`);
  }
  if (program.metadata) {
    program.metadata.nodeCount = program.spec.nodes.length;
    program.metadata.edgeCount = program.spec.edges.length;
  }

  for (const graph of bundle.graphs.filter((g) => g.kind === "rig")) {
    const pruned = pruneRigInputs(graph, rig, oldPaths);
    console.log(
      `  rig ${graph.id}: ${pruned} unread declarations of the old inputs removed`,
    );
  }
  for (const graph of bundle.graphs.filter(
    (g) => g.kind === "standard-adaptation",
  )) {
    const g = graphOf(graph.spec);
    const outputs = CONVERSATION.flatMap((state) =>
      g.byPath("output", `${rig}speech/${state}`),
    ).map((n) => n.id);
    g.remove(outputs);
    console.log(
      `  adaptation ${graph.id}: ${outputs.length} conversation → speech/* outputs removed`,
    );
  }
  const speech = bundle.metadata.speechConfig;
  if (speech) {
    speech.speakingInputPath = `/${STANDARD}conversation/speaking`;
    speech.userSpeakingInputPath = `/${STANDARD}conversation/user_speaking`;
    speech.thinkingInputPath = `/${STANDARD}conversation/thinking`;
    console.log(
      "  metadata.speechConfig names the standard conversation paths",
    );
  }

  if (dryRun) {
    console.log("  --dry-run: the GLB is not written");
    return;
  }
  writeFileSync(output, writeGlb(json, chunks));
  console.log(`  wrote ${output}`);
}

main();
