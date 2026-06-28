# Plan — Base UI → Storybook → Figma Code Connect → side-by-side review

> Goal: a rigorous, connected component pipeline. Refactor the Vizij base UI primitives into
> a shared package, give every component a Storybook story, build Figma components connected
> to each via **Code Connect**, and integrate Figma ↔ Storybook so any component can be
> reviewed **side-by-side with its design** (both directions). Supersedes the hand-built
> Figma library + parity work (`11`, `12`) by making the design↔code link real and durable.

## Definition of done

For **every** base component:
1. Refactored implementation in a shared package, tokenized to the Vizij brand.
2. A **Storybook story** covering all variants/sizes/states (+ controls + a11y).
3. A **Figma component** whose variant props match the code props.
4. **Code Connect** published → the component's real code shows in Figma Dev Mode.
5. **`@storybook/addon-designs`** → a "Design" tab shows the Figma frame next to the story.
   Net: open Storybook → see live component + Figma design together; open Figma Dev Mode →
   see the connected code.

## Decisions to lock first (Phase 0)

| Decision | Recommendation |
| --- | --- |
| Where the base lives | **Extract to `packages/@vizij/ui`** (tsup, like other packages). Option: tokenize *in place* first, extract second, to de-risk. |
| Theming | Adopt the canonical **Vizij teal tokens** (`12`) as semantic CSS variables (`--color-accent` → teal), replacing legacy blue. Components stay theme-agnostic (reference vars). |
| Stack | Keep **Base UI + Tailwind v4 + `cn`**; ship a `tokens.css` + Tailwind preset so consumers theme consistently. |
| Fonts | **Self-host Inter** now; wire Gilroy/Univia (brand) behind the same font tokens later. |
| Figma library | **Publish the design file as a Team Library** (Semio) so Code Connect + reuse are clean. Code Connect can also target raw node URLs if we defer publishing. |
| Visual regression | **Chromatic** optional (hosts Storybook + diffs PRs) — decide in Phase 5. |

## Phase 1 — Refactor base components into `@vizij/ui`

- Scaffold `packages/@vizij/ui` (tsup esm/cjs/dts, `external: react,react-dom,@base-ui/react`, exports map, peerDeps react). Add `tokens.css` (Vizij semantic vars, light/dark) + Tailwind preset.
- Move `apps/vizij-authoring/src/components/ui/*` in; strip app coupling (no app stores/imports); keep `Logo`, `MenuBar` review (MenuBar may be dropped).
- Standardize the API: consistent `variant`/`size`/`tone` props, `forwardRef`, controlled/uncontrolled, `className` passthrough, ARIA. Lock the **variant matrix** (the contract Figma mirrors).
- Apply Vizij tokens (teal accent, radius 8). Self-host Inter.
- Re-point `vizij-authoring` to import from `@vizij/ui`; codemod imports; run lint/typecheck/tests (e.g. existing `NumberField`/`sliderDefaultBehavior` tests move with it).
- **Deliverable:** versioned `@vizij/ui` building cleanly; vizij-authoring consuming it.

## Phase 2 — Storybook

- Add **Storybook 8 (`@storybook/react-vite`)** scoped to `@vizij/ui` (`storybook`, `build-storybook` scripts). Addons: essentials, a11y, interactions, **addon-designs**.
- One `*.stories.tsx` per component: a story per variant/size/state + `argTypes` controls + `autodocs`. Story IDs mirror component + variant names (so they line up with Figma variants).
- **Deliverable:** local Storybook with every component + states browsable.

## Phase 3 — Figma components + Code Connect

- Finalize the Figma component sets (library page `12:2`) to the canonical tokens; ensure **variant property names/values match the code props** (e.g. Button `variant=Primary…`). This is what makes Code Connect clean.
- Add **`@figma/code-connect`**: `figma.config.json`, a `*.figma.tsx` per component mapping `figma.connect(Component, '<node-url>', { props, example })` — props map Figma variants → component props.
- `npx figma connect publish` (needs a Figma token) → code snippets appear in **Figma Dev Mode** on each component.
- **Deliverable:** every Figma component shows its real `@vizij/ui` usage in Dev Mode.

## Phase 4 — Integrate Figma ↔ Storybook (the side-by-side)

- In each story, set `parameters.design = { type: 'figma', url: '<figma node url>' }` → **addon-designs renders the Figma frame in a "Design" tab** beside the live story.
- (Reverse) add the Storybook story URL as a link on the Figma component for round-trip.
- **Deliverable:** per component, live story and Figma design reviewable together; Dev Mode shows the code.

## Phase 5 — Review workflow & CI

- Per-component **review checklist**: visual parity, all states, a11y (contrast/focus/roles), tokens (no hardcoded colors), responsive/hug behavior.
- Optional **Chromatic**: publish Storybook for the team + visual-regression on PRs.
- Keep the **parity loop** (`12`) as an ongoing check after any token change.

## Sequencing

`Phase 0 (decisions + token lock) → Phase 1 (package/refactor) → Phases 2 & 3 in parallel → Phase 4 (integration) → Phase 5 (review/CI)`.
Token lock gates everything; Storybook (2) and Figma/Code-Connect (3) can run concurrently once the component contract is fixed.

## Risks / notes

- **Code Connect needs Figma org + Dev Mode access**; `addon-designs` only needs node URLs, so the Storybook-side review works even if Code Connect is deferred.
- **Variant-name parity** between Figma and code is the crux — define the matrix once (Phase 0) and use it for both.
- **Extraction is the biggest change**; the in-place-then-extract option lets us start Storybook/Code-Connect sooner against the current location.
- Tailwind-in-a-package: ship the preset + `tokens.css`; document consumer setup.

## What carries over

The hand-built Figma library (`12:2`) and the parity findings (`12`) become the Phase-3
starting point; the canonical tokens (`12`) are the Phase-0 input.
