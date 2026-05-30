---
"@vizij/runtime-react": patch
---

Extract staged input flushing and runtime stepping into an execution-host helper
so the React provider delegates more of the engine update loop mechanics behind
the existing runtime API.
