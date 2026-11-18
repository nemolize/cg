---
"@nemolize/cg": minor
---

New `--usage` flag: one JSON line per Claude reply and per Codex model call, carrying its token usage (`inputTokens`, `cachedInputTokens`, `cacheCreationInputTokens`, `outputTokens`, `reasoningOutputTokens`, `totalTokens`) so a per-reply figure sums in `jq` without double-counting or dropping any. It is independent of text filters, so it takes only the scope options (`--source`, `--root`, `--codex-root`, `--session`, `--subagents`, `--since`, `--until`, `--cwd`, `--branch`, `--color`); a pattern or any other flag is a usage error. A Claude reply split over several lines yields one record (`final: false` when no line carried its final usage), a `message.id` found in several files counts once, and a Codex event repeating the previous one, or replayed from a fork's parent, is skipped.
