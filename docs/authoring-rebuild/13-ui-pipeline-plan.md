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
| Where the base lives | **LOCKED — tokenize/refactor in place** (in `apps/vizij-authoring/src/components/ui`), and run Storybook + Code Connect against that location. **Extract to `packages/@vizij/ui` in a later phase** (1b). |
| Theming | Adopt the canonical **Vizij teal tokens** (`12`) as semantic CSS variables (`--color-accent` → teal), replacing legacy blue. Components stay theme-agnostic (reference vars). |
| Stack | Keep **Base UI + Tailwind v4 + `cn`**; centralize the Vizij token values in `styles.css` (later a `tokens.css` + preset when extracted). |
| Fonts | **Self-host Inter** now; wire Gilroy/Univia (brand) behind the same font tokens later. |
| Figma library | **LOCKED — publish the design file as a Semio Team Library, then Code Connect.** Needs library-publish rights + a Figma access token. |
| Visual regression | **Chromatic** optional (hosts Storybook + diffs PRs) — decide in Phase 5. |

## Phase 1 — Refactor base components in place

- Work in `apps/vizij-authoring/src/components/ui/*` (no package move yet).
- Centralize the **Vizij token values** in `styles.css` (teal `--color-accent`, radius 8, type scale); replace legacy blue. **Self-host Inter** (drop the CDN reliance).
- Standardize the API per component: consistent `variant`/`size`/`tone` props, `forwardRef`, controlled/uncontrolled, `className` passthrough, ARIA. Lock the **variant matrix** — the single contract that Storybook stories and Figma variants both mirror.
- Decouple from app state where primitives reach into stores (keep them pure/presentational).
- Keep/extend the existing tests (`NumberField`, `sliderDefaultBehavior`); run lint/typecheck/test.
- **Deliverable:** refactored, tokenized primitives in place + a locked variant matrix doc.

## Phase 1b (later) — Extract to `packages/@vizij/ui`

- Once stable: scaffold the package (tsup esm/cjs/dts, `external: react,react-dom,@base-ui/react`, exports map, peerDeps), ship `tokens.css` + Tailwind preset, move the primitives in, re-point `vizij-authoring` imports, migrate tests. Storybook + Code Connect re-target the package. Deferred to reduce upfront churn.

## Phase 2 — Storybook

- Add **Storybook 8 (`@storybook/react-vite`)** in `vizij-authoring`, scoped to `components/ui` (`storybook`, `build-storybook` scripts; re-targets `@vizij/ui` after Phase 1b). Addons: essentials, a11y, interactions, **addon-designs**.
- One `*.stories.tsx` per component: a story per variant/size/state + `argTypes` controls + `autodocs`. Story IDs mirror component + variant names (so they line up with Figma variants).
- **Deliverable:** local Storybook with every component + states browsable.

## Phase 3 — Figma components + Code Connect  ✅ authored (publish gated on token)

- Finalize the Figma component sets (library page `12:2`) to the canonical tokens; ensure **variant property names/values match the code props** (e.g. Button `variant=Primary…`). This is what makes Code Connect clean.
- Add **`@figma/code-connect`**: `figma.config.json`, a `*.figma.tsx` per component mapping `figma.connect(Component, '<node-url>', { props, example })` — props map Figma variants → component props.
- `npx figma connect publish` (needs a Figma token) → code snippets appear in **Figma Dev Mode** on each component.
- **Deliverable:** every Figma component shows its real `@vizij/ui` usage in Dev Mode.

**Status (done):**
- `@figma/code-connect@^1.4.8` added; [`figma.config.json`](../../apps/vizij-authoring/figma.config.json) includes `src/components/ui/**/*.figma.tsx`.
- **22 `*.figma.tsx` mappings** co-located with the components, one per Figma node on page `12:2`:
  - Variant/state enums mapped: Button (`variant`), Badge (`tone`), Chip (`tone`), Switch (`state`→`checked`), Checkbox (`state`→`checked`).
  - Usage examples (no variant prop): Input, Select, Combobox, TextArea, NumberField, Slider, PanelSearch, Card, Panel, Modal, Tooltip, ListRow, TreeRow, CollapsibleRow, FieldRow, Logo, Tabs.
  - Shared-node notes: StudioPanel→Panel, CollapsibleGroup→CollapsibleRow, RowSlider→Slider. Out of base set: MenuBar, ThemeToggle, EmptyState (no Figma node).
- `pnpm figma:parse` → all 22 parse, exit 0, no warnings. `figma connect publish --dry-run` validates all 22 nodes.
- Scripts: `figma:parse`, `figma:publish`, `figma:unpublish`.

**Remaining (the user's gated step):** publishing writes code snippets into the shared Semio Figma file (visible to the whole team in Dev Mode), and needs a Figma access token. Run from `apps/vizij-authoring`:

```bash
FIGMA_ACCESS_TOKEN=<token> pnpm figma:publish
```

(Token: Figma → Settings → Security → personal access tokens, with the **Code Connect** scope set to Write. **Note:** Code Connect requires a Figma **Organization/Enterprise** plan — on Professional the scope doesn't appear and publish is rejected. The mappings are ready to publish the moment the plan supports it.)

**Figma-side polish (done):** Chip extended to all 6 tones (Default·Info·Success·Warning·Danger·Muted, matching the code enum); the Tab set gained a `variant` property (Default·Pill·Underline) × `state`, and `Tabs.figma.tsx` now maps `variant`. Every component on `12:2` carries a description stamping its code path + Storybook title (interim round-trip + code-origin until Storybook is hosted and Code Connect is published). Remaining reverse-link upgrade: swap those descriptions for clickable hosted-Storybook URLs once Storybook is deployed (Phase 5).

## Phase 4 — Integrate Figma ↔ Storybook (the side-by-side)  ✅ done (Storybook→Figma)

- In each story, set `parameters.design = { type: 'figma', url: '<figma node url>' }` → **addon-designs renders the Figma frame in a "Design" tab** beside the live story.
- (Reverse) add the Storybook story URL as a link on the Figma component for round-trip.
- **Deliverable:** per component, live story and Figma design reviewable together; Dev Mode shows the code.

**Status (done):** every story's `parameters.design.url` now points at its **exact component node** (same ids as the `.figma.tsx` files), not the library overview. Shared nodes: Slider/RowSlider→`19-60`, Panel/StudioPanel→`20-7`, CollapsibleRow/CollapsibleGroup→`20-44`. MenuBar/ThemeToggle/EmptyState keep `12-2` (no own node). Verified against the running preview store (Button→`12-16`, Slider→`19-60`, Panel→`20-7`). **Reverse link (Storybook URL on the Figma component) still TODO** — best added during the Figma-side polish pass.

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
