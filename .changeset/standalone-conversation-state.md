---
"vizij-standalone": minor
---

The page writes the face standard's conversation state on its face, each `standard/vizij/conversation/<state>` an `f32`, 1 while it holds and 0 at rest: `speaking` from the moment the `say` run is spawned until its status reads terminal or the page stops it, `user_speaking` as Deepgram's voice activity says, `thinking` while a call to OpenAI is pending. Showing another face returns all three to 0 on the face being left. The shipped Quori's conversational program takes a listening, a thinking and a speaking posture from them.
