---
"@nemolize/cg": minor
---

`--json` now links each tool result to its call: `toolCalls[].id` and a turn-level `toolResults` array of `{callId, isError}`. `isError` is Claude's `is_error`, and `null` wherever the source records none. Results with an empty body are emitted too.
