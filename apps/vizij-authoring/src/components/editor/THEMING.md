# Theming `editor/` components

Every `editor/` component styles itself from `--editor-*` custom properties. Each
falls back to a vizij-authoring token, so inside this app the layer needs no
configuration at all:

```css
color: var(--editor-label-fg, var(--text-secondary));
```

A consuming application overrides the `--editor-*` set at its root and needs to
know nothing about vizij's own token names.

## Adopting this layer in another application

Define the tokens you care about once. Anything you leave out keeps its fallback,
so a partial override is valid — start with surfaces and accent, and refine later.

```css
:root {
  --editor-row-bg: #101014;
  --editor-row-bg-hover: #17171d;
  --editor-accent: #7c5cff;
  --editor-label-fg: #9aa0aa;
}
```

Because these are custom properties rather than utility classes, an override cannot
lose a specificity fight — which is the failure mode that made `@semio/ui`'s
`text-white` beat this app's `text-text-primary` on every `Button` and render white
text on white surfaces in light mode.

## Token reference

Add a row here whenever you introduce a token. An undocumented token is invisible
to a consumer and will be read as a bug.

### Surfaces

| Token                          | Fallback                  | Used for                                      |
| ------------------------------ | ------------------------- | --------------------------------------------- |
| `--editor-row-bg`              | `--bg-hover`              | Row and list-item resting surface             |
| `--editor-row-bg-hover`        | `--bg-active`             | Row hover                                     |
| `--editor-row-bg-selected`     | `--color-accent-subtle`   | Selected row                                  |
| `--editor-panel-bg`            | `--bg-panel`              | Panel and section surface                     |
| `--editor-section-bg`          | `--bg-secondary`          | Nested section surface                        |
| `--editor-input-bg`            | `--bg-input`              | Text/number input surface (`MergeValueField`) |
| `--editor-row-expanded-bg`     | `rgb(0 0 0 / 0.2)`        | `PropertyRow`'s expanded sub-panel surface    |
| `--editor-row-expanded-border` | `rgb(255 255 255 / 0.05)` | The hairline above that sub-panel             |

### Text

| Token               | Fallback           | Used for                                            |
| ------------------- | ------------------ | --------------------------------------------------- |
| `--editor-label-fg` | `--text-secondary` | Property and field labels                           |
| `--editor-value-fg` | `--text-primary`   | Editable values                                     |
| `--editor-muted-fg` | `--text-muted`     | Hints, counts, secondary metadata                   |
| `--editor-panel-fg` | `--text-primary`   | Panel body text and panel titles (`WorkbenchPanel`) |

### Lines and accent

| Token                     | Fallback            | Used for                                      |
| ------------------------- | ------------------- | --------------------------------------------- |
| `--editor-border`         | `--border-default`  | Dividers, outlines, section rules             |
| `--editor-border-strong`  | `--border-hover`    | Hover and focus borders                       |
| `--editor-accent`         | `--color-accent`    | Selection, active state, scrub feedback       |
| `--editor-accent-fg`      | `--color-accent-fg` | Text on an accent surface                     |
| `--editor-control-accent` | `#67e8f9` (literal) | Glyph marking a row as a live numeric control |

`--editor-row-expanded-bg` and `--editor-row-expanded-border` also carry **literal**
fallbacks. They were `bg-black/20` and `border-white/5` hardcoded in `PropertyRow`,
and neither maps onto an app token: they are a darkening overlay and a lightening
hairline, not a surface and a border colour. The literals preserve the exact
appearance. Note both assume a dark canvas — a light-themed consumer should
override them, and that is the clearest example in the layer of a token whose
default is theme-dependent.

`--editor-control-accent` is the one _colour_ token with a **literal** fallback rather
than an app token. It was `text-cyan-300` hardcoded in `ControlRow`, and there is no
app token for it — inventing one for a single use would have been worse. The
literal preserves the exact colour; override it to match your own palette.

### Status

| Token               | Fallback          | Used for                                          |
| ------------------- | ----------------- | ------------------------------------------------- |
| `--editor-locked`   | `--color-warning` | Locked / driven-elsewhere state                   |
| `--editor-unlocked` | `--color-accent`  | Unlocked / editable state — the partner to locked |
| `--editor-danger`   | `--color-danger`  | Destructive affordances                           |

