# `@semio/ui` upstream asks

Every workaround in this app that exists because of an `@semio/ui` limitation,
with the issue tracking it. Filed against
[Semio UI Feedback from Vizij](https://linear.app/semio-ai/project/semio-ui-feedback-from-vizij-547ba2136692/overview).

Keep this table current. The point is that a workaround here should never
outlive the reason for it — when an issue closes, the corresponding hack should
be deleted, and without this record nothing connects the two.

| Issue                                                      | Concern                                                                   | What we pay for it here                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [STUDIO-114](https://linear.app/semio-ai/issue/STUDIO-114) | `Button` overwrites a caller's `aria-label` with `undefined`              | `ui/Button.tsx` maps `aria-label` → semio's `altText`. 9 modal e2e assertions depend on it.                                                                                                                                 |
| [STUDIO-115](https://linear.app/semio-ai/issue/STUDIO-115) | `Button variant=primary` is 2.71:1 in light mode                          | Every variant re-declares its own text colour.                                                                                                                                                                              |
| [STUDIO-116](https://linear.app/semio-ai/issue/STUDIO-116) | `clsx` composition means `className` cannot override library utilities    | Tailwind's `!` on **every** text colour in `ui/Button.tsx`. Also makes `--editor-*` colour tokens inert on buttons — documented in [THEMING.md](../../src/components/editor/THEMING.md).                                    |
| [STUDIO-117](https://linear.app/semio-ai/issue/STUDIO-117) | `NumberField` hardcodes 2 decimals though `useNumeric` supports `sigFigs` | A **custom** `ui/NumberField.tsx` on semio's `TextField` — formatting, parsing, clamping, stepping, scrubbing. ~200 lines.                                                                                                  |
| [STUDIO-118](https://linear.app/semio-ai/issue/STUDIO-118) | `Chip`: 3.46:1 label, dead `dark:text-red/75`, `children: string`         | Our own `ui/Chip.tsx`.                                                                                                                                                                                                      |
| [STUDIO-119](https://linear.app/semio-ai/issue/STUDIO-119) | Overlays have no `z-index`                                                | Portal target wrapped in a `z-[4100]` container, above our 3800/3900/4000 menubar ladder.                                                                                                                                   |
| [STUDIO-120](https://linear.app/semio-ai/issue/STUDIO-120) | `Tabs`: no `testId`, `title` is `string`                                  | `ui/Tabs.tsx` built on `radix-ui` instead.                                                                                                                                                                                  |
| [STUDIO-121](https://linear.app/semio-ai/issue/STUDIO-121) | `Checkbox`: no `className`, fragile glyph sizing, no cursor               | Descendant selectors on `[role=checkbox]` from our wrapper — coupled to semio's internal DOM.                                                                                                                               |
| [STUDIO-122](https://linear.app/semio-ai/issue/STUDIO-122) | `Modal`: no `maxWidth`, close button has no accessible name               | `ui/Modal.tsx` re-adds the close button and a width map.                                                                                                                                                                    |
| [STUDIO-123](https://linear.app/semio-ai/issue/STUDIO-123) | Tarball ships no `src/`, so `dist/styles.css` and `exports.source` dangle | We import `@semio/ui/styles.css` (the precompiled sheet) from `main.tsx`, never `dist/styles.css`.                                                                                                                          |
| [STUDIO-124](https://linear.app/semio-ai/issue/STUDIO-124) | No standalone `Slider`; no virtualization in list/tree primitives         | `ui/Slider.tsx` + `ui/RowSlider.tsx` on radix; tree built from our own primitives. **Virtualization half addressed by [PR #284](https://github.com/semio-ai/semio_studio/pull/284) — but it will not reach us; see below.** |

## STUDIO-124 is a special case

PR #284 windows `ListGrid`/`TreeGrid` and exports `useRowWindow` **specifically so we
could use it** — it quotes our issue. It still will not reach us, for two reasons
worth recording so nobody re-opens this expecting a win:

1. **Our issue misled it.** We wrote that we use "the à-la-carte tree primitives",
   which reads as _semio's_. Ours are entirely our own — `ui/TreeRow.tsx` imports
   React and `cn`, and the app has zero references to `TreeNavRoot`, `TreeNavItem`,
   `TreeGrid`, `ListGrid` or `TableList`. The upside: #284's breaking change
   (`total`/`index` on the roving-focus adapter) does not affect us either.
2. **`useRowWindow` assumes uniform, single-line rows** and says so in its docblock.
   Ours are neither: `ControlRow` measures 49px read-only, 58px default and 77px
   locked — one component, three heights — and `TreeRowWrapper` mixes those cards
   with single-line rows in the same tree. Windowing keyed on one height would put
   the spacers out of step.

What we would need is a measured, variable-height virtualizer, which #284 explicitly
and reasonably declines. So the likely outcome is that we keep our own tree and this
half closes as not-applicable. The half that _does_ help is the one we asked for
second and valued more: the limitation is now documented, so the next consumer will
not reach for `TreeGrid` at scale and find out in production.

The **standalone `Slider` / `role="slider"`** ask is unrelated and still open; we have
asked for it to be split into its own issue.

## Upgrade gate

`@semio/ui` is pinned **exactly** (`"@semio/ui": "0.1.4"`), and it should stay
that way.

The variant strategy rests on an undocumented internal: semio's `sized-*` and
`variant-*` classes live in `@layer components`, so our call-site utilities win
against them. Nothing guarantees that across releases, and STUDIO-116 means a
change there would silently invert text colours app-wide rather than fail loudly.

Before bumping:

```bash
pnpm --filter vizij-authoring test:e2e:visual
```

12 tests, 6 surfaces × light/dark. It is the only thing that checks colour —
no unit test asserts it.
