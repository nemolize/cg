---
"@nemolize/cg": minor
---

`--role human` now also drops Claude Code's own records of local commands: a user line that records no `origin` and whose whole text is one `<local-command-stdout>` / `<local-command-stderr>` element, the `<bash-stdout>` (and `<bash-stderr>`) output of a `!` shell command, or a `<command-name>` record with no arguments such as `/clear`. Anything that only resembles them is kept, including a command record with arguments and the `<bash-input>` line the human typed; `--role user` is unchanged.
