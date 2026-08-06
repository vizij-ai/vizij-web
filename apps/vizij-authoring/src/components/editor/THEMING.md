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

| Token                      | Fallback                | Used for                          |
| -------------------------- | ----------------------- | --------------------------------- |
| `--editor-row-bg`          | `--bg-hover`            | Row and list-item resting surface |
| `--editor-row-bg-hover`    | `--bg-active`           | Row hover                         |
| `--editor-row-bg-selected` | `--color-accent-subtle` | Selected row                      |
| `--editor-panel-bg`        | `--bg-panel`            | Panel and section surface         |
| `--editor-section-bg`      | `--bg-secondary`        | Nested section surface            |

### Text

| Token               | Fallback           | Used for                                            |
| ------------------- | ------------------ | --------------------------------------------------- |
| `--editor-label-fg` | `--text-secondary` | Property and field labels                           |
| `--editor-value-fg` | `--text-primary`   | Editable values                                     |
| `--editor-muted-fg` | `--text-muted`     | Hints, counts, secondary metadata                   |
| `--editor-panel-fg` | `--text-primary`   | Panel body text and panel titles (`WorkbenchPanel`) |

### Lines and accent

| Token                    | Fallback            | Used for                                |
| ------------------------ | ------------------- | --------------------------------------- |
| `--editor-border`        | `--border-default`  | Dividers, outlines, section rules       |
| `--editor-border-strong` | `--border-hover`    | Hover and focus borders                 |
| `--editor-accent`        | `--color-accent`    | Selection, active state, scrub feedback |
| `--editor-accent-fg`     | `--color-accent-fg` | Text on an accent surface               |

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

### Metrics

| Token                              | Fallback  | Used for                                                                                          |
| ---------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `--editor-row-min-height`          | `32px`    | Row hit target. Replaces this app's `.inspector-row-hit-target`, which does not exist outside it. |
| `--editor-numeric-width`           | `88px`    | Numeric control column. Replaces `.inspector-numeric-control`.                                    |
| `--editor-panel-gap`               | `0.75rem` | Vertical rhythm between a panel's header and its body                                             |
| `--editor-panel-header-min-height` | `24px`    | Panel header height floor, so a header with no actions still reserves its row                     |

`--editor-row-min-height` and `--editor-numeric-width` matter for portability:
both were app-global classes, so any component depending on them silently lost
its sizing outside this app. As tokens they travel with the component and stay
overridable.

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
