---
"@nemolize/cg": minor
---

`--json` no longer needs a search pattern: without one it emits every turn that passes the other filters, turns with no text included, and `--json -c` / `--json -l` summarise them. Without `--json` a missing pattern is still an error.
