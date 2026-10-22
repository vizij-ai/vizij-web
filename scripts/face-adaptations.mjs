#!/usr/bin/env node
/**
 * Hold every face GLB's `standard-adaptation` graph to its sidecar.
 *
 * A face's standard adaptation — the graph mapping the Vizij face standard's
 * `standard/vizij/*` controls onto this face's own rig — is reviewed as text.
 * The sidecar beside the GLB, `<face>.standard-adaptation.json`, is its source
 * of truth; the GLB carries a copy in its `VIZIJ_bundle`, under the id
 * `<faceId>_standard_adaptation`, which is what a runtime loads. A GLB is
 * a build artifact of its sidecar, never edited on its own.
 *
 *   node scripts/face-adaptations.mjs check
 *   node scripts/face-adaptations.mjs pack [<face.glb> ...]
 *
 * `check` fails when a GLB's embedded adaptation differs from its sidecar,
 * when a GLB embeds an adaptation with no sidecar beside it, when it embeds
 * more than one, or when a sidecar has no GLB. Two graphs are the same when
 * their JSON is: key order and formatting aside, so a sidecar formatted by
 * Prettier still matches the copy a GLB carries minified.
 *
 * `pack` grafts each sidecar into its GLB — every face's, or the GLBs named —
 * replacing the copy it carries. A GLB whose copy already matches is left as
 * it is, byte for byte, so packing an unchanged face changes nothing.
 * `scripts/add-standard-adaptation.mjs --sidecar` regenerates a sidecar from a
 * face's rig; `pack` is how a hand-edited sidecar reaches its GLB.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findBundle, parseGlb, writeGlb } from "./glb-bundle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KIND = "standard-adaptation";
const SIDECAR_SUFFIX = `.${KIND}.json`;
/** Directories that hold no source assets. */
const SKIPPED = new Set(["node_modules", "dist", "build", "target", ".turbo"]);

/** Every file under `dir` whose name ends with `suffix`, sorted. */
function filesEndingWith(dir, suffix) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED.has(entry.name) && !entry.name.startsWith(".")) {
          walk(join(current, entry.name));
        }
      } else if (entry.name.endsWith(suffix)) {
        found.push(join(current, entry.name));
      }
    }
  };
  for (const top of ["apps", "packages"]) {
    if (existsSync(join(ROOT, top))) {
      walk(join(ROOT, top));
    }
  }
  return found.sort();
}

/** The sidecar path beside `glb`. */
function sidecarOf(glb) {
  return glb.replace(/\.glb$/, SIDECAR_SUFFIX);
}

/** The GLB path beside `sidecar`. */
function glbOf(sidecar) {
  return `${sidecar.slice(0, -SIDECAR_SUFFIX.length)}.glb`;
}

/** `value` with every object's keys sorted, for a comparison of content. */
function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

function sameGraph(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** A GLB's document, its bundle, and the adaptation entries it embeds. */
function readFace(glb) {
  const { json, chunks } = parseGlb(readFileSync(glb));
  const bundle = findBundle(json);
  const adaptations = (bundle.graphs ?? []).filter(
    (graph) => graph?.kind === KIND,
  );
  return { json, chunks, bundle, adaptations };
}

function readSidecar(sidecar) {
  return JSON.parse(readFileSync(sidecar, "utf8"));
}

/** Every disagreement between the faces and their sidecars, as messages. */
function problems() {
  const found = [];
  const sidecars = new Set(filesEndingWith(ROOT, SIDECAR_SUFFIX));
  for (const sidecar of sidecars) {
    if (!existsSync(glbOf(sidecar))) {
      found.push(`${relative(ROOT, sidecar)}: no GLB beside it`);
    }
  }
  for (const glb of filesEndingWith(ROOT, ".glb")) {
    const name = relative(ROOT, glb);
    const sidecar = sidecarOf(glb);
    let face;
    try {
      face = readFace(glb);
    } catch (error) {
      // A GLB without a bundle — a raw export — carries no adaptation, which
      // is only wrong when a sidecar says it should.
      if (sidecars.has(sidecar)) {
        found.push(`${name}: ${error.message}, but a sidecar is beside it`);
      }
      continue;
    }
    const { adaptations } = face;
    if (!sidecars.has(sidecar)) {
      if (adaptations.length > 0) {
        found.push(
          `${name}: embeds a ${KIND} graph with no sidecar beside it (${relative(ROOT, sidecar)})`,
        );
      }
      continue;
    }
    if (adaptations.length === 0) {
      found.push(`${name}: embeds no ${KIND} graph — run \`pack\``);
    } else if (adaptations.length > 1) {
      found.push(`${name}: embeds ${adaptations.length} ${KIND} graphs`);
    } else if (!sameGraph(adaptations[0].spec, readSidecar(sidecar))) {
      found.push(
        `${name}: its ${KIND} graph differs from ${relative(ROOT, sidecar)} — run \`pack\``,
      );
    }
  }
  return found;
}

/** Graft `glb`'s sidecar into it; whether the GLB was rewritten. */
function pack(glb) {
  const sidecar = sidecarOf(glb);
  if (!existsSync(sidecar)) {
    throw new Error(`${relative(ROOT, glb)}: no sidecar beside it`);
  }
  const spec = readSidecar(sidecar);
  const { json, chunks, bundle, adaptations } = readFace(glb);
  if (adaptations.length === 1 && sameGraph(adaptations[0].spec, spec)) {
    return false;
  }
  const faceId = bundle.metadata?.faceId;
  if (typeof faceId !== "string" || !faceId) {
    throw new Error(
      `${relative(ROOT, glb)}: the bundle declares no metadata.faceId, so its adaptation has no id`,
    );
  }
  const entry = { kind: KIND, id: `${faceId}_standard_adaptation`, spec };
  const graphs = (bundle.graphs ?? []).filter((graph) => graph?.kind !== KIND);
  const at = (bundle.graphs ?? []).findIndex((graph) => graph?.kind === KIND);
  graphs.splice(at === -1 ? graphs.length : at, 0, entry);
  bundle.graphs = graphs;
  writeFileSync(glb, writeGlb(json, chunks));
  return true;
}

function main() {
  const [command = "check", ...args] = process.argv.slice(2);
  if (command === "check") {
    const found = problems();
    if (found.length > 0) {
      for (const problem of found) {
        console.error(`face-adaptations: ${problem}`);
      }
      process.exit(1);
    }
    const count = filesEndingWith(ROOT, SIDECAR_SUFFIX).length;
    console.log(
      `face-adaptations: ${count} GLBs carry their sidecar's ${KIND} graph`,
    );
  } else if (command === "pack") {
    const glbs =
      args.length > 0
        ? args.map((arg) => resolve(arg))
        : filesEndingWith(ROOT, SIDECAR_SUFFIX).map(glbOf);
    for (const glb of glbs) {
      const written = pack(glb);
      console.log(
        `face-adaptations: ${relative(ROOT, glb)} ${written ? "packed" : "already matches its sidecar"}`,
      );
    }
  } else {
    console.error(
      "usage: node scripts/face-adaptations.mjs check | pack [<face.glb> ...]",
    );
    process.exit(2);
  }
}

main();
