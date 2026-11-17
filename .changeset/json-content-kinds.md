---
"@nemolize/cg": minor
---

`--json` now lists the content kinds each turn carries in `contentKinds` (`text`, `thinking`, `tool_use`, `tool_result`, `image`), and `--role human` keeps only `user` turns that carry text, leaving out Claude's tool-result lines (command output still counts). `--role user` is unchanged.
