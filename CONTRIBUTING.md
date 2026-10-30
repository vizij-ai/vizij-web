# Contributing to vizij-web

How to work in this repository: set it up, run and check it, land a change,
release it. How the pieces fit together is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Setup

### Node and pnpm

- **Node 24**, the version in [`.nvmrc`](./.nvmrc) and CI.
- **pnpm 12.16.1**, the `packageManager` in [`package.json`](./package.json);
  `corepack enable` provides it. Use pnpm for everything: the workspace links
  its packages with `workspace:` ranges, which npm does not resolve.

```bash
pnpm install
```

Run `pnpm install` again after editing any `package.json`, so the workspace
links follow.

### Git hooks

```bash
bash scripts/install-git-hooks.sh   # sets core.hooksPath to .githooks
./scripts/doctor.sh                 # checks it
```

- **pre-commit** runs `lint-staged`: ESLint and Prettier on staged code,
  markdownlint and Prettier on staged Markdown.
- **pre-push** runs `pnpm run validate` against the branch's upstream, or
  against `PNPM_BASE_REF` when set. `HOOK_RUN_WEB_BUILD=1` adds
  `pnpm run build`.

Don't bypass them (`--no-verify`, `-n`, `SKIP_GIT_HOOKS=1`). A hook that fails
on code you did not touch points at stale state, such as an outdated package
build or a stale wasm link (below), and that state is what to fix.

### A local vizij-rs checkout

The wasm packages (`@vizij/runtime`, `@vizij/node-graph`, `@vizij/value-json`)
come from npm. To run vizij-web against a vizij-rs checkout instead:

```bash
pnpm run wasm:status                          # each package: local, registry or missing
pnpm run wasm:link -- --pkgs runtime          # or "runtime node-graph", or all (the default)
pnpm run wasm:unlink -- --pkgs all
```

- `wasm:link` replaces `node_modules/@vizij/<pkg>`, at the root and in every
  workspace, with a symlink to `<vizij-rs>/npm/@vizij/<pkg>`. It warns when a
  manifest or the lockfile changed; discard those changes, never commit them.
- The vizij-rs checkout is `../vizij-rs`, next to this one, by default. From
  a worktree or any other layout, set `VIZIJ_RS_PATH=<path>` (or pass
  `--vizij-rs <path>`).
- `pnpm install` resets the nested symlinks; the postinstall step
  (`wasm-links relink`) restores the links of every package whose root link
  already points at the checkout. It reads the same `VIZIJ_RS_PATH`, and does
  nothing when no checkout is there.
- Restart the dev servers after linking or unlinking. `pnpm run rebuild-nodes`
  relinks every package and clears the Vite caches in one step.

**A linked package is whatever that checkout last built.** The packages
resolve their `dist/`, so a Rust change reaches this repo only once vizij-rs
rebuilt both halves; for `@vizij/runtime`:

```bash
# in vizij-rs
pnpm run build:wasm:runtime                   # wasm-pack into npm/@vizij/runtime/pkg
pnpm --filter @vizij/runtime run build        # TypeScript, and the wasm copied into dist/
```

`wasm:status` reports `local` whatever branch or build the checkout holds, so
check what it built before trusting a result. Keep the checkout at a version
the range in `package.json` accepts: a wasm module and JS glue from different
versions fail at init. A change that needs an unpublished vizij-rs version
lands once that version is on npm, since CI installs from the lockfile.

## Running the apps

```bash
pnpm run build:packages            # apps import the packages' dist/
pnpm run dev:vizij-authoring       # or dev:<app>, or pnpm --filter <name> dev
```

Rebuild a package after changing it (`pnpm run build:packages`, or
`pnpm --filter "@vizij/<name>" build`) before checking an app on it.
`tutorial-fullscreen-face`'s package name is `fullscreen-face`.

## Checks

