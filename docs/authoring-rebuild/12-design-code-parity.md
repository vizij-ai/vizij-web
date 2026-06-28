# Authoring Rebuild — Design ↔ Implementation Parity (round 1)

> Method: built a standalone **HTML** render of the Vizij UI library (a proxy for the real
> `components/ui` implementation), screenshotted it, and compared 1:1 against the **Figma**
> component library (page `12:2`). This logs the differences across **HTML · Figma · code
> (`components/ui`)** and the reconciliation. Goal: one consistent spec.

## Differences found

| # | Item | HTML (built) | Figma | Code (`components/ui`) | Canonical → action |
| --- | --- | --- | --- | --- | --- |
| 1 | **Font** | rendered **Arial** (Inter failed to load — Google Fonts blocked in preview) | Inter | Inter (Tailwind) | **Self-host Inter**; brand target Gilroy/Univia. Never rely on CDN. *(code/build)* |
| 2 | **Badge / Chip border** | was borderless → **added 1px** | borderless | has border (`border-accent/50`, etc.) | All get a subtle 1px border. ✅ HTML done · Figma now done · code already has it |
| 3 | **Tooltip pointer** | was missing → **added** | has pointer | has pointer | Pointer everywhere. ✅ done |
| 4 | **Button shrink** | could shrink (flex) → **`flex-shrink:0;nowrap`** | fixed 104w | hugs content | Hug content, never clip. ✅ HTML done · Figma should use auto-layout hug |
| 5 | **Accent color** | teal `#2AA499` | teal `#2AA499` | **blue `#2563eb`** (legacy) | **Teal** (Vizij rebrand). Swap the `--color-accent` token in code. *(code)* |
| 6 | **Control radius** | 8 | 8 | **6** (`rounded-md`) | Pick one — proposing **8**; update `Button`/inputs in code. *(decision → code)* |
| 7 | **Button width** | hug | fixed 104 | hug | Hug. Convert Figma Button to auto-layout. *(Figma)* |
| 8 | **Tab underline** | text-width | fixed 40px | full control width | Standardize to text-width underline. *(minor; Figma)* |

## What's consistent (verified)

Teal accent `#2AA499`, grey text `#333`, control height 36, switch 40×22, checkbox 18,
badge/chip sizes + uppercase, slider/track, modal layout, the 8-step type scale, and the
light-grey canvas all match across HTML and Figma.

## Canonical tokens (proposed)

- **Accent:** teal `#2AA499` (primary `#50C4B6`, dark `#2AA499`) — *replaces legacy blue.*
- **Text:** grey `#333333` · secondary `#52525b` · muted `#a1a1aa`.
- **Surfaces:** app `#fff` · panel `#fdfdfd` · border `#e4e4e7`.
- **Radius:** controls **8**, cards **12**.
- **Type:** Inter stand-in for Gilroy (headings) / Univia (body); scale = Display 22 / Heading 18 / Title 15 / Body 13 / Body-strong 13 / Label 11 / Caption 11 / Overline 10 (all the 8 Figma text styles).

## Status & backlog

- **Done now (HTML):** badge/chip borders, tooltip pointer, button no-shrink.
- **Done now (Figma):** badge/chip borders (this pass), to match HTML + code.
- **Backlog — code (`components/ui`):** swap accent token blue→teal (#5); align control radius to 8 (#6); self-host Inter / move toward Gilroy+Univia (#1). These are a real code PR (token-level, low risk — components reference CSS vars).
- **Backlog — Figma:** Button → auto-layout hug (#4/#7); tab underline width (#8).

> The HTML proxy lives in the session scratchpad (`index.html`, served on :8799). Re-run the
> compare after any token change to keep design ↔ code in lockstep.
