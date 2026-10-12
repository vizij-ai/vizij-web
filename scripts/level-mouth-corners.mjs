#!/usr/bin/env node
/**
 * Rest Quori's mouth corners level, in the face GLB's `VIZIJ_bundle`.
 *
 * Quori's mouth corners are one morph target of the `Mouth` element,
 * `sideud`: 0 is the sculpted base shape, whose upper lip arches so the
 * corners read turned down; positive lifts the corners into a smile, negative
 * drops them into a frown. At `LEVEL` the upper lip is straight — the flat,
 * neutral mouth. This script makes that the face's rest: the value the corners
 * hold with every input at rest, and the value the Neutral expression holds.
 *
 * What the face's graphs and data say of the channel's rest, all set to
 * `LEVEL`:
 *
 * - the element's RobotData default for `sideud`;
 * - the rig: the inputs the channel rests on — its own input and, where the
 *   rig has one, the pose system's `pose/control/<channel>` — and their input
 *   metadata, in the spec and the IR. Where those inputs are summed, the sum's
 *   normalizing subtraction takes the extra rests off, so the rig at rest
 *   outputs `LEVEL` once;
 * - the pose system: the neutral record the pose driver blends around, and
 *   the bundle's pose config (`neutralInputs`, and the pose IR's neutral);
 * - every authored pose keeps the value it was authored with: the pose
 *   driver's per-pose deltas are measured from the neutral, so they are
 *   re-measured from `LEVEL`;
 * - the Neutral expression pose holds the corners at `LEVEL` (its delta 0, its
 *   value in the pose config and the driver's record of it): the neutral
 *   mouth is the flat one, whether a caller leaves every expression at rest or
 *   holds Neutral — as the ROS4HRI mapping does when it commands nothing.
 *
 * Everything that moves the corners from the rest — `mouth/smile`, the face
 * standard's `mouth/morph/corner_puller`, a program, an animation — adds to
 * the rest as before: smile 0 is the flat mouth, smile 1 the full smile (the
 * rigs that read `mouth/smile` clamp the corners to [-1, 1]), and a negative
 * smile frowns.
 *
 *   node scripts/level-mouth-corners.mjs <face.glb> [-o <out.glb>] [--dry-run]
 *
 * The edit is idempotent: a GLB already at rest at `LEVEL` is rewritten
 * unchanged. Re-run it after re-exporting a face from the authoring app.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { findBundle, parseGlb, writeGlb } from "./glb-bundle.mjs";

/**
 * The `sideud` weight at which the upper lip is straight, the corners level
 * with its middle. It is the mouth the Neutral expression of
 * `Quori_Current_Extended.glb` was authored with.
 */
const LEVEL = 0.15;

/** The morph target of the corners, on the element of that name. */
const ELEMENT = "Mouth";
const MORPH = "sideud";

const EPSILON = 1e-6;

/** A number from any of the encodings a bundle stores one in. */
function num(value) {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object") {
    if ("value" in value) {
      return num(value.value);
    }
    for (const key of ["f32", "f64", "float"]) {
      if (typeof value[key] === "number") {
        return value[key];
      }
    }
  }
  throw new Error(`not a number: ${JSON.stringify(value)}`);
}

/** `value` re-encoded as `like` is: a bare number, or `{ <type>: n }`. */
function encodeLike(like, value) {
  if (typeof like === "number") {
    return value;
  }
  if (like && typeof like === "object" && "value" in like) {
    return { ...like, value: encodeLike(like.value, value) };
  }
  const key = ["f32", "f64", "float"].find((k) => k in (like ?? {})) ?? "f32";
  return { [key]: value };
}

/** The corners' animatable: the element's `sideud` feature. */
function cornerFeature(json) {
  const found = [];
  for (const node of json.nodes ?? []) {
    const element = node.extensions?.RobotData;
    if (element?.name === ELEMENT && element.features?.[MORPH]) {
      found.push(element.features[MORPH].value);
    }
  }
  if (found.length !== 1) {
    throw new Error(
      `expected one ${ELEMENT} element with a ${MORPH} morph, found ${found.length}`,
    );
  }
  return found[0];
}

