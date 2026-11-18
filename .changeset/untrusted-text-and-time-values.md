---
"@nemolize/cg": patch
---

A transcript can no longer drive your terminal or your shell: control characters in printed text show as visible placeholders (`␛` for escape), and `--resume` / `--print-resume` print a command only for a session id made of letters, digits, `-` and `_`. `--since` / `--until` now reject a bare number (`7`) and a day that does not exist (`2026-02-30`) instead of reading them as some other date, a zero-width regex match (`^`, `\b`) no longer highlights a character, and `--json` with `--resume` / `--print-resume` is a usage error rather than silently ignoring the flag.
