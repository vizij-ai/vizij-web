# Authoring Notes Synthesis

Last updated: 2026-02-18

Purpose:
Keep note usage DRY by mapping note content to active backlog/tracker items.

## Active Signal

1. Baseline gate (`B0`) is still blocking new feature expansion.
2. Next major implementation focus is `B1` through `B4` once baseline is green.
3. Audit-driven perf/modularity work is captured in `B5`.

## Note Disposition

### Active notes

1. `apps/vizij-authoring/docs/notes/pose-rig-two-layer-blend-vision-2026-02-11.md`
   Used for pose/group architecture intent and acceptance direction.
2. `apps/vizij-authoring/docs/notes/CONTRIBUTOR_APPENDIX.md`
   Used for practical engineering constraints.

### Archived notes

1. `apps/vizij-authoring/docs/archive/notes/runtime-chain-review-2026-02-11.md`
2. `apps/vizij-authoring/docs/archive/notes/quori-smoke-findings-2026-02-11.md`
3. `apps/vizij-authoring/docs/archive/notes/audit.md`
4. `apps/vizij-authoring/docs/archive/notes/pose_report.md`
5. `apps/vizij-authoring/docs/archive/notes/review.md`
6. `apps/vizij-authoring/docs/archive/notes/pr-draft-p0-p1-for-saad.md`
7. `apps/vizij-authoring/docs/archive/notes/variable_investigation_2026-02-17.md`

### Archived report evidence

1. `apps/vizij-authoring/docs/archive/reports/audit_authoring_report.md`
   Source evidence for backlog `B5` performance/modularity tasks.

## Promotion Map to Backlog

1. Typecheck and test stabilization -> `B0.1` to `B0.3`
2. Inspector/sidebar UX clarity -> `B1.1` to `B1.4`
3. Variables/poses/groups lifecycle completeness -> `B2.1` to `B2.4`
4. Import/export/runtime contract hardening -> `B3.1` to `B3.3`
5. Pose/group model evolution -> `B4.1` to `B4.3`
6. Audit performance/modularity findings -> `B5.1` to `B5.3`

## Rule of Use

If a note contains action-worthy detail:

1. capture it in `plans/BACKLOG.md`,
2. track status/evidence in `plans/TRACKER.md`,
3. keep the note as context only.
