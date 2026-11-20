---
"@nemolize/cg": minor
---

`--file` now selects Codex turns that edit the file through `apply_patch`, read from the patch headers of a top-level `await tools.apply_patch("…")` call in an `exec` source. Other Codex tool calls still match no path, and the stderr notice now says so.