/** Lookups over a graph spec's nodes and incoming edges. */
function graphOf(spec) {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const incoming = new Map();
  for (const edge of spec.edges ?? []) {
    const list = incoming.get(edge.to.node_id) ?? [];
    list.push(edge);
    incoming.set(edge.to.node_id, list);
  }
  return {
    node: (id) => byId.get(id),
    into: (id) => incoming.get(id) ?? [],
    /** Every node `id` reads, transitively, `id` included. */
    upstream(id) {
      const seen = new Set();
      const stack = [id];
      while (stack.length > 0) {
        const next = stack.pop();
        if (seen.has(next)) {
          continue;
        }
        seen.add(next);
        for (const edge of incoming.get(next) ?? []) {
          stack.push(edge.from.node_id);
        }
      }
      return seen;
    },
  };
}

/**
 * The value node `id` outputs with every input at its default, before any
 * time has passed: the rig's arithmetic, which is what a channel's chain is
 * made of.
 */
function evaluate(graph, id, memo = new Map()) {
  if (memo.has(id)) {
    return memo.get(id);
  }
  const node = graph.node(id);
  const port = (name) => {
    const edge = graph.into(id).find((e) => e.to.input === name);
    if (edge) {
      return evaluate(graph, edge.from.node_id, memo);
    }
    const fallback = node.input_defaults?.[name];
    if (fallback === undefined) {
      throw new Error(`${id}: port ${name} has neither an edge nor a default`);
    }
    return num(fallback);
  };
  const operands = () => {
    const names = new Set([
      ...graph.into(id).map((e) => e.to.input),
      ...Object.keys(node.input_defaults ?? {}),
    ]);
    return [...names].filter((n) => n.startsWith("operand_")).map(port);
  };
  let value;
  switch (node.type.toLowerCase()) {
    case "input":
    case "constant":
      value = num(node.params.value);
      break;
    case "output":
      value = port("in");
      break;
    case "add":
      value = operands().reduce((a, b) => a + b, 0);
      break;
    case "multiply":
      value = operands().reduce((a, b) => a * b, 1);
      break;
    case "subtract":
      value = port("lhs") - port("rhs");
      break;
    case "divide":
      value = port("lhs") / port("rhs");
      break;
    case "sin":
      value = Math.sin(port("in"));
      break;
    case "time":
      // The rest is the face before any time has passed.
      value = 0;
      break;
    case "clamp":
      value = Math.min(Math.max(port("in"), port("min")), port("max"));
      break;
    default:
      throw new Error(`${id}: no rest value for a ${node.type} node`);
  }
  memo.set(id, value);
  return value;
}

/** Apply `edit` to the node `id` in the spec and, when present, the IR. */
function editNode(entry, id, edit) {
  edit(entry.spec.nodes.find((n) => n.id === id));
  const mirrored = entry.ir?.nodes?.find((n) => n.id === id);
  if (mirrored) {
    edit(mirrored);
  }
}

/** Set an input node's default, kept in its own encoding. */
const restInput = (value) => (node) => {
  node.params.value = encodeLike(node.params.value, value);
};

/** Add `delta` to a subtract node's `rhs` default (spec or IR form). */
const shiftRhs = (delta) => (node) => {
  if (node.input_defaults?.rhs !== undefined) {
    const rhs = node.input_defaults.rhs;
    node.input_defaults.rhs = encodeLike(rhs, num(rhs) + delta);
  } else if (node.inputDefaults?.rhs !== undefined) {
    node.inputDefaults.rhs += delta;
  } else {
    throw new Error(`${node.id}: no rhs default to shift`);
  }
};

/**
 * The rig: the corners' output rests at `LEVEL`. Returns the channel's key
 * (the rig input's id, the name the pose system knows it by) and the store
 * paths of the inputs it rests on.
 */
