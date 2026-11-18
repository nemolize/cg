---
"@nemolize/cg": patch
---

A transcript can no longer drive your terminal or your shell: control characters in printed text show as visible placeholders (`␛` for escape), and `--resume` / `--print-resume` print a command only for a session id made of letters, digits, `-` and `_`. `--since` / `--until` now accept only a duration (`7d`), an ISO date (`2026-06-01`) or an ISO datetime (`2026-06-01T12:00:00Z`, offset as `±HH:MM`), so a bare number (`7`), a day that does not exist (`2026-02-30`), a spaced duration (`7 d`) and other date spellings (`June 1 2026`) are usage errors instead of being read as some other date, a zero-width regex match (`^`, `\b`) no longer highlights a character, and `--json` with `--resume` / `--print-resume` is a usage error rather than silently ignoring the flag.
