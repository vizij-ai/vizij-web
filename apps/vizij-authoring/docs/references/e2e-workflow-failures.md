# The `workflow` e2e failures, and what is actually wrong

The `e2e (workflow)` CI job has been red since it was introduced. Six specs
fail, and they failed the same way on this branch's other parent (PR #113)
before the two branches were stacked — so none of them is a regression from
the animation/transport work.

They are not one problem. Three distinct causes have been established by
measurement, and each hid the next: with no GL backend the app unmounted, and
only once it stayed mounted did the render loop appear.

## What was found

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "fontFamily": "Questrial, sans-serif",
  "primaryColor": "#50C4B6", "primaryTextColor": "#FFFFFF",
  "primaryBorderColor": "#2AA499", "lineColor": "#555555",
  "textColor": "#333333", "background": "#FFFFFF"
}}}%%
flowchart TD
  job["e2e (workflow)<br/>6 failed / 4 passed"]:::secondary

  job --> gl["Headless Chromium had no GL backend"]:::primary
  gl --> gl1["'Error creating WebGL context'<br/>React tree unmounts, document empty"]:::neutral
  gl1 --> gl2["Every locator fails as<br/>'element(s) not found' or hangs"]:::neutral
  gl2 --> glfix["FIXED: launch with swiftshader"]:::highlight

  glfix --> loop["Revealed: Play program blanks the app"]:::primary
  loop --> loop1["React #185 'Maximum update depth exceeded'<br/>provider context in an effect's deps;<br/>cleanup nulls what the body re-sets"]:::neutral
  loop1 --> loopfix["FIXED: read it from a ref,<br/>drop it from the deps"]:::highlight

  job --> sample["Sampling a value still in motion"]:::primary
  sample --> s1["Status chip says 'runtime: ready'<br/>before its output set is complete"]:::neutral
  s1 --> s2["rig-state-gate read the count once:<br/>152 then 161 on a 2-core runner"]:::neutral
  s2 --> sfix["FIXED: wait for two<br/>consecutive identical samples"]:::highlight

  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333;
```

Fixing the first two cleared none of the six. They were real bugs — the
Play-program crash blanks the app in a real browser too — but adjacent to the
specs rather than under them.

## The six, and what is known about each

```mermaid
%%{init: {"theme": "base", "themeVariables": {
  "fontFamily": "Questrial, sans-serif",
  "primaryColor": "#50C4B6", "primaryTextColor": "#FFFFFF",
  "primaryBorderColor": "#2AA499", "lineColor": "#555555",
  "textColor": "#333333", "background": "#FFFFFF"
}}}%%
flowchart LR
  subgraph assertion["Real assertion failure"]
    lo["load-order:4<br/>toHaveText failed"]:::secondary
  end

  subgraph hang["Confirmed hang"]
    rs144["runtime-sessions:144<br/>locator.evaluate never returns<br/>still hung at 360s, so not a budget"]:::secondary
  end

  subgraph unknown["Timed out at 120s, cause not established"]
    pe["profile-editor:17<br/>locator.click"]:::neutral
    sk["skills:32"]:::neutral
    sp["standard-profile:11<br/>3 exports + re-import + 2nd face load"]:::neutral
  end

  subgraph rebase["Needs re-baselining"]
    rs59["runtime-sessions:59<br/>was the unmount; crash now fixed"]:::highlight
  end

  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333;
```

## How to work these

Three misdiagnoses on `rig-state-gate` alone are the reason for writing this
down. It was read first as a stale hardcoded baseline (the test hardcodes
nothing), then as a real regression in clip seeding (the counts turned out
equal), before measurement showed the test was sampling a value in motion.

What produced answers:

- Capture `page.on("console")` and `page.on("pageerror")` in the spec; filter
  WebGL noise and dedupe. Several "element not found" failures were the React
  tree unmounting from an uncaught error.
- Run against dev for unminified React errors:
  `VIZIJ_E2E_SERVER_MODE=dev npx playwright test <spec> --project=workflow --workers=1`.
  The default preview build reports `Minified React error #185` and nothing else.
- When a locator fails, check the app is still alive:
  `(await page.locator("body").innerText()).length`. Zero means the failure is
  a symptom.
- Read `test-results/<dir>/test-failed-1.png`. A blank frame means it died.
- Suspect a value still settling before asserting on it.
- Iterate on a throwaway `e2e/zz-diag.pw.ts`, then delete it.

Two constraints:

- **One Playwright run at a time**, `--workers=1`. Each test boots a WASM
  runtime and a large GLB face; concurrent runs exhaust memory and fail for
  contention, indistinguishable from a real failure. This is why the config
  pins `workers: 1`.
- **`react-hooks/exhaustive-deps` is off repo-wide**, so nothing catches a
  dependency that changes every render — the shape behind both crashes above.

## Rules for changing anything here

Never weaken an assertion to make a spec pass; if the assertion is right and
the app is wrong, fix the app. Mutation-check every change: revert the fix,
confirm the test fails, restore it, confirm it passes. A test that passes
either way is worth nothing, and three tests written today passed against the
bug they were meant to catch.