`--editor-locked` and `--editor-unlocked` are a **pair**, and overriding one
without the other is the main way to make lock state unreadable: they are the
only thing distinguishing the two states of `ChannelLockButton` beyond the icon.
Keep them clearly different in hue, not just in lightness.

Hover tints are derived from whichever of the two is showing
(`color-mix(… 20%, transparent)`) rather than being tokens of their own, so there
is nothing extra to override.

`--editor-locked` also colours `ControlRow`'s "driven from elsewhere" note, which
used to be a hardcoded `text-amber-300`. Lock state now reads as one colour across
the layer rather than two near-identical ambers.

### Metrics

| Token                              | Fallback                 | Used for                                                                                                                           |
| ---------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `--editor-row-min-height`          | `32px`                   | Row hit target. Replaced `.inspector-row-hit-target`, now deleted.                                                                 |
| `--editor-numeric-width`           | `88px`                   | Numeric column: `flex-basis`, `width`, `min-width` (`max-width` stays `100%`). Replaced `.inspector-numeric-control`, now deleted. |
| `--editor-panel-gap`               | `0.75rem`                | Vertical rhythm between a panel's header and its body                                                                              |
| `--editor-panel-header-min-height` | `24px`                   | Panel header height floor, so a header with no actions still reserves its row                                                      |
| `--editor-col-label`               | `72px`                   | `PropertyGrid`'s label column                                                                                                      |
| `--editor-col-value`               | `--editor-numeric-width` | `PropertyGrid`'s value column                                                                                                      |

`--editor-row-min-height` and `--editor-numeric-width` matter for portability:
both **were** app-global classes in `styles.css`, so any component depending on
them silently lost its sizing outside this app. Those classes are now deleted and
the tokens are read directly by `ui/RowSlider`, `ui/CollapsibleRow`,
`inspector/InspectorContent` and `inspector/InspectorPanel` — so these two tokens
are the first whose consumers are **not** in `editor/`. The contract is wider than
this file's title suggests.

Two gotchas found while making the switch. The old `.inspector-numeric-control` was
declared **unlayered**, so it beat every Tailwind utility regardless of
specificity — five call sites carried `w-[72px]`/`w-[84px]`/`w-[88px]` that were
never in effect, and those columns have always rendered at 88px. And
`RowSlider`'s numeric wrapper carries `transition-all`, so overriding
`--editor-numeric-width` animates rather than snapping; a test asserting the
override has to wait for the transition.

`--editor-col-value` **chains off `--editor-numeric-width`** rather than carrying a
number of its own, so a grid value cell and a flex numeric cell are the same width
by construction. Override `--editor-numeric-width` to move both together — usually
what you want; `--editor-col-value` exists to decouple them when it isn't.

`--editor-col-label` and `--editor-col-value` are what make **two separate
`PropertyGrid`s line up with each other**. Setting them once at a panel root
re-proportions every property row underneath it, which eleven inline
`grid-cols-[…]` templates made impossible. Set them on a common ancestor, not on
individual grids — two grids with different values will not align, which is the
whole failure mode being fixed.

## Deliberate non-tokens

`WorkbenchPanel` paints **no background**. A workbench panel is transparent over
whatever surface its dock provides, which is why it does not read
`--editor-panel-bg` — setting that token will not give these panels a surface.
Style the dock, not the panel.

Note also that **every `ui/Button` variant emits its text colour with Tailwind's
important modifier** (`text-text-secondary!` and friends), which beats an
`--editor-*` colour class at equal specificity. So an `editor/` component that
tries to style a `ui/Button`'s text from a token will find the token inert _inside
this app_ — though it still applies in a consuming app bringing its own button.

The `!` is not gratuitous: `@semio/ui`'s Button emits `text-white dark:text-black`
as plain utilities, and without the important modifier that wins and renders every
button white-on-white in light mode. It is a `ui/Button` constraint, not a
theming-contract one. Style button _surfaces_ from tokens and leave their text
colour to the variant.