function restRig(entry, prefix, animatableId, report) {
  const spec = entry.spec;
  const meta = (spec.metadata?.vizij?.inputs ?? []).find((input) =>
    input.sourceId?.includes(`:${MORPH}:${animatableId}`),
  );
  if (!meta) {
    throw new Error(`the rig declares no input for ${animatableId}`);
  }
  const key = meta.id;
  const paths = new Set([
    `${prefix}${meta.path.replace(/^\//, "")}`,
    `${prefix}pose/control/${key}`,
  ]);

  const graph = graphOf(spec);
  const output = spec.nodes.find(
    (n) => n.type === "output" && n.params?.path === animatableId,
  );
  if (!output) {
    throw new Error(`the rig writes no output to ${animatableId}`);
  }
  const chain = graph.upstream(output.id);
  const rested = spec.nodes.filter(
    (n) => chain.has(n.id) && n.type === "input" && paths.has(n.params?.path),
  );
  if (rested.length === 0) {
    throw new Error(`no input of the ${key} chain to rest`);
  }
  for (const node of rested) {
    editNode(entry, node.id, restInput(LEVEL));
  }

  // Where the rested inputs are summed, the sum's normalizing subtraction
  // takes the extra rests off.
  const excess = evaluate(graphOf(spec), output.id) - LEVEL;
  if (Math.abs(excess) > EPSILON) {
    // The subtraction whose sum adds a rested input in directly.
    const restedIds = new Set(rested.map((n) => n.id));
    const normalizers = spec.nodes.filter((n) => {
      if (
        !chain.has(n.id) ||
        n.type !== "subtract" ||
        n.input_defaults?.rhs === undefined
      ) {
        return false;
      }
      const lhs = graph.into(n.id).find((e) => e.to.input === "lhs");
      return graph
        .into(lhs?.from.node_id)
        .some((e) => restedIds.has(e.from.node_id));
    });
    if (normalizers.length !== 1) {
      throw new Error(
        `${key} rests at ${LEVEL + excess}, and ${normalizers.length} normalizing sums could absorb it`,
      );
    }
    editNode(entry, normalizers[0].id, shiftRhs(excess));
  }
  const rest = evaluate(graphOf(spec), output.id);
  if (Math.abs(rest - LEVEL) > EPSILON) {
    throw new Error(`${key} still rests at ${rest}`);
  }

  for (const declared of [
    spec.metadata?.vizij?.inputs,
    entry.ir?.metadata?.annotations?.graphSpecMetadata?.vizij?.inputs,
  ]) {
    for (const input of declared ?? []) {
      if (input.id === key && "defaultValue" in input) {
        input.defaultValue = LEVEL;
      }
    }
  }
  report.push(
    `rig ${entry.id}: ${rested.map((n) => n.params.path).join(", ")} rest at ${LEVEL}`,
  );
  return { key, paths };
}

/**
 * The pose driver: the neutral it blends around holds the corners at `LEVEL`,
 * every pose keeps its authored value, and the Neutral expression's is
 * `LEVEL`.
 */
function restPoseDriver(entry, key, paths, neutralPoseId, report) {
  const spec = entry.spec;
  const graph = graphOf(spec);
  const outputs = spec.nodes.filter(
    (n) => n.type === "output" && paths.has(n.params?.path),
  );
  if (outputs.length === 0) {
    return;
  }
  const chain = new Set(outputs.flatMap((o) => [...graph.upstream(o.id)]));

  // The neutral: a record constant the chain reads the channel's field of.
  const neutralEdges = (spec.edges ?? []).filter(
    (e) =>
      chain.has(e.to.node_id) &&
      e.selector?.at(-1)?.field === key &&
      graph.node(e.from.node_id)?.type === "constant",
  );
  const records = [...new Set(neutralEdges.map((e) => e.from.node_id))];
  if (records.length !== 1) {
    throw new Error(
      `${entry.id}: expected one neutral record for ${key}, found ${records.length}`,
    );
  }
  const field = recordField(graph.node(records[0]), key);
  const oldNeutral = num(field.value);
  field.value = encodeLike(field.value, LEVEL);

  // Each blend's per-pose deltas, re-measured from the new neutral.
  const blends = spec.nodes.filter(
    (n) => chain.has(n.id) && n.type === "weightedsumvector",
  );
  const done = new Set();
  for (const blend of blends) {
    const from = (input) =>
      graph.node(
        graph.into(blend.id).find((e) => e.to.input === input).from.node_id,
      );
    const values = from("values");
    if (done.has(values.id)) {
      continue;
    }
    done.add(values.id);
    const masks = from("masks").params.value.f32s;
    const weights = from("weights");
    const poseAt = (i) =>
      graph.into(weights.id).find((e) => e.to.input === `operand_${i + 1}`)
        ?.from.node_id;
    const deltas = values.params.value.f32s;
    values.params.value.f32s = deltas.map((delta, i) => {
      if (masks[i] === 0) {
        return delta;
      }
      if (poseAt(i) === `pose_${neutralPoseId}`) {
        return 0;
      }
      return delta + oldNeutral - LEVEL;
    });
  }
  if (done.size === 0) {
    throw new Error(`${entry.id}: no pose blend drives ${key}`);
  }

  // The Neutral pose's own record, which the driver carries beside the
  // neutral it blends around.
  const ownRecord = graph.node(`pose_record_${neutralPoseId}`);
  if (ownRecord) {
    const own = recordField(ownRecord, key, { optional: true });
    if (own) {
      own.value = encodeLike(own.value, LEVEL);
    }
  }
  report.push(
    `pose driver ${entry.id}: neutral ${oldNeutral} → ${LEVEL}, ${done.size} blends re-measured`,
  );
}

