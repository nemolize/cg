---
"@nemolize/cg": minor
---

`--role human` now drops the output of `!` shell commands even when the line records `turnOrigin: human`, which is how Claude Code records almost all of it. A user line whose whole string is one `<bash-stdout>` element, optionally followed by one `<bash-stderr>` element, is dropped whatever origin it records. The `<bash-input>` line the human typed, and anything that only resembles the form, is kept. Local-command records (`<local-command-stdout>`, `/clear`) keep the earlier rule: dropped only when no origin is recorded. `--role user` is unchanged.
