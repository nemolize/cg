---
"@nemolize/cg": minor
---

`--role human` now drops Claude user lines that are messages forwarded from another session (a text starting `Another Claude session sent a message:` and a `teammate-message`, `agent-message` or `cross-session-message` tag), which record no `origin`. A line that records `human` is kept; `--role user` is unchanged.
