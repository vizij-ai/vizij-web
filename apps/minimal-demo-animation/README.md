# minimal-demo-animation

The smallest page on the animation engine: `@vizij/animation-react`'s
provider, the package's sample animations, and the values its players write.
It is the "hello world" of `@vizij/animation-react`, so it changes whenever the
provider's API does.

## Scripts

```bash
pnpm --filter minimal-demo-animation dev
pnpm --filter minimal-demo-animation build
pnpm --filter minimal-demo-animation preview
pnpm --filter minimal-demo-animation typecheck
pnpm --filter minimal-demo-animation lint
pnpm --filter minimal-demo-animation test
```

## Maintaining

- Keep its dependencies minimal: it shows the provider alone, with the chrome
  shared by the minimal demos (`@vizij/minimal-demo-ui`).
- A change to `@vizij/animation-react` shows here after
  `pnpm --filter "@vizij/animation-react" build`.
