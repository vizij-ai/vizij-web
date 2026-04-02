# Agent Notes · @vizij/speech-react

- Run scripts with `pnpm --filter "@vizij/speech-react"` (`build`, `typecheck`, `clean`, `dev`).
- Treat this package as the speech-behavior layer on top of `@vizij/runtime-react`, not as a standalone runtime or transport surface.
- Coordinate changes with `@vizij/runtime-react`, `@vizij/render`, and `apps/vizij-standalone`, which is the main integration reference for STT, conversation, TTS, viseme playback, and runtime input writes.
- Be careful with API key handling, browser storage behavior, and pose/input path helpers; those details affect real app behavior across multiple hooks.
- Keep the README integration example aligned with the current callback expectations of `useSpeechPlayback()`.

- Before handing off substantive changes, run:

  ```bash
  pnpm --filter "@vizij/speech-react" build
  pnpm --filter "@vizij/speech-react" typecheck
  ```
