---
"@vizij/studio-support": minor
"@vizij/orchestrator-react": patch
"@vizij/runtime-react": patch
---

Add the Studio Support package for Studio-canonical Vizij asset preparation, graph registration planning, update policy, stored animation conversion, and clip playback sampling. Runtime React now consumes and re-exports those helpers while preserving its compatibility type exports, and orchestrator-react can preload independent Vizij Arora modules from generated engine module headers before the composed browser orchestrator.
