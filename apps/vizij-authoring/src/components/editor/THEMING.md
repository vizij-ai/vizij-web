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

| Token | Fallback | Used for |
|---|---|---|
| `--editor-row-bg` | `--bg-hover` | Row and list-item resting surface |
| `--editor-row-bg-hover` | `--bg-active` | Row hover |
| `--editor-row-bg-selected` | `--color-accent-subtle` | Selected row |
| `--editor-panel-bg` | `--bg-panel` | Panel and section surface |
| `--editor-section-bg` | `--bg-secondary` | Nested section surface |

### Text

| Token | Fallback | Used for |
|---|---|---|
| `--editor-label-fg` | `--text-secondary` | Property and field labels |
| `--editor-value-fg` | `--text-primary` | Editable values |
| `--editor-muted-fg` | `--text-muted` | Hints, counts, secondary metadata |

### Lines and accent

| Token | Fallback | Used for |
|---|---|---|
| `--editor-border` | `--border-default` | Dividers, outlines, section rules |
| `--editor-border-strong` | `--border-hover` | Hover and focus borders |
| `--editor-accent` | `--color-accent` | Selection, active state, scrub feedback |
| `--editor-accent-fg` | `--color-accent-fg` | Text on an accent surface |

### Status

| Token | Fallback | Used for |
|---|---|---|
| `--editor-locked` | `--color-warning` | Locked / driven-elsewhere state |
| `--editor-danger` | `--color-danger` | Destructive affordances |

### Metrics

| Token | Fallback | Used for |
|---|---|---|
| `--editor-row-min-height` | `32px` | Row hit target. Replaces this app's `.inspector-row-hit-target`, which does not exist outside it. |
| `--editor-numeric-width` | `88px` | Numeric control column. Replaces `.inspector-numeric-control`. |

Those last two matter for portability: both were app-global classes, so any
component depending on them silently lost its sizing outside this app. As tokens
they travel with the component and stay overridable.
