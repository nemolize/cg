---
"@nemolize/cg": minor
---

`--role human` now drops Claude lines whose `origin.kind` or `turnOrigin` is not `human`, so background-task notices, scheduled and plugin prompts no longer count as typed text. Lines with neither field are judged as before.
