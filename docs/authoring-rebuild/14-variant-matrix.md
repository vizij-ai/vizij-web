# Vizij UI — Variant Matrix (the contract)

> The single source of truth that **code props**, **Storybook stories**, and **Figma
> variants** all mirror (Phase 0/1 of `13`). Grounded in `apps/vizij-authoring/src/components/ui/*`.
> Props use these exact names so Code Connect maps cleanly.

## Tokens (locked — `styles.css`)

- **Accent:** teal — light `#2aa499` (fg `#fff`, hover `#1f8d82`), dark `#48e2ce` (fg `#04342c`). Replaces legacy blue.
- **Radius:** controls `rounded-md` (target 8), cards `rounded-xl` (12).
- **Font:** `--font-sans: "Questrial", …` (Questrial = brand free font; single weight — hierarchy via size + color, not weight). Headings → Gilroy, body → Univia later.
- **Neutrals/semantic:** unchanged zinc scale + `--color-warning/danger/success`.

## Component contract

| Component | Variant/prop | Values | Sizes | States |
| --- | --- | --- | --- | --- |
| **Button** | `variant` | primary · secondary · subtle · danger · ghost | `size` sm · md · lg · icon; `pill` bool | hover · active · disabled · focus |
| **Switch** | — | — | `size` sm · md | checked · unchecked · disabled |
| **Checkbox** | — | — | md | checked · unchecked · indeterminate · disabled |
| **Badge** | `tone` | accent · info · muted | — | — |
| **Chip** | `tone` | default · info · success · warning · danger · muted | — | `dismissable` bool |
| **Tabs** | `variant` | default · pill · underline | `size` sm | selected · default; optional count/badge |
| **Input** | — | — | md | default · focus · disabled · error |
| **TextArea** | — | — | — | default · focus · disabled |
| **NumberField** | — | — | — | default · focus · disabled (steppers) |
| **Select** | — | — | md | closed · open · disabled |
| **Combobox** | — | — | md | closed · open · searching |
| **RowSlider/Slider** | — | — | — | default · dragging · disabled |
| **Card** | — | — | — | — |
| **Panel / StudioPanel** | — | — | — | header + content |
| **Modal** | — | — | — | open (overlay + actions) |
| **Tooltip** | — | — | — | top/bottom pointer |
| **ListRow** | — | — | — | default · selected · hover |
| **TreeRow** | — | — | — | collapsed · expanded · selected (depth) |
| **CollapsibleGroup/Row** | — | — | — | collapsed · expanded (count) |
| **FieldRow** | — | label + control | — | — |
| **Combobox/PanelSearch** | — | — | — | empty · query |
| **Logo** | — | mark + wordmark | — | — |

## Standardization rules (Phase 1)

- Every component: `forwardRef`, `className` passthrough, controlled/uncontrolled where stateful, full ARIA (roles, `aria-*`, focus-visible ring on accent).
- No hardcoded colors — only semantic tokens (`--color-accent`, `--text-*`, `--bg-*`, `--border-*`).
- Presentational only — no app store imports in the primitives.
- Variant **names must match Figma variant property values** (e.g. Figma `variant=Primary` ↔ code `variant="primary"`).
- MenuBar is **out** of the base set (dropping the menu-bar pattern, `10`); CollapsibleGroup ≈ CollapsibleRow.
