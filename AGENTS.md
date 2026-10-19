# Agent instructions

Before working in this repository, read [`CONTRIBUTING.md`](./CONTRIBUTING.md)
(setup, checks, branches, releases, writing conventions) and
[`ARCHITECTURE.md`](./ARCHITECTURE.md) (how the pieces fit). Before changing an
app or a package, read its `README.md`, and for `vizij-authoring` its
[`docs/ARCHITECTURE.md`](./apps/vizij-authoring/docs/ARCHITECTURE.md).

Rules only an agent needs:

- When a person or another session uses the main checkout, work in a worktree
  of your own, and give its e2e runs their own `VIZIJ_E2E_PORT_OFFSET`.
- Start dev servers with `NODE_ENV=development`: agent shells can export
  `NODE_ENV=production`, which blanks the page (`CONTRIBUTING.md` ›
  Troubleshooting).
- Prefer the smallest change that solves the task to a wide refactor, unless
  asked for one.
- Merge, publish and deploy nothing unless asked.
- In a hand-off, name every check you skipped or could not run.
