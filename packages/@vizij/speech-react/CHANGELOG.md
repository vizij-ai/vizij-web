# @vizij/speech-react

## 0.1.2

### Patch Changes

- 1eaa5bf: Republish `@vizij/speech-react` — the `0.1.1` on npm is uninstallable. Its
  first publish (2026-07-30) was the one-time manual bootstrap that trusted
  publishing cannot do over OIDC, and running `npm publish` by hand in the package
  directory skipped `scripts/prepare-publish-manifests.mjs`, so the literal
  `"@vizij/render": "workspace:*"` and `"@vizij/runtime-react": "workspace:*"`
  ranges reached the registry. Any install fails with
  `EUNSUPPORTEDPROTOCOL — Unsupported URL Type "workspace:"`. This release carries
  materialised ranges.
- Updated dependencies [f63fde7]
- Updated dependencies [be44e99]
  - @vizij/render@0.1.2
  - @vizij/runtime-react@0.3.1

## 0.1.1

### Patch Changes

- 6e7a15e: Publish the speech-enabled authoring and standalone package surfaces, including
  the shared speech React hooks package and the renderer bundle typing updates
  that support those flows.
- Updated dependencies [c70b674]
- Updated dependencies [2ffda39]
- Updated dependencies [6e7a15e]
  - @vizij/runtime-react@0.2.0
  - @vizij/render@0.1.1
