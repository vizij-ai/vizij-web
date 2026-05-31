---
"@vizij/studio-support": patch
"@vizij/runtime-react": patch
---

Move runtime controller clear/register application into Studio Support so the
React provider consumes prepared registration plans through a narrower host
adapter boundary.
