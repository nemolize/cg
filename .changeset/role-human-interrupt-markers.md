---
"@nemolize/cg": minor
---

`--role human` now also drops Claude Code's interrupt markers, a user line whose only content is the text `[Request interrupted by user]` or `[Request interrupted by user for tool use]` and which records no `origin`. Anything that only resembles them is kept; `--role user` is unchanged.
