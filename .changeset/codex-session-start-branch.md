---
"@nemolize/cg": minor
---

`--branch` now matches Codex sessions too. Codex records the branch only once, on the rollout's `session_meta`, so a Codex hit matches on the branch its session started on, where Claude's `--branch` matches the branch at each turn. A rollout with no git branch (a session outside a repository) is still excluded. `--usage` records carry the same value, and the "searched Claude only" notice now names `--file` alone.
