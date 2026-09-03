# `editor/` — functional components for editor applications

Reusable interaction patterns for **editor-shaped applications** — animation tools,
node editors, scene composers, level editors. Anything with an inspector, a
property row, a lockable channel, a scrubbable value.

This layer exists to be **consumed by applications other than vizij-authoring**,
so everything here is written to be portable and themeable. Nothing in it may
reach into this app.

## The three layers

| Layer          | Directory                          | Answers                          | Example                            |
| -------------- | ---------------------------------- | -------------------------------- | ---------------------------------- |
| Primitive      | `components/ui/`                   | _What does a control look like?_ | `Button`, `Input`, `Select`        |
| **Functional** | **`components/editor/`**           | _How does editing behave?_       | `PropertyRow`, `ChannelLockButton` |
| Feature        | `components/{inspector,panels,…}/` | _What does THIS app edit?_       | `RiggingMaterialSection`           |

`ui/` is presentation with no domain opinion. `editor/` is interaction pattern with
no _app_ opinion — it knows what a "property with a lock and a scrubbable value"
is, but nothing about rigs, poses or faces. Feature components bind `editor/`
components to this app's data.

### Atoms and molecules

- **`editor/atoms/`** — one job, no composition. A lock toggle. A drag-to-scrub
  surface. A value label that can be renamed in place.
- **`editor/molecules/`** — atoms plus `ui/` primitives arranged into a recognisable
  editor pattern. A property row. An inspector section. A workbench panel scaffold.

If a component needs two atoms and a primitive, it is a molecule. If it would need
a store, a route, or knowledge of a domain object, it is a feature component and
does not belong here.

## Rules

1. **No app imports.** Nothing from `src/state/`, `src/scene/`, `src/poseRig/`,
   `src/rig/`, or any feature directory. If a component needs data, it takes props.
   No zustand, no context owned by this app.
2. **No app-global CSS.** `.asset-card__*` and `.custom-scrollbar` are defined in
   this app's `styles.css` and will not exist in a consuming app. Anything needed must be inlined here or
   exposed as a prop.
3. **Tokens only — never hardcoded colour.** No `zinc-*`, `slate-*`, `blue-500`,
   `bg-white/5`. Those are the reason several components in this codebase were
   invisible in light mode.
4. **Every component takes `className`,** and exposes slot classNames wherever a
   consumer would plausibly need to restyle an internal part.
5. **Controlled by default.** No hidden state a host app cannot observe.

## Theming

Components read `--editor-*` custom properties, each falling back to this app's
existing semantic token so there is **zero configuration cost here** and a clean
override point elsewhere:

```css
background-color: var(--editor-row-bg, var(--bg-hover));
```

A consuming application rebrands by defining the `--editor-*` set once at its root.
It never needs to know this app's `--bg-*` names, and never has to fight utility
specificity — which is exactly the trap that made `@semio/ui`'s `text-white`
override the app's own colours on `Button`.

The contract is documented in `THEMING.md` and each token is listed with its
fallback. When adding a component, add any new token it introduces to that file —
an undocumented token is invisible to a consumer and will look like a bug.

## Stories

Colocated (`PropertyRow.stories.tsx` beside `PropertyRow.tsx`) so they travel with
the code on extraction, and grouped under `Editor/` in the Storybook sidebar to keep
them distinct from `UI/`. Every component should have a story that exercises it
under a **non-default theme**, since portability is the whole point of this layer
and a token that is never overridden in a story is a token nobody has tested.
