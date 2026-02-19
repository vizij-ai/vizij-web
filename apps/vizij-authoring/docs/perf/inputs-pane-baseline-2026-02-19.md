# Inputs Pane Performance Baseline (2026-02-19)

Captured timestamp (UTC): `2026-02-19T06:11:04.911Z`

## Machine context

- Host: `chris-lab-computer`
- OS: `Linux 6.8.0-100-generic x86_64`
- CPU: `Intel(R) Core(TM) i7-10870H CPU @ 2.20GHz` (16 logical CPUs)
- Node: `v24.13.0`
- pnpm: `9.12.2`

## Executed command

```bash
pnpm --filter vizij-authoring run perf:inputs-baseline
```

Script definition:

```bash
VIZIJ_CAPTURE_PERF=1 vitest --run src/components/panels/VariablesPanel.perf.test.tsx --reporter=verbose
```

## Scenario definition (dense Inputs-pane interactions)

- Dataset seeded in `src/components/panels/VariablesPanel.perf.test.tsx`:
  - 640 rig inputs
  - 160 pose-weight inputs
  - 20 derived group outputs
  - 10 derived stage outputs
  - 830 total Inputs rows
- Interaction sequence:
  - search `Rig Control 0500`
  - select `Rig Control 0500`
  - search `Pose Weight 075`
  - search `Group Output · group_03`
  - search `Stage Output · Stage 05`
  - search `Rig Control 0007`

## Baseline metrics (this run)

- Interaction latency (ms): `avg=23.773`, `p95=67.314`, `max=67.314`
- Rerender/compute evidence (React Profiler):
  - commits: `20 total`, `19 update`
  - duration: `totalActual=130.146ms`, `updateActual=70.852ms`, `updateMax=15.424ms`, `maxBase=42.364ms`

Raw emitted metric line:

```text
[perf][inputs-pane-baseline] {"timestamp":"2026-02-19T06:11:04.911Z","scenario":{"rigInputs":640,"poseWeights":160,"groupOutputs":20,"stageOutputs":10,"totalRows":830,"interactions":6},"latencyMs":{"average":23.773,"p95":67.314,"max":67.314},"profiler":{"commitsTotal":20,"commitsUpdate":19,"totalActualDurationMs":130.146,"updateActualDurationMs":70.852,"updateMaxDurationMs":15.424,"maxBaseDurationMs":42.364}}
```