| Command                             | What it runs                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run validate`                 | markdownlint over every Markdown file, then lint, typecheck and test of the workspaces changed since the base and of their dependents (`scripts/run-affected.sh`). |
| `pnpm run validate:all`             | the same over every workspace                                                                                                                                      |
| `pnpm run format` / `format:check`  | markdownlint and Prettier, fixing or checking                                                                                                                      |
| `pnpm run prep` / `prep:push`       | format then `validate`; or format, clean, build and `validate:all`                                                                                                 |
| `pnpm run typecheck:all`            | every workspace's typecheck, without stopping at the first failure                                                                                                 |
| `pnpm exec markdownlint <files>`    | the Markdown check on the files given                                                                                                                              |
| `pnpm run adaptations:check`        | every face GLB's standard adaptation against the sidecar beside it; part of `lint` and `lint:all`                                                                  |
| `pnpm run adaptations:pack [<glb>]` | each face's adaptation sidecar grafted into its GLB                                                                                                                |

The base of `validate` is the branch's upstream, else `origin/main`. On a
branch whose pull request targets the staging branch, set
`PNPM_BASE_REF=origin/<staging>` so it compares against staging, not
`main`; the pre-push hook reads the same variable.

CI runs on every pull request: `ci.yml` checks formatting, `lint:all`,
`typecheck:all`, `test:all` and `build`, runs the workspace e2e suite and the
authoring smoke suite. When the change touches the authoring app or a package
it uses, `e2e.yml` also runs the authoring suite's smoke and workflow
projects, and `preview-authoring.yml` deploys a preview.

### End-to-end tests

Two Playwright suites, each starting the servers it tests. Both need
`pnpm run build:packages` first.

| Suite                                                              | Command                                                                     | Serves on                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Authoring ([`apps/vizij-authoring/e2e`](apps/vizij-authoring/e2e)) | `pnpm --filter vizij-authoring test:e2e:smoke` (`test:e2e` adds `workflow`) | `4175`, a preview of a fresh build; `4176`, a dev server, with `VIZIJ_E2E_SERVER_MODE=dev`                          |
| Workspace and demos ([`e2e/`](e2e))                                | `pnpm run e2e` (`e2e:heavy` adds the journeys)                              | `5199` for authoring, then one port per demo in [`e2e/standalone-demos.ts`](e2e/standalone-demos.ts), `5200`–`5206` |

Two variables keep a run on servers it started itself:

- **`VIZIJ_E2E_PORT_OFFSET`** (default `0`) is added to every port above.
  Checkouts that run e2e at the same time each need their own offset; give each
  worktree a multiple of 100, which keeps every port of one checkout clear of
  every port of another:

  ```bash
  # in one worktree
  pnpm --filter vizij-authoring test:e2e:smoke
  # in another, at the same time
  VIZIJ_E2E_PORT_OFFSET=100 pnpm --filter vizij-authoring test:e2e:smoke
  ```

  Specs reach their servers through the configs' `baseURL` and
  `e2e/standalone-demos.ts`, which apply the offset. A new server or a spec
  that builds a URL takes its port from those, never from a literal, or it
  stops following the offset.

- **`VIZIJ_E2E_REUSE_SERVER=1`** lets a run test a server that already answers
  on its port instead of starting one. Without it, a port already in use fails
  the run (`http://127.0.0.1:4175 is already used`), because the server holding
  it may belong to another checkout and serve another build. Set it only for a
  server you started from the same checkout, such as a dev server you are
  iterating against.

## Branches and pull requests

### The staging branch

`main` is what deploys and publishes. A change too large to land green in one
step, such as a migration, goes through a staging branch: one pull request per
step into it, then one pull request from it to `main`. Keep it up to date with
`main`.

- **Each pull request is green on its own, and staging stays green.** An app
  whose port has not landed yet keeps the published npm versions of the
  packages being rewritten instead of `workspace:*` (pnpm lets both coexist);
  its own pull request switches it back. Each step can then be verified on its
  own, and a failure points at the step that caused it.
- **A stack is declared on GitHub**, with the `gh stack` extension
  (`github/gh-stack`), bottom first:

  ```bash
  gh stack link --base <staging> <bottom> <next> <top>
  ```

  Always pass `--base`: without it the bottom pull request targets `main`. A
  single pull request takes `gh pr create --base <staging>`. Check
  the base once it is created.

