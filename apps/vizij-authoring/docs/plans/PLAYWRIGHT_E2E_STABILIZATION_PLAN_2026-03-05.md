# Playwright E2E Stabilization Plan

Last updated: 2026-03-05
Scope: `apps/vizij-authoring`
Status: active follow-up after initial smoke/workflow harness landing

## Goal

Build a stable browser-regression layer that protects core authoring workflows while the app goes through modular consolidation and DRY refactors.

The key constraint is that not every realistic runtime workflow is equally suitable for the PR gate. We should explicitly separate:

1. deterministic CI-smoke coverage,
2. higher-fidelity workflow coverage,
3. targeted integration tests for state transitions that are difficult to prove through headless browser automation alone.

## What Landed

The first Playwright tranche already provides:

1. app boot + preset load smoke coverage,
2. procedural animation panel smoke coverage,
3. reference-face smoke coverage for modal/guardrail behavior,
4. export dialog smoke coverage,
5. pose lifecycle workflow coverage,
6. pose export/import round-trip workflow coverage,
7. stable `data-testid` contracts for the app shell and core authoring surfaces.

This is the correct foundation for refactor protection. The remaining work is about making the most important dual-face workflows reliable under automation.

## Diagnosis From Quori Blink Workflow Attempt

We attempted to automate this manual workflow:

1. load `Quori Blender Export` as the main face,
2. switch to reference-face mode,
3. load `Quori Basic` as the reference face,
4. open `Control Authoring -> Drivers`,
5. copy the Quori basic blink driver into main,
6. accept mapping suggestions,
7. drive the resulting shared/both-faces control and confirm both faces blink.

The first failed attempt mixed together three different issues:

1. The test assumed `main runtime ready` implied `workflow ready`. That was too early for this path because the orientation confirmation modal could still appear after the main face mounted.
2. The test wrongly assumed the blender-export main face should already expose a blink driver before the copy step. In this workflow, reference copy is what creates the useful main-side blink driver.
3. One exploratory browser session created a custom blink driver manually, which contaminated later observations.

After correcting those mistakes, the remaining automation gap was narrower:

1. In Playwright headless Chromium, the reference face file attached (`Swap` / `Unload` appeared).
2. The dual-face driver state still did not populate for the targeted workflow (`Reference Face (0)`, `Shared (0)`).
3. Browser automation logs showed `THREE.WebGLRenderer: Context Lost.` during the dual-face flow.

That means the main unresolved problem is not the manual product workflow itself. The remaining gap is getting automation to reach the same fully-loaded dual-face runtime state as a normal interactive browser session.

## Recommended Test Strategy

### Tier 1: PR-gated CI smoke

Keep this suite very small and deterministic.

Coverage:

1. boot + main-face preset load,
2. procedural animation basic authoring,
3. reference-face smoke for loader + modal/guardrail path,
4. export dialog + deterministic artifact download.

Rules:

1. no visual diff assertions,
2. no OS file picker dependency when built-in presets exist,
3. no deep GLB payload parsing,
4. no dependence on complex dual-WebGL success conditions.

Purpose:

Catch broad app-shell regressions during refactors without creating flaky gate failures.

### Tier 2: Core workflow suite

Run this outside the small PR gate first:

1. locally in headed Chromium,
2. optionally in Xvfb-backed CI,
3. or nightly-only CI until it proves stable.

Priority scenarios:

1. Quori blender-export main + Quori basic reference blink-copy workflow,
2. successful reference-to-main copy with shared control activation,
3. inspector-driven authoring path that changes runtime behavior and survives export/import,
4. deeper procedural animation editing workflow.

Purpose:

Protect the risky authoring paths most likely to regress during modular consolidation, even if those tests need a more realistic browser environment.

### Tier 3: Integration coverage for semantic guarantees

Some workflows should also be protected below the browser layer with stateful integration tests.

Priority targets:

1. reference-face runtime/catalog readiness,
2. copy proposal generation for reference drivers,
3. mapping suggestion acceptance,
4. main-face driver creation after copy,
5. shared control write propagation to main + reference input routes.

Purpose:

When a browser flow is visually or timing-sensitive, prove the semantic state changes in a less fragile layer.

## Next Implementation Steps

### 1. Add explicit E2E readiness hooks

Add non-user-facing but stable `data-testid` or status markers for:

1. orientation modal presence/accepted state,
2. face-load milestone chain completion (`asset -> bundle -> graph -> runtime`),
3. reference-face catalog/runtime readiness,
4. shared driver availability for the current selection.

This avoids encoding readiness indirectly through incidental UI text.

### 2. Reproduce the Quori blink workflow in a higher-fidelity browser run

Before re-landing the test:

1. run the exact workflow in headed Chromium from Playwright,
2. confirm whether the remaining issue is strictly headless WebGL/context loss,
3. document the exact environment requirements if headed/Xvfb is necessary.

### 3. Land the blink workflow as a semantic-first regression test

The assertions should be ordered by value:

1. reference drivers become available,
2. blink copy modal opens,
3. mapping suggestions can be accepted,
4. main/shared driver count increases,
5. shared control exists,
6. changing shared control updates both runtime write paths or staged values,
7. optional visual assertion: both canvases change after the shared blink write.

The visual assertion should be additive, not the sole proof.

### 4. Keep CI gate separate from higher-fidelity workflows

Do not promote the blink workflow into PR-gated smoke until:

1. it is stable across repeated runs,
2. it no longer depends on brittle timing around dual-WebGL initialization,
3. its runtime environment is reproducible in CI.

## Success Criteria

We should consider the E2E layer “ready for refactor protection” when:

1. the current smoke suite stays green and fast in CI,
2. at least one successful dual-face copy workflow runs reliably in a browser environment we control,
3. semantic copy/write propagation is covered even if the visual/browser layer remains environment-sensitive,
4. the suite clearly distinguishes gate-worthy regressions from exploratory or nightly-only workflow failures.

## Practical Recommendation

For the upcoming consolidation work, use the current smoke suite as the hard gate and treat the Quori blink workflow as the highest-priority next stabilization task.

That gives us a sane protection gradient:

1. stable smoke tests for every PR,
2. stronger workflow coverage where the architecture risk actually lives,
3. semantic integration tests to keep browser flakiness from becoming the only line of defense.
