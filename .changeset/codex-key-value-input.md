---
"@nemolize/cg": minor
---

A Codex tool call's input is now rendered like a Claude `tool_use`: a `⚙ <name>` line, then one `key: value` line per key, so any field is searchable and the matched line says which key hit. This covers `function_call` and `tool_search_call` arguments and every `web_search_call` action, so `open_page` and `find_in_page` calls are now collected too. A `function_call` whose arguments are empty or not an object is kept rather than dropped.
