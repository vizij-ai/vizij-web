# Pose-Rig Overlap Bias / Activity Heuristic Design Pack

Last updated: 2026-02-19  
Owner: Vizij Authoring  
Status: E4.3 design deliverable (docs-only)

## 1) Goal

Define an example-driven policy design for shared-channel overlap where multiple pose groups (or stage sources) drive the same channel, with explicit expected outputs and implementation-ready scope.

This note does not change runtime behavior. It defines candidate policy semantics for follow-on implementation.

## 2) Problem Statement

Current blend modes (`additive`, `average`) are deterministic, but long-tail quality can degrade when overlap contributors are uneven:

1. Tiny residual activity can still skew output.
2. Activity derived from many weak members can dominate one strong contributor.
3. Some channels should accumulate contributors; others should prefer one winner.

We need policy guidance before locking implementation semantics (`E4.1`, `E4.2`).

## 3) Policy Definitions Used in Scenarios

For one channel with neutral `N`, source outputs `G_i`, and source activity `a_i`:

1. `additive`
   - `O = clamp(N + sum_i (G_i - N), [0,1])`
2. `weighted-average`
   - `O = sum_i (w_i * G_i) / sum_i w_i`, fallback `N` when `sum_i w_i = 0`
   - baseline weights in examples: `w_i = a_i`
3. `priority`
   - Select output of highest-priority active source: `O = G_k`
   - `k = argmax(priority_i)` over sources with `a_i >= active_threshold`

Activity-heuristic candidate for weighted-average (used in the "Heuristic" column below):

1. `deadzone`: ignore sources with `a < 0.10`
2. `compression`: `w = sqrt((a - 0.10) / 0.90)` for active sources
3. `floor`: `w = max(w, 0.25)` for active sources

This keeps weighted blending smooth while reducing leak/skew from noisy activity.

## 4) Scenario Pack (Representative Overlaps)

### S1. Balanced disagreement on same channel

- Neutral `N = 0.50`
- Emotion group: `G_e = 0.90`, `a_e = 0.80`
- Viseme group: `G_v = 0.20`, `a_v = 0.70`
- Priority order for this scenario: `viseme > emotion`

| Policy                       | Expected output |
| ---------------------------- | --------------- |
| Additive                     | `0.60`          |
| Weighted-average (`w=a`)     | `0.573`         |
| Priority                     | `0.20`          |
| Weighted-average + heuristic | `0.563`         |

Interpretation: additive and weighted-average are both smooth compromises; priority enforces a hard winner.

### S2. Many weak contributors inflate one source activity

- Neutral `N = 0.40`
- Emotion group (aggregate from many weak poses): `G_e = 0.85`, `a_e = 0.95`
- Viseme group (one strong intent): `G_v = 0.10`, `a_v = 0.35`
- Priority order for this scenario: `viseme > emotion`

| Policy                       | Expected output |
| ---------------------------- | --------------- |
| Additive                     | `0.55`          |
| Weighted-average (`w=a`)     | `0.648`         |
| Priority                     | `0.10`          |
| Weighted-average + heuristic | `0.586`         |

Interpretation: baseline weighted-average over-favors inflated activity; heuristic compression reduces this bias but does not become hard-priority behavior.

### S3. Idle-leak suppression (residual activity tail)

- Neutral `N = 0.40`
- Emotion residual tail: `G_e = 0.90`, `a_e = 0.05`
- Viseme active: `G_v = 0.30`, `a_v = 0.80`
- Priority order: `viseme > emotion`, `active_threshold = 0.10`

| Policy                       | Expected output |
| ---------------------------- | --------------- |
| Additive                     | `0.80`          |
| Weighted-average (`w=a`)     | `0.335`         |
| Priority                     | `0.30`          |
| Weighted-average + heuristic | `0.30`          |

Interpretation: additive can amplify inactive residue; deadzone-style activity heuristics or thresholded priority suppress leak.

### S4. Constructive co-articulation where accumulation is desirable

- Neutral `N = 0.20`
- Smile source: `G_s = 0.60`, `a_s = 0.75`
- Jaw-open source: `G_j = 0.55`, `a_j = 0.70`
- Priority order for this scenario: `smile > jaw`

| Policy                       | Expected output |
| ---------------------------- | --------------- |
| Additive                     | `0.95`          |
| Weighted-average (`w=a`)     | `0.576`         |
| Priority                     | `0.60`          |
| Weighted-average + heuristic | `0.575`         |

Interpretation: additive captures constructive stacking; weighted-average and priority under-represent intended combined intensity.

## 5) Additive vs Weighted-Average vs Priority Tradeoffs

| Policy           | Strengths                                                            | Risks                                                                                          | Best-fit channels                                              |
| ---------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Additive         | Preserves layered buildup; intuitive when contributors should stack. | Easy to overdrive/clamp; sensitive to residual contributors.                                   | Constructive channels where multiple groups should accumulate. |
| Weighted-average | Bounded and smooth; avoids hard jumps.                               | Sensitive to activity definition; can flatten sharp intent; biased by uneven activity signals. | Competing channels needing smooth compromise.                  |
| Priority         | Deterministic winner behavior; ideal for exclusive intents.          | Abrupt switches; secondary contributors disappear; requires tie/threshold policy.              | Exclusive channels where one source should dominate.           |

Key conclusion:

1. No single global policy is sufficient for all channels.
2. Activity shaping (deadzone + compression + floor) improves weighted-average robustness but does not replace priority semantics.
3. Channel-level policy selection remains necessary (`E4.1`) with explicit tie-break behavior (`E4.2`).

## 6) Recommended Policy Envelope (Design Direction)

1. Keep current global blend modes for backwards compatibility.
2. Add optional channel-level overlap policy selector:
   - `additive`
   - `weighted-average` (with optional activity heuristic profile)
   - `priority`
3. Add one default heuristic profile for weighted-average:
   - `deadzone=0.10`
   - `compression=sqrt`
   - `min_active_weight=0.25`
4. Require explicit priority ordering + active threshold for `priority` channels.
5. Keep migration behavior output-stable when overrides are absent.

## 7) Follow-On Implementation Scope (Itemized)

1. IR/config schema
   - Add per-channel overlap policy overrides (reference `E4.1`).
   - Add priority ordering/tie-break fields and activity threshold config (reference `E4.2`).
   - Add optional weighted-average heuristic profile fields.
2. Compiler semantics
   - Implement deterministic activity extraction per channel/source.
   - Implement heuristic weight transformation pipeline.
   - Implement thresholded priority selection with deterministic tie-break.
   - Preserve current behavior when no override is present.
3. Diagnostics
   - Add structured diagnostics for leak suppression, clamping, and priority preemption.
   - Add explainability metadata to compiled summaries (selected policy + effective weights).
4. UI authoring
   - Add per-channel policy editor in pose-group/stage authoring.
   - Add preview panel showing effective overlap contributors and computed output.
5. Test coverage
   - Add golden fixtures for scenarios `S1`-`S4` with locked expected outputs.
   - Add deterministic tie-break tests and migration parity tests.
6. Rollout and compatibility
   - Gate new semantics behind feature flag/default-off for existing payloads.
   - Add import/export round-trip assertions for new fields.

## 8) Evidence and Traceability

This note is the completion artifact for backlog item `E4.3`.

Primary evidence path:

- `apps/vizij-authoring/docs/notes/pose-rig-overlap-heuristics-2026-02-19.md`