/** The `key` field of a pose record constant (`{ values: { <key>: … } }`). */
function recordField(node, key, { optional = false } = {}) {
  const field =
    node.params.value.keyvalue?.fields?.values?.value?.keyvalue?.fields?.[key];
  if (!field && !optional) {
    throw new Error(`${node.id} has no ${key} field`);
  }
  return field;
}

/** The Neutral expression pose of the bundle's pose config, if it has one. */
function neutralPose(config) {
  const poses = (config?.poses ?? []).filter(
    (pose) => pose.name?.toLowerCase() === "neutral",
  );
  if (poses.length > 1) {
    throw new Error(`${poses.length} poses are named Neutral`);
  }
  return poses[0];
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
      "usage: node scripts/level-mouth-corners.mjs <face.glb> [-o <out.glb>] [--dry-run]",
    );
    process.exit(2);
  }
  output = output ?? input;

  const { json, chunks } = parseGlb(readFileSync(input));
  const bundle = findBundle(json);
  const faceId = bundle.metadata?.faceId;
  if (!faceId) {
    throw new Error("the bundle declares no metadata.faceId");
  }
  const prefix = `rig/${faceId}/`;
  const report = [];

  const feature = cornerFeature(json);
  feature.default = encodeLike(feature.default, LEVEL);
  report.push(`RobotData ${feature.name}: default ${LEVEL}`);

  const rigs = (bundle.graphs ?? []).filter((g) => g.kind === "rig");
  if (rigs.length !== 1) {
    throw new Error(`expected one rig graph, found ${rigs.length}`);
  }
  const { key, paths } = restRig(rigs[0], prefix, feature.id, report);

  const config = bundle.poses?.config;
  const neutral = neutralPose(config);
  for (const entry of bundle.graphs.filter((g) => g.kind === "pose-driver")) {
    restPoseDriver(entry, key, paths, neutral?.id, report);
  }
  if (config?.neutralInputs && key in config.neutralInputs) {
    config.neutralInputs[key] = LEVEL;
  }
  if (neutral?.values && key in neutral.values) {
    neutral.values[key] = LEVEL;
  }
  const poseIr = bundle.poses?.metadata?.poseIr;
  if (poseIr?.neutral?.values && key in poseIr.neutral.values) {
    poseIr.neutral.values[key] = LEVEL;
  }
  const irNeutral = (poseIr?.poses ?? []).find((p) => p.id === neutral?.id);
  if (irNeutral?.targets && key in irNeutral.targets) {
    irNeutral.targets[key] = LEVEL;
  }
  if (neutral) {
    report.push(`Neutral pose ${neutral.id}: ${key} ${LEVEL}`);
  }

  console.log(`${basename(input)} — face ${faceId}, corners ${key}`);
  for (const line of report) {
    console.log(`  ${line}`);
  }
  if (dryRun) {
    console.log("  --dry-run: the GLB is not written");
    return;
  }
  writeFileSync(output, writeGlb(json, chunks));
  console.log(`  wrote ${output}`);
}

main();
