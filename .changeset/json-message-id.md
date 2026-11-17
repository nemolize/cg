---
"@nemolize/cg": minor
---

`--json` now carries `messageId` on Claude hits, copied from `message.id`, so the lines of one assistant reply can be grouped in `jq`. Lines without a `message.id` and all Codex hits omit it.
