# @nemolize/cc-grep

## 0.11.0

### Minor Changes

- [#249](https://github.com/nemolize/cg/pull/249) [`df1b50a`](https://github.com/nemolize/cg/commit/df1b50a483e36336a4efa5aa138a2c2fa5c46646) - `--file` now selects Codex turns that edit the file through `apply_patch`, read from the patch headers of a top-level `await tools.apply_patch("…")` call in an `exec` source. Other Codex tool calls still match no path, and the stderr notice now says so.

- [#245](https://github.com/nemolize/cg/pull/245) [`a63b0c3`](https://github.com/nemolize/cg/commit/a63b0c312114a74d95436e37e650d299a98aeefd) - Codex's injected context (the `AGENTS.md` body, `<environment_context>`, and the goal and restart notices) is now treated like Claude's `isMeta` turns: left out of `--role user` searches and session dumps unless `--include-meta` is given, and always left out of `--role human`. The kind is read from the rollout's `content_item_kinds`; a message with any other kind, or without the field, stays visible.

- [#247](https://github.com/nemolize/cg/pull/247) [`aadb586`](https://github.com/nemolize/cg/commit/aadb586964e32415af980c30501780698426295f) - `--branch` now matches Codex sessions too. Codex records the branch only once, on the rollout's `session_meta`, so a Codex hit matches on the branch its session started on, where Claude's `--branch` matches the branch at each turn. A rollout with no git branch (a session outside a repository) is still excluded. `--usage` records carry the same value, and the "searched Claude only" notice now names `--file` alone.

## 0.10.0

### Minor Changes

- [#221](https://github.com/nemolize/cg/pull/221) [`287d988`](https://github.com/nemolize/cg/commit/287d98859f63209f03d83c5c42cfb208049e6dcd) - `--json` now lists the content kinds each turn carries in `contentKinds` (`text`, `thinking`, `tool_use`, `tool_result`, `image`), and `--role human` keeps only `user` turns that carry text, leaving out Claude's tool-result lines (command output still counts). `--role user` is unchanged.

- [#225](https://github.com/nemolize/cg/pull/225) [`2a30a1f`](https://github.com/nemolize/cg/commit/2a30a1f7bcbba68e48cb8fa45d3904817e8a1395) - `--json` now carries `messageId` on Claude hits, copied from `message.id`, so the lines of one assistant reply can be grouped in `jq`. Lines without a `message.id` and all Codex hits omit it.

- [#220](https://github.com/nemolize/cg/pull/220) [`5881e38`](https://github.com/nemolize/cg/commit/5881e38b513d1dd9d8a5f876d5961b94d6097ab3) - `--json` now links each tool result to its call: `toolCalls[].id` and a turn-level `toolResults` array of `{callId, isError}`. `isError` is Claude's `is_error`, and `null` wherever the source records none. Results with an empty body are emitted too.

- [#229](https://github.com/nemolize/cg/pull/229) [`4d596fd`](https://github.com/nemolize/cg/commit/4d596fd75e9a423f02545df643cd3fdbc7535528) - `--json` no longer needs a search pattern: without one it emits every turn that passes the other filters, turns with no text included, and `--json -c` / `--json -l` summarise them. Without `--json` a missing pattern is still an error.

- [#238](https://github.com/nemolize/cg/pull/238) [`1314815`](https://github.com/nemolize/cg/commit/1314815a1066455c08e0ef38f032e0fe9199e62a) - `--role human` now drops the output of `!` shell commands even when the line records `turnOrigin: human`, which is how Claude Code records almost all of it. A user line whose whole string is one `<bash-stdout>` element, optionally followed by one `<bash-stderr>` element, is dropped whatever origin it records. The `<bash-input>` line the human typed, and anything that only resembles the form, is kept. Local-command records (`<local-command-stdout>`, `/clear`) keep the earlier rule: dropped only when no origin is recorded. `--role user` is unchanged.

- [#232](https://github.com/nemolize/cg/pull/232) [`002f54e`](https://github.com/nemolize/cg/commit/002f54e6b1f0edfdf7b7814327498e4def9b0e6b) - `--role human` now drops Claude user lines that are messages forwarded from another session (a text starting `Another Claude session sent a message:` and a `teammate-message`, `agent-message` or `cross-session-message` tag), which record no `origin`. A line that records `human` is kept; `--role user` is unchanged.

- [#235](https://github.com/nemolize/cg/pull/235) [`622fb89`](https://github.com/nemolize/cg/commit/622fb890def23e4c6b36311e74c191336d023f32) - `--role human` now also drops Claude Code's interrupt markers, a user line whose only content is the text `[Request interrupted by user]` or `[Request interrupted by user for tool use]` and which records no `origin`. Anything that only resembles them is kept; `--role user` is unchanged.

- [#236](https://github.com/nemolize/cg/pull/236) [`2d3f72b`](https://github.com/nemolize/cg/commit/2d3f72bc015537a8125f81449a9d8a8dbdec951a) - `--role human` now also drops Claude Code's own records of local commands: a user line that records neither `origin` nor `turnOrigin` and whose whole text is one `<local-command-stdout>` / `<local-command-stderr>` element, or a `<command-name>` record with no arguments such as `/clear`. Anything that only resembles them is kept, including a command record with arguments and the `<bash-input>` line the human typed. `--role user` is unchanged.

- [#223](https://github.com/nemolize/cg/pull/223) [`463acc1`](https://github.com/nemolize/cg/commit/463acc1d9c5ad2bc26d7c45e044f31d3d6063d6c) - `--role human` now drops Claude lines whose `origin.kind` or `turnOrigin` is not `human`, so background-task notices, scheduled and plugin prompts no longer count as typed text. Lines with neither field are judged as before.

- [#243](https://github.com/nemolize/cg/pull/243) [`e180b33`](https://github.com/nemolize/cg/commit/e180b33b925a474525cefecf536768d7a620c970) - New `--usage` flag: one JSON line per Claude reply and per Codex model call, carrying its token usage (`inputTokens`, `cachedInputTokens`, `cacheCreationInputTokens`, `outputTokens`, `reasoningOutputTokens`, `totalTokens`) so a per-reply figure sums in `jq` without double-counting or dropping any. It is independent of text filters, so it takes only the scope options (`--source`, `--root`, `--codex-root`, `--session`, `--subagents`, `--since`, `--until`, `--cwd`, `--branch`, `--color`); a pattern or any other flag is a usage error. A Claude reply split over several lines yields one record (`final: false` when no line carried its final usage), a `message.id` found in several files counts once, and a Codex event repeating the previous one, or replayed from a fork's parent, is skipped.

### Patch Changes

- [#217](https://github.com/nemolize/cg/pull/217) [`097e7f6`](https://github.com/nemolize/cg/commit/097e7f678f7b148b7853f0fe6046ae85559c1553) - Codex tool calls whose arguments are `null` or `{}` no longer add a `null` / `{}` line, matching Claude's `tool_use`

- [#239](https://github.com/nemolize/cg/pull/239) [`f2fca86`](https://github.com/nemolize/cg/commit/f2fca86964172f43fa84b98851f27a67adb7d3b9) - A transcript can no longer drive your terminal or your shell: control characters in printed text show as visible placeholders (`␛` for escape), and `--resume` / `--print-resume` print a command only for a session id made of letters, digits, `-` and `_`. `--since` / `--until` now accept only a duration (`7d`), an ISO date (`2026-06-01`) or an ISO datetime (`2026-06-01T12:00:00Z`, offset as `±HH:MM`), so a bare number (`7`), a day that does not exist (`2026-02-30`), a spaced duration (`7 d`) and other date spellings (`June 1 2026`) are usage errors instead of being read as some other date, a zero-width regex match (`^`, `\b`) no longer highlights a character, and `--json` with `--resume` / `--print-resume` is a usage error rather than silently ignoring the flag.

## 0.9.0

### Minor Changes

- [#213](https://github.com/nemolize/cg/pull/213) [`347c1d1`](https://github.com/nemolize/cg/commit/347c1d1f4de2b94ef01de4d3db763cc089be5c91) - A Codex tool call's input is now rendered like a Claude `tool_use`: a `⚙ <name>` line, then one `key: value` line per key, so any field is searchable and the matched line says which key hit. This covers `function_call` and `tool_search_call` arguments and every `web_search_call` action, so `open_page` and `find_in_page` calls are now collected too. A `function_call` whose arguments are empty or not an object is kept rather than dropped.

## 0.8.0

### Minor Changes

- [#136](https://github.com/nemolize/cg/pull/136) [`99f3ac5`](https://github.com/nemolize/cg/commit/99f3ac5061a5e0f7dc929debfe9542624164aa4d) - `--json` now carries each tool call's input as `toolCalls[].input`, as each agent recorded it (Codex `function_call` arguments parsed from JSON), in full.

## 0.7.0

### Minor Changes

- [#128](https://github.com/nemolize/cg/pull/128) [`314f510`](https://github.com/nemolize/cg/commit/314f510972cdbd82051c18393bc1917e1b7999f9) - Rename to `cg` (package `@nemolize/cg`). The command is now `cg`; `cc-grep` stays as an alias. Root overrides are now `CG_ROOT` / `CG_CODEX_ROOT`; the old `CC_GREP_ROOT` / `CC_GREP_CODEX_ROOT` are still read when the new ones are unset.

### Patch Changes

- [#122](https://github.com/nemolize/cg/pull/122) [`aac671c`](https://github.com/nemolize/cg/commit/aac671c1ffe19240fca2ec5e0f73416bd4ced0bb) - Decode JSON-encoded Codex tool output once so search context shows individual output lines.

## 0.6.0

### Minor Changes

- [#111](https://github.com/nemolize/cc-grep/pull/111) [`8e37192`](https://github.com/nemolize/cc-grep/commit/8e37192098e89f41bee4bb7c713540b4d30e8841) - Search Codex session transcripts alongside Claude Code's. Both roots are scanned by default — `~/.claude/projects` and `~/.codex/sessions` — so a machine with one agent installed needs no configuration, and `--source claude|codex|both` narrows it. A Codex hit is marked `codex` in its header and its `--json` row, and `--resume` prints `codex resume <id>` rather than `claude --resume <id>`, so a copied command cannot reopen the session under the wrong agent. The pattern, `--role`, `--since`/`--until`, `--cwd`, `--session` dumps, `--subagents`, `-c` and `-l` all work the same on both.

  Three filters read something Codex records differently, or not at all, and the README says so rather than guessing: `--file` never matches a Codex turn (its tool arguments arrive as one opaque string, so no field is known to hold a path, and inferring one would attribute an edit to a session that merely mentioned a filename), `--tool` takes each source's own tool names, and `--branch` is Claude-only for now — Codex records the branch, but only at session start, which is a different filter than the per-turn one `--branch` documents. A `--file` or `--branch` run with a Codex root in scope says on stderr that it searched Claude only, so an empty result is never mistaken for an absence.

  On the Codex side the searchable text covers messages, tool calls and their output, the queries a `web_search_call` or `tool_search_call` recorded, and the one-line reasoning summary older rollouts carry beside the encrypted body.

  `--codex-root` joins `--root` so each source's root has its own flag, mirroring the env pair; `--root` keeps meaning Claude's exactly as it did. An unreadable root is an error when you named it — by flag or env var, and the message says which — and a silent skip when it was merely the default. A directory that exists but cannot be read now counts as unreadable rather than as no hits.

  `parentSessionId` is now emitted only when the transcript recorded a parent. A few old Codex rollouts mark a thread as a subagent without naming one, and repeating the thread's own id there claimed it was its own parent.

## 0.5.0

### Minor Changes

- [#66](https://github.com/nemolize/cc-grep/pull/66) [`5f8fd2b`](https://github.com/nemolize/cc-grep/commit/5f8fd2bcb46a41c2f694e46db8163b2b1843b7ba) - Render tool calls for a reader rather than as raw arguments. The tool's name now
  tags the hit header instead of taking a body line, an `Edit` shows its two sides
  as a diff, and an argument that carries no meaning (`replace_all`) is left out
  when it leads the call and is not itself what matched. Matching and `--json` are
  unchanged: the shaping is display-only, so `old_string:` still finds an edit.

  Telling an argument from a line of file content that looks like one is a
  heuristic, since extraction keeps a value's newlines but not the record of where
  they were. It is deliberately conservative: a wrong guess never hides a line, and
  a line that matched always prints — it can only carry a `-`/`+` marker onto lines
  that are not part of that value.

- [#61](https://github.com/nemolize/cc-grep/pull/61) [`ef3f9ed`](https://github.com/nemolize/cc-grep/commit/ef3f9ed68f2cb473c8da75efc8f8f8ad6fd96606) - Add `--tool` and `--file` to find which session touched a given file.

  `--tool <name[,name...]>` restricts to turns that called one of the named tools
  (case-insensitive, repeatable); `--file <substring>` restricts to turns whose
  tool call targets a matching path. Both conditions hold on the same call, so a
  session that read the file and edited a different one does not match — and
  neither does a prose mention of the filename, which a plain substring search
  cannot separate from an actual `Edit` call. The match is on the call rather
  than its outcome, so an edit that failed still matches; the attempt is itself
  evidence that session was working on the file.

  Either flag stands in for the pattern, and a patternless run prints the header
  alone, naming the tool and the path it targeted. `--json` gains a `toolCalls`
  array on any hit that made one, and returns `matchedLines` empty on a
  patternless search for the same reason the header stands alone — every line
  "matched", so listing them says nothing. A `--session` dump is unaffected.

- [#60](https://github.com/nemolize/cc-grep/pull/60) [`83b4952`](https://github.com/nemolize/cc-grep/commit/83b495204f6b6d5e019bb2e120a9d0bf9e35796b) - Add survey flags so a broad pattern can be narrowed before printing it: `-c/--count` reports the hit total, `-l/--list-sessions` reports one line per matching session ordered most hits first, and `-m/--max-count <N>` stops the scan after N hits and notes on stderr that it capped. Both summaries pair with `--json`, and neither combines with `--resume`/`--print-resume` (a summary prints no hit to resume, so the combination is a usage error). `--help` now carries an Examples section and a note that a broad pattern can print megabytes.

### Patch Changes

- [#76](https://github.com/nemolize/cc-grep/pull/76) [`12b5274`](https://github.com/nemolize/cc-grep/commit/12b5274dadb45ba3e7afbd63513520dfa646988b) - Skip `JSON.parse` on transcript lines that cannot contain the pattern. A search previously parsed every line of the corpus regardless of the pattern, so a term with a handful of hits cost the same full-corpus parse as one matching everywhere. Each raw line is now tested for a literal the pattern requires before it is parsed, cutting a 528 MB search from 2.19 s to 1.42 s (1.5×); the remaining time is dominated by reading the lines, not by parsing them.

  Results are unchanged. The prefilter is a strict superset of the matcher, and it stops prefiltering whenever the literal cannot be scanned for reliably: no pattern (`--session` dumps), a regex with metacharacters, a run under three characters, or a literal that could sit inside a value `JSON.parse` canonicalises — `1e2` reaches the matcher as `100`, and `1e400` overflows to `Infinity` and arrives as `null`. Characters JSON must escape and separators the text extractor synthesises are excluded from the literal, and any line carrying a `\uXXXX` escape is parsed regardless, since JSON may encode even an ordinary character that way (an HTML-escaping serialiser writes `>` as `>`). A property test derives what the matcher would see from each raw line and asserts the prefilter accepts whenever the matcher matches, so a future extractor change that mints a new divergence fails with a repro rather than silently losing hits.

- [#67](https://github.com/nemolize/cc-grep/pull/67) [`49b89a4`](https://github.com/nemolize/cc-grep/commit/49b89a4a3d639aae04be6496ce4b1f915e2b1f01) - Stop counting a `tool_use` block nested inside a `tool_result` as a call the
  session made.

  A tool's output is data, not a record of what the session did, so anything that
  echoes transcript-shaped JSON back — a log dump, a pasted API response, this
  tool's own `--json` output — could put a `tool_use` block there and have the
  session read as having called it. `--tool` and `--file` now filter on the
  assistant's own calls only. Text inside a `tool_result` is still extracted and
  searchable, unchanged.

## 0.4.0

### Minor Changes

- [#42](https://github.com/nemolize/cc-grep/pull/42) [`c8154d4`](https://github.com/nemolize/cc-grep/commit/c8154d4996202863be23977ab458151b634928cc) - Add `--session` to dump one session as a conversation. Search narrows to a
  session id, but reading that session back had no route through the tool;
  `--session` prints it whole instead of searching across all sessions. The id
  resolves by prefix, so the 8-char form search prints is enough, and the pattern
  becomes optional — passing one alongside `--session` keeps search semantics and
  highlights within the turns it selects. Filters compose unchanged and `--json`
  emits the same per-hit objects, so a dump pipes to `jq` like a search.

- [#52](https://github.com/nemolize/cc-grep/pull/52) [`694848e`](https://github.com/nemolize/cc-grep/commit/694848e3b4c4bb822e69244f8bc7dd5a6a9abca0) - Mark subagent hits and add a `--subagents <include|exclude|only>` scope filter.
  A subagent turn carries its parent's session id and a bare `user` role, so it
  was indistinguishable from something the human typed; hits now carry a `▸sub`
  mark as a separate token, keeping the session id copyable. The default differs
  per surface — a search includes subagent turns, a `--session` dump excludes
  them — and `--json` names the relation via `isSubagent`, `agentId` and
  `parentSessionId`. `--include-subagents` remains as a deprecated alias for
  `--subagents=include`.

## 0.3.0

### Minor Changes

- Render `tool_use` hits readably instead of as one serialized JSON blob. A tool
  call now extracts as a `⚙ <name>` header plus one `key: value` line per
  argument, with string values spliced in raw so their newlines become real
  lines. Because those lines are also what patterns match against, a hit inside
  a tool call now shows only its own neighbourhood rather than dragging an
  entire heredoc along, and `-C N` counts real lines. ([#30](https://github.com/nemolize/cc-grep/pull/30), closes [#29](https://github.com/nemolize/cc-grep/issues/29))

### Patch Changes

- Tighten CLI argument validation, and preserve the precedence of grouped
  control options so a later flag in a group no longer loses to an earlier one.
  Argument parsing moved to Node's own parser. ([#20](https://github.com/nemolize/cc-grep/pull/20))

## 0.2.1

### Patch Changes

- Report the real version under `--version`. The published 0.2.0 package
  answered `0.1.0`, because the CLI carried a hardcoded literal that had drifted
  from `package.json`; the version is now read from `package.json` at runtime. ([#16](https://github.com/nemolize/cc-grep/pull/16))

## 0.2.0

### Minor Changes

- No user-visible change; the version was raised alongside the release workflow
  that carried this project until Changesets replaced it.

## 0.1.0

### Minor Changes

- Initial release: a cross-project full-text search CLI over Claude Code session
  transcripts, published as `@nemolize/cc-grep` and runnable via `npx`.

Entries for 0.3.0 and earlier were reconstructed by hand from the git history,
this project having adopted Changesets only afterwards.
