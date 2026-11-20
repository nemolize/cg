---
"@nemolize/cg": minor
---

Codex's injected context (the `AGENTS.md` body, `<environment_context>`, and the goal and restart notices) is now treated like Claude's `isMeta` turns: left out of `--role user` searches and session dumps unless `--include-meta` is given, and always left out of `--role human`. The kind is read from the rollout's `content_item_kinds`; a message with any other kind, or without the field, stays visible.
