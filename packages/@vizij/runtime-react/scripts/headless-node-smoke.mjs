/**
 * Headless-Node smoke: proves the wasm layer under the face runtime loads and
 * steps in plain Node — no DOM, no bundler, no vite transforms. This is the
 * §3.5 spike from docs/redesign/06-track-2-implementation.md, kept as a
 * runnable gate (`pnpm smoke:node`); R1 PR-4 extends it to drive FaceRuntime
 * itself once the package move lands.
 *
 * Exits non-zero on any failure so CI can gate on it.
 */
import { init, startDevice } from "@vizij/runtime";

const log = (label, value) =>
  console.log(
    `SPIKE ${label}:`,
    typeof value === "string" ? value : JSON.stringify(value),
  );

try {
  const t0 = Date.now();
  await init();
  log("init", `ok in ${Date.now() - t0}ms (node ${process.version})`);
} catch (err) {
  log("init FAILED", String(err?.stack ?? err));
  process.exit(1);
}

let device = null;
const specs = [
  {
    name: "input+params.path",
    spec: {
      nodes: [
        {
          id: "in_x",
          type: "input",
          params: { path: "rig/spike/x", value: { float: 0.25 } },
        },
      ],
      edges: [],
    },
  },
  { name: "empty graph", spec: { nodes: [], edges: [] } },
];

for (const { name, spec } of specs) {
  try {
    device = await startDevice(spec);
    log("startDevice", `ok with ${name}`);
    break;
  } catch (err) {
    log(`startDevice(${name}) failed`, String(err?.message ?? err));
  }
}
if (!device) {
  process.exit(1);
}

try {
  device.setValue("rig/spike/x", { float: 0.75 });
  device.step(16);
  const changes = device.drainChanges();
  log("step+drainChanges", changes);
  const snapshot = device.readValues(["rig/spike/x"]);
  log("readValues", snapshot);
  device.step(16);
  log("second step", "ok");
  log("RESULT", "arora wasm runs headless in Node");
} catch (err) {
  log("device ops FAILED", String(err?.stack ?? err));
  process.exit(1);
}

// Second half of the spike: the animation module (also wasm-backed).
try {
  const { loadAnimationModule } = await import("@vizij/animation-module");
  const mod = await loadAnimationModule();
  log(
    "animation-module",
    `ok (keys: ${Object.keys(mod ?? {})
      .slice(0, 6)
      .join(", ")})`,
  );
} catch (err) {
  log("animation-module FAILED", String(err?.stack ?? err).slice(0, 400));
  process.exit(1);
}