- **Merging the top of a stack lands every pull request below it.** Afterwards,
  `git cherry origin/<staging> origin/<branch>` marks with `+` the
  commits of a lower branch that are not in yet (it compares patches, so it
  sees through a rebase-merge's new hashes); close the lower pull requests that
  landed, with a note saying where.
- **Merged branches are not deleted here**, so GitHub does not retarget a pull
  request whose base is another pull request's branch: merging it lands it on
  that dead branch. Outside a native stack, retarget it
  (`gh pr edit N --base <base>`) and rebase it as soon as the lower one merges.
  Inside a native stack GitHub retargets it, but refuses `gh pr edit --base`
  and `gh pr merge` on its members; merge the bottom one through the
  merge-async API, then rebase the next branch onto its new base and push it
  with `--force-with-lease`:

  ```bash
  gh api -X PUT repos/vizij-ai/vizij-web/pulls/N/merge-async \
    -f merge_method=rebase -f merge_action=direct_merge -f sha=<head>
  # poll GET repos/vizij-ai/vizij-web/pulls/N/merge-async/<id> until merged
  git rebase --onto origin/<base> <old lower head>
  ```

  After any merge, check that the commit reached the branch you meant:
  `git merge-base --is-ancestor <commit> origin/<base>`.

### Opening and reviewing

- **A finished pull request is ready, not draft**: draft reads as "not ready
  for review". Draft is for work with a known gap.
- **The body opens with an Intent paragraph**: what the change is for and what
  it deliberately does not do. Review suggestions are measured against it: a
  correction of what the pull request claims or does is applied and the
  thread answered with the fixing commit; a suggestion adding a capability
  beyond the intent is declined on the thread, and a real problem it names
  gets a Linear ticket.
- **Read `git diff --cached --stat` before committing**, and stage by path or
  with `git add -u`: in a shared checkout, `git add -A` commits content lost
  under you as a revert. Squash onto the branch's merge base, never with
  `git reset --soft origin/main`, which reverts whatever `main` gained since
  the branch was cut.

### Merging

Pull requests are rebase-merged (`gh pr merge --rebase`), so every commit
lands as written: each commit message explains its own change.

### Changesets

A pull request that changes a published package carries a changeset:
`pnpm changeset`, then commit the generated `.changeset/*.md`. Write it for a
reader of the changelog, not for a reviewer of the diff. A breaking change is a
`major`. Don't run `changeset version` yourself: the release workflow does
(below). Changesets on a staging branch apply once it reaches `main`.

A changeset may name a private app (`vizij-authoring`, `vizij-standalone`)
alongside published packages; those get versions and changelogs but are never
published. An app with **no** `version` field cannot appear in a changeset at
all: changesets treats it as ignored and refuses the whole run with
`Mixed changesets that contain both ignored and not ignored packages are not allowed`.

### Docs in the same change

A change that alters behaviour updates the doc that describes it in the same
pull request: the app's README or `docs/`, the package README, this file or
`ARCHITECTURE.md`. A change whose effect crosses repositories also updates the
cross-repo summary in vizij-docs.

## Releasing

npm packages publish **automatically from CI**: whenever a publishable
`@vizij/*` package's version in the repo is not yet on npm, CI publishes it.

- Workflow: [`.github/workflows/publish-npm.yml`](.github/workflows/publish-npm.yml),
  on every push to `main` that touches `packages/**`, and on manual
  `workflow_dispatch`.
- It runs [`scripts/publish-unpublished.mjs`](scripts/publish-unpublished.mjs),
  which decides per package against the registry: a version already on npm is
  **skipped**, an absent version is **published**, and a package that does not
  exist on npm at all is reported as needing a one-time **bootstrap** (below).
  Re-runs are safe, and one package failing does not block the rest.

Authentication is **npm trusted publishing** (OIDC), with no `NPM_TOKEN`: each
package has a trusted publisher configured on npm against this repository and
`publish-npm.yml`, and publishes are signed with provenance. **Don't rename
`publish-npm.yml`**: the trusted-publisher configs reference it by name, and
renaming it breaks publishing until every one is reconfigured.

New packages are licensed `Apache-2.0`.

### Releasing a change

1. The pull request carries its changeset (above).
2. Merged to `main`, [`.github/workflows/release.yml`](.github/workflows/release.yml)
   opens or updates a **Version Packages** pull request that applies every
   pending changeset: version bumps, patch bumps cascaded to workspace
   dependents, and the `CHANGELOG.md` entries.
3. Merging the Version Packages pull request lands the bumped versions on
   `main`, and `publish-npm.yml` publishes each one not yet on npm.

Versioning and publishing are decoupled: `release.yml` never touches npm, and
`publish-npm.yml` publishes whatever versions reach `main`, however they were
bumped; a hand-edited `version` field ships too. The publisher also runs by
`workflow_dispatch`, or locally with `pnpm publish:unpublished` (`--dry-run` to
preview). There are no release tags.

### First publish of a new package

Trusted publishing **cannot create a new package name**: the first publish over
OIDC fails with a 404. For a new `@vizij/*` package, once:

1. Materialise the `workspace:` ranges, which CI otherwise does: publishing
   without this step ships literal `workspace:*` ranges and makes the package
   uninstallable (`EUNSUPPORTEDPROTOCOL`). From the repository root, on an
   npm-authenticated machine:

   ```bash
   node scripts/prepare-publish-manifests.mjs apply
   (cd packages/@vizij/<name> && pnpm build && npm publish --access public)
   node scripts/prepare-publish-manifests.mjs restore
   ```

   Run the `restore` even if the publish fails, so the `workspace:` ranges come
   back. Check the result with `npm view @vizij/<name> dependencies`: no
   `workspace:` may appear.

2. Add a trusted publisher for it on npm (npmjs.com → the package → Settings →
   Trusted Publisher): repository `vizij-ai/vizij-web`, workflow
   `publish-npm.yml`.

From then on CI publishes its new versions like any other package. The
publisher lists any package still in this state at the end of its run.

Internal dependencies use the workspace protocol (`workspace:*`); the publisher
materialises them to real versions at publish time and restores the manifests
afterwards. A publishable package sets `"private": false` (or omits `private`)
and a `publishConfig.access` entry; private packages and apps are skipped.

### Deployments

`vizij-authoring` is a Firebase Hosting site: project `semio-vizij`, site
`vizij-workspace`, configured by
[`apps/vizij-authoring/firebase.json`](apps/vizij-authoring/firebase.json) with
the SPA rewrites and the COOP/COEP headers the wasm runtime requires.

- **Production**: [`.github/workflows/deploy-authoring.yml`](.github/workflows/deploy-authoring.yml)
  deploys the `live` channel on every push to `main` that touches the app, one
  of its five workspace packages, or `pnpm-lock.yaml`, and on
  `workflow_dispatch` to redeploy the current `main`.
- **Per-PR previews**: [`.github/workflows/preview-authoring.yml`](.github/workflows/preview-authoring.yml)
  deploys a `pr-<number>` channel and comments its URL. Channels expire after
  30 days. Pull requests from forks get no secrets and are skipped.

Both need the `FIREBASE_SERVICE_ACCOUNT_SEMIO_VIZIJ` repository secret, a
service-account JSON for `semio-vizij` with the Hosting Admin role. Without it
a preview warns and skips, while a production deploy **fails**, so a missing
secret cannot leave the live site stale unnoticed.

By hand, from a machine with the Firebase CLI authenticated (the predeploy hook
builds the app):

```bash
pnpm run build:packages
cd apps/vizij-authoring
firebase hosting:channel:deploy staging --only hosting:vizij-workspace   # a staging channel
firebase deploy --only hosting:vizij-workspace                           # production
```

## Writing conventions

Every text a person reads (a pull request description, a doc page, a code
comment, a docstring) follows these rules.

- **Write the state, not the story.** State what is true now and why. A reader
  arrives needing to act on the current design; a narrative makes them
  reconstruct it, and every superseded step still reads as though it applies.
  Git history holds the sequence, and a commit message explains its change in
  its own terms.
- **A lesson becomes a rule with its reason:** "don't do Y, because X", not an
  account of discovering that Y was a problem. The reason is what lets the
  rule survive a case nobody anticipated.
- **No attribution, no incident counts.** Who found something and how often it
  happened tell a reader nothing to act on; the mechanism does.
- **Docs describe what is.** Alternatives and rejected designs belong in design
  notes (an app's `docs/`, a package's `DESIGN-*.md`), with the reason they
  were set aside.
- **A title describes the change** in plain words someone outside the thread
  can parse: what moved, and where. Not an argument, not internal shorthand;
  the argument goes in the body. A pull request body states the current
  behaviour, then the change.
- **Link pull requests and tickets with Markdown links**:
  `[#191](https://github.com/vizij-ai/vizij-web/pull/191)`,
  `[VIZ-147](https://linear.app/semio-ai/issue/VIZ-147)`. Issues are tracked in
  Linear, where a bare `#191` links to the wrong repository's pull request.
- **Write a comment for the code's client**: what the item does, its effects,
  and the "why" that stops a reader from deleting something that looks dead.
  An item defines itself by what it does, never by its callers. Public API is
  documented exhaustively; internal comments stay lean.
- **Something awkward to explain is a design smell.** Raise it instead of
  writing around it.
- **Vocabulary.** A keyframed asset is an "animation", never a "clip". A
  module's name has no `-module` suffix (the module `@vizij/animation`); the
  package shipping it does (`@vizij/animation-module`). Before naming a public
  item, search the existing vocabulary across Vizij, Arora and Studio and
  reuse it.
- **The face standard is described on its own terms.** Docs, comments,
  changesets and pull requests state the vizij standard's behaviour plainly.
  ROS4HRI is named only where it is the subject (its mapping, turning it on or
  off, a feature it brings), because it is a profile for ROS robots, not the
  apps' default.

## Design and code rules

These constrain every change; each carries its reason so it applies to cases
it does not name.

- **Apps drive a face through its Arora API**: its methods (`say`, `look_at`,
  `play_viseme`, `reset`, behavior runs, the animation module) and its data
  store, on the vizij standard (`standard/vizij/…`) by default. A function
  Arora already provides needs a written reason to exist in a Vizij package:
  each wrapper is a second API that remote clients lack, and it drifts.
- **Features go through a module's declared functions.** What a face holds
  (animations, programs) is loaded and unloaded through the calls any client
  sends, at any time: a real device gains resources from clients that never
  saw its build.
- **A module never writes keys.** A call has in and out parameters; a
  behavior or the app chooses where to write the outputs.
- **An Arora key is a `/`-separated path**; a trailing `.attribute` is a
  naming convention only.
- **No runtime client writes the authoring rig's override paths.** The
  override stage is an inspector control inside the compiled graph, on
  internal runtime paths; Studio, apps and ROS drive a face through its
  standard inputs. More generally, trace a design's docs, history and author
  before proposing to remove or bypass part of it.
- **Private by default.** Export an item when a real caller needs it, never
  to test it: a published export is a contract whose removal is a major.
- **DRY, without factoring ahead of need.** Extract on real redundancy; name an
  extracted function for what it does, and keep logic one function uses inside
  it.
- **Generic means indifferent**: a type parameter depends on the minimal
  interface the code needs.
- **Fix a cross-platform problem at the layer that makes platforms uniform.**
  A browser- or OS-specific mitigation is a labelled stopgap, agreed before it
  lands, because per-platform patches multiply and entrench the wrong design.
- **Measure performance in instructions, not wall time** (`time -l`'s
  "instructions retired" on the Node process, wasmtime fuel for a guest):
  builds and agents share the machines, so timings there are noise.

## Troubleshooting

- **A hook or a pnpm command fails with `pnpm.cjs` not found.** The `pnpm`
  on `PATH` is corepack's shim, which cannot start pnpm 12: its package ships
  no `pnpm.cjs`. Put first on `PATH` a Node 24 whose `pnpm` is pnpm 12 itself
  (`npm install --global pnpm@12.16.1`).
- **`adaptations:check` fails on a GLB under `test-results/`.** It walks
  every directory but build output, Playwright's ignored ones included:
  delete `test-results/` after an e2e run.

- **A blank page with `_jsxDEV is not a function` in a dev server.** The shell
  exports `NODE_ENV=production`, and Vite pre-bundles React from
  `process.env.NODE_ENV`, so the dev server serves React's production
  `jsx-dev-runtime`. Start it with `NODE_ENV=development`, for example
  `NODE_ENV=development pnpm --filter vizij-authoring dev`.
- **A linked package's `.wasm` answers 403 in a dev server.** Vite serves only
  the directories its `server.fs.allow` lists. `vizij-authoring` resolves the
  linked directories wherever they are; the other apps allow at most this
  checkout and its parent directory, which reaches `../vizij-rs` from a clone
  but not from a worktree.
- **A change does not show in an app.** Rebuild the package it is in
  (`pnpm run build:packages`), check `pnpm run wasm:status` for a linked
  package, and restart the dev server. `pnpm run clean`, or
  `pnpm run rebuild-nodes` for linked packages, clears stale build output and
  Vite caches.
- **`validate` checks too much or too little.** It compares against the
  branch's upstream; set `PNPM_BASE_REF` to the branch the pull request
  targets.
