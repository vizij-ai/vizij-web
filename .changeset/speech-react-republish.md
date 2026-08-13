---
"@vizij/speech-react": patch
---

Republish `@vizij/speech-react` — the `0.1.1` on npm is uninstallable. Its
first publish (2026-07-30) was the one-time manual bootstrap that trusted
publishing cannot do over OIDC, and running `npm publish` by hand in the package
directory skipped `scripts/prepare-publish-manifests.mjs`, so the literal
`"@vizij/render": "workspace:*"` and `"@vizij/runtime-react": "workspace:*"`
ranges reached the registry. Any install fails with
`EUNSUPPORTEDPROTOCOL — Unsupported URL Type "workspace:"`. This release carries
materialised ranges.
