# cg

_grep your coding agent sessions._

> Formerly `cc-grep` (`@nemolize/cc-grep`). The `cc-grep` command still works
> as an alias.

Grep across every Claude Code and Codex session transcript on your machine, so
you can find past conversations by content — _"what did I discuss with the agent
about X three weeks ago?"_

You solved something with an agent weeks ago and now hit the same problem — but
the shell history is gone and you can't remember which project it was in.
`cg "denyRead"` finds the turn; `--resume` drops you back into that
session.

Claude Code stores each session as a JSONL transcript under
`~/.claude/projects/`, and Codex stores one per thread under
`~/.codex/sessions/`. `cg` scans both and prints matching turns with their
project, timestamp, session id, and role — plus a ready-to-run resume command
(`claude --resume <id>` or `codex resume <id>`, whichever the hit came from) to
jump back into any hit.

Whichever root exists is searched, so a machine with only one agent installed
needs no configuration. [Codex support](#codex-support) covers where the two
sources differ.

Read-only. Nothing ever leaves your machine.

## Usage

```
npx @nemolize/cg <pattern> [options]
cg <pattern> [options]              # once installed globally
cg --session <id> [pattern]         # read one session as a conversation
cg --source codex <pattern>         # one agent's transcripts only
cg --tool Edit --file <path>        # which session touched a file (Claude)
cg --json [options]                 # every turn as JSON, no pattern needed
```

```
$ npx @nemolize/cg "auth flow"
~/proj-a  2026-07-10 21:34  a1b2c3d4  user
  │ …preceding line…
  │ >> …matched line with auth flow highlighted…
  │ …following line…
```

### Pattern

- Substring match by default.
- `-e, --regex` — treat the pattern as a regular expression.
- `-F, --fixed` — force literal match (overrides `--regex`).
- `-i, --ignore-case` — case-insensitive match.

### Scope

- `--source <claude|codex|both>` — which agent's transcripts to search
  (default: `both`). A root nobody named — `~/.claude/projects` or
  `~/.codex/sessions` — is skipped when it does not exist, so a machine with one
  agent installed needs no configuration. A root you **named** — by flag or by
  env var — is an error when it is unreadable: searching the other source
  instead would answer a question you did not ask.
- `--root <path>` / `--codex-root <path>` — one flag per source, so either can
  be relocated without changing what the other means. Each falls back to its env
  override — `$CG_ROOT`, `$CG_CODEX_ROOT` (the pre-rename `CC_GREP_*` names still
  work) — and then to the path
  above.

### Filters

- `--session <id>` — dump one session as a conversation instead of searching;
  see [Reading one session](#reading-one-session).
- `--subagents <include|exclude|only>` — scope subagent turns. Defaults differ
  per surface: a search includes them, a `--session` dump excludes them; see
  [Subagent turns](#subagent-turns). `--include-subagents` is a deprecated alias
  for `--subagents=include`.
- `--role <user|assistant|human|any>` — restrict by turn role (default: `any`).
  Claude Code records tool results as `user` turns, so `user` also returns tool
  output. `human` keeps only `user` turns that carry text, not tool output — see
  [Telling typed text from tool output](#telling-typed-text-from-tool-output).
- `--since <dur|date>` / `--until <dur|date>` — time window. Accepts a relative
  duration (`7d`, `2h`, `30m`, `1w`) or an absolute date (`2026-06-01`).
- `--cwd <substring>` — restrict to sessions whose working directory matches.
- `--branch <substring>` — restrict by the git branch at session start.
- `--tool <name[,name...]>` — restrict to turns that called one of these tools,
  matched case-insensitively. Repeatable, so `--tool Edit --tool Write` and
  `--tool Edit,Write` are the same request.
- `--file <substring>` — restrict to turns whose tool call targets a matching
  path (`file_path` / `notebook_path`). See
  [Finding which session touched a file](#finding-which-session-touched-a-file).
- `--include-meta` — include `isMeta` (skill/system-injected) turns, off by
  default.

### Surveying a broad pattern

A pattern that matches thousands of turns prints megabytes, which is the wrong
first move — especially when the output is going into an agent's context window.
Survey first, then narrow:

- `-c, --count` — print how many hits there are, and nothing else.
- `-l, --list-sessions` — print one line per matching session (full id, hit
  count, cwd), most hits first. The id is printed in full, so the line pastes
  into `--session`.
- `-m, --max-count <N>` — stop after N hits, and note on stderr that it capped.
  Piping through `head` also ends the scan (the EPIPE guard sees the closed
  pipe), so this is not about speed: `-m` stops at exactly hit N rather than at
  whatever the pipe buffer held, never cuts a hit mid-block, keeps the exit
  status meaningful, and composes with `-c`.

```
$ cg "denyRead" -c
223

$ cg "denyRead" -l
3bdb74bf-2a64-400b-94cb-b76a9f0620df    30 hits  ~/dotfiles
74b82329-00d8-4530-bb8b-c08d85d38c05    25 hits  ~/dotfiles
…
```

`--json` pairs with both: `-c` emits a single `{"hits":223}`, `-l` emits one
`{"sessionId":…,"hits":…,"cwd":…}` per session. Neither composes with
`--resume` / `--print-resume` — a summary prints no hit to resume, so the
combination is a usage error rather than a silently dropped flag.

### Context & output

- `-C, --context <N>` — lines of context around each match (default: 2).
- `--json` — emit one JSON object per hit, one per line, for piping to `jq`.
  The pattern is optional with it: without one, every turn that passes the
  filters is emitted (see [Aggregating with jq](#aggregating-with-jq)). Without
  `--json` a missing pattern is still an error, since printing every turn to a
  terminal is never what was meant.
- `--color <always|never|auto>` — colorize output (default: auto-detects a TTY).
- `--resume` — print the resume command for the top hit only, worded for the
  agent that hit came from. Use once your filters have narrowed things down to
  the session you want.
- `--print-resume` — print the resume command for every hit. Use while
  browsing, so any hit can be jumped into.

## Reading one session

Finding a past decision is a two-step job: search narrows to a session, then you
read that session to recover the reasoning. `--session` covers the second step —
it prints a session as a conversation instead of searching across all of them:

```
$ cg --session a1b2c3d4 --role human
session a1b2c3d4-5e6f-7890-abcd-ef1234567890  ~/proj-a  (main)

user  2026-07-10 21:30
  │ why did we drop the retry wrapper here?

user  2026-07-10 21:34
  │ …
```

- The id can be a prefix — the short form the search output prints is enough
  (8 characters for Claude; 18 for Codex, whose ids share a leading timestamp).
  A prefix matching several sessions dumps each and warns on stderr, so widen it.
- Subagent turns are left out by default; `--subagents=include` puts them back.
  See [Subagent turns](#subagent-turns).
- The pattern is optional. Give one anyway to keep only the turns that match it,
  with the match highlighted; the whole turn is shown either way, since `-C N`
  windows are for scanning search hits, not for reading a conversation.
- The other filters compose: `--role human` shows just the asks, `--since` trims
  a long session to its recent stretch.
- `--json` emits the same per-hit objects as a search, so a dump pipes to `jq`
  the same way.

`claude --resume` also reopens a session, but interactively and at the cost of a
context window. Reading a past conversation as text is a different job.

## Subagent turns

A subagent's transcript is a file of its own — beside its parent's for Claude,
one per thread for Codex — and carries the _parent's_ session id, so its turns
look like ordinary ones. They are not: a subagent's `user` turn is the prompt an
orchestrator injected into a spawned agent, not something the human typed. In a
fan-out-heavy session they can outnumber the conversation itself.

Hits from a subagent are marked on the header, right after the session id:

```
~/proj  2026-07-25 01:28  09a180aa ▸sub  user
  │ >> …a skill body injected into a spawned agent…
```

The mark is a separate token, so the session id stays copyable into `--session`.
In a `--session` dump the mark carries the agent's own id alongside it
(`user  2026-07-25 01:28  ▸sub a2b5036c2408d89dc`), which separates one spawned
agent's turns from another's.

`--subagents` scopes them, and the default differs by surface — a search
includes them, a `--session` dump excludes them:

- `include` — search's default. Everything the session produced.
- `exclude` — what you want when reconstructing what the human actually asked,
  since `--role human` alone still mixes in every orchestrator prompt.
- `only` — what you want when auditing what a fan-out did.

`--json` names the relation rather than leaving it to be inferred from the file
path: `isSubagent`, plus `agentId` on a subagent hit and `parentSessionId`
whenever the transcript recorded a parent. A handful of old Codex rollouts
recorded none; there `sessionId` is the thread's own id and `parentSessionId` is
absent rather than repeating it.

## Telling typed text from tool output

`--json` carries `contentKinds` on every hit: the kinds of content the turn
holds, each once, in the order they first appear — any of `text`, `thinking`,
`tool_use`, `tool_result`, `image`. A Claude line can mix blocks, so a `user`
turn may list `["tool_result", "text"]`. Codex's kinds follow the record type:
messages are `text`, `reasoning` is `thinking`, calls are `tool_use`, and call
outputs are `tool_result`.

`--role human` keeps a turn only when its `role` is `user`, it is not `isMeta`,
and `contentKinds` includes `text`; `--role user` is unchanged. A Claude line
that records `origin.kind` or `turnOrigin` is also dropped unless that value is
`human`, which leaves out background-task notices, scheduled and plugin
prompts, and SDK prompts. A line with neither field is judged by the text rule
and the forwarded-message check below. It is still not strictly "what the human typed":

- subagent orchestrator prompts count as `user` text — add `--subagents exclude`;
- a Claude line with no origin field whose text starts `Another Claude session
sent a message:` and a `teammate-message`, `agent-message` or
  `cross-session-message` tag is dropped as a forwarded message. This is a text
  heuristic, so a human who pastes the same envelope is dropped too; `--role
user` shows it. A line that records `human` is kept, and so is any other
  wrapper;
- other Claude lines without an origin field are not detected: older
  transcripts, the output of a `!` shell command, interrupt markers;
- Codex's injected context is likewise not detected.

`--role human` drops `isMeta` turns even with `--include-meta`.

## Finding which session touched a file

"Who last touched this file, and in what conversation" is the transcript
analogue of `git log --follow`, and it is what an unexplained working-tree
change raises. Grepping for the path answers a different question: a `Read`, a
`Grep --path`, a `git diff -- <path>` and an actual `Edit` all match the same
string, and in a prose-heavy repo the filename's own mentions drown the rest.

`--tool` and `--file` filter on the tool calls themselves, so the edit is
separable from the mention:

```sh
$ cg --tool Edit,Write --file 'rules/documentation-staleness.md' --since 7d
~/dotfiles  2026-08-07 23:01  84c616b9  assistant  [Edit ~/dotfiles/rules/documentation-staleness.md]
```

Both conditions hold on the _same_ call, so a session that read the file and
edited a different one does not match. With no pattern the hit is the header
alone — the tool and the path it targeted are the answer. Pass a pattern too
and the matched lines come back as usual, still restricted to those turns.

`--file` matches a substring of the path, so a repo-relative fragment finds an
absolute path in the transcript. `--tool` is case-insensitive and repeatable.

The match is on the call, not its outcome: a transcript records that an `Edit`
was attempted, and whether it landed lives in the paired result. An edit that
failed on a stale `old_string` still matches — which is usually what you want,
since the attempt is itself evidence that session was working on the file.

`--file` and `--tool` as described here are Claude-only: a Codex tool call
records no path field, so `--file` never selects one and `--tool` takes Codex's
own tool names — see [Codex support](#codex-support).

`--json` carries a `toolCalls` array (`{id, name, paths, input}`) on any hit that
made one, so the attribution is machine-readable without re-parsing the rendered
lines. On a patternless search `matchedLines` comes back empty for the same
reason the header stands alone — every line "matched", so listing them says
nothing.

`input` is the call's input as its agent recorded it — field names inside it are
each agent's own, not a shared vocabulary:

| Source | Call shape         | `input` is                                                        |
| ------ | ------------------ | ----------------------------------------------------------------- |
| Claude | `tool_use` block   | the block's `input`, verbatim                                     |
| Codex  | `function_call`    | `arguments` parsed as JSON; the raw string when it does not parse |
| Codex  | `custom_tool_call` | `input`, a string (e.g. JavaScript source for `exec`), as-is      |
| Codex  | `tool_search_call` | `arguments`, already an object, verbatim                          |
| Codex  | `web_search_call`  | `action`, verbatim                                                |

A call that carries no input omits the key. `input` is always emitted in full —
no truncation, since a cut value would silently miscount in `jq`; drop it with
`jq 'del(.toolCalls[]?.input)'` when you do not want it.

A call's `id` is the identifier its result answers, and a turn carrying results
has a turn-level `toolResults` array (`{callId, isError}`), one entry per result
in source order — an array because one Claude line can hold several. The two
join in `jq` on `toolCalls[].id == toolResults[].callId`, even across separate
lines — each hit is its own JSON line, so the join needs a stream-wide filter
(`jq -s`, or `jq -n '[inputs]'`); a per-line filter sees only one side. A turn
with no calls or results omits the key, as `toolCalls` does; `id` and `callId`
are omitted when the source records none, while `isError` is always present.

| Source | Call (`id`)                                                          | Result (`callId`)                                              | `isError`                              |
| ------ | -------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| Claude | `tool_use` block's `id`                                              | `tool_result`'s `tool_use_id`                                  | `is_error` when a boolean, else `null` |
| Codex  | `call_id` of `function_call`, `custom_tool_call`, `tool_search_call` | `call_id` of `function_call_output`, `custom_tool_call_output` | always `null`                          |

`isError` is copied only from Claude's `is_error`. `null` means the source
recorded no outcome — never "succeeded": about a quarter of Claude's results
omit the field, and Codex records none (a `custom_tool_call`'s `status` reads
`completed` whatever happened). Codex's `tool_search_output` is not read and a
`web_search_call` records no `call_id` and has no output record, so neither is
linked yet; a `tool_search_call`'s `id` therefore matches no emitted result. A
`tool_result` nested inside another result's content is data, not a result.

A result with an empty body is emitted too, so every recorded result can be
joined. It is a turn with no text lines: a pattern search never matches it,
while a `--session` dump lists it, its header followed by an empty body.

## Grouping the lines of one reply

Claude Code writes one assistant reply as several JSONL lines — its text in
one, each tool call in another — and `--json` keeps them as separate hits. Every
Claude hit whose line records a string `message.id` carries it as `messageId`,
so the lines of one reply group in `jq` without merging them:

```sh
cg --session <id> --json | jq -s 'map(select(.messageId != null)) | group_by(.messageId)'
```

Lines with no `message.id` (a `user` line has none) omit the key, so the filter
keeps them out of a `null` group. A pattern search emits only the lines it
matched, so a reply is whole only in a `--session` dump, and even there a line
holding nothing but an empty `thinking` block or an image is never emitted.

Codex has no `messageId`: its records carry no reply-level id. A record's own
`id` names that record, and the `turn_id` its rollouts share spans a whole
turn — several model steps — so it is not exposed.

## Aggregating with jq

`cg` finds and prints records; counting them is left to `jq`, so the recipes
below pipe `--json` through it. Each names what it measures, because a count
that reads like something bigger is the usual mistake.

### Sessions active per project

```sh
cg --since 30d -l --json | jq -s '
  group_by(.cwd)
  | map({cwd: .[0].cwd, sessionsActive: length})
  | sort_by(-.sessionsActive)'
```

`sessionsActive` is the number of sessions with at least one turn in the period
— not sessions started in it, time spent, or a rate. `-l --json` prints one line
per session, so a session counts once however many turns it has. With no
pattern every turn counts, one with no text (an empty tool result) included, so
a session whose only turns in the period were such results is still seen.

A project here is a `cwd`: a worktree or a subdirectory is a row of its own. A
session is filed under one `cwd`, that of the first matching turn `cg` reads
(not necessarily the earliest), so one that changed directory is not counted
twice. A subagent's turn can supply it; `--subagents exclude` files the session
by the conversation alone. A line with no recorded `cwd` groups under `null`.

Subagent turns count toward their parent's session, except in the few old Codex
rollouts that recorded no parent ([Subagent turns](#subagent-turns)): there each
thread counts as a session of its own. `--subagents exclude` leaves them out.

### Edit attempts per file

```sh
cg --tool Edit,Write --source claude --since 30d --json | jq -s '
  [.[].toolCalls[]? | select(.name | IN("Edit", "Write")) | .paths[]]
  | group_by(.)
  | map({file: .[0], attempts: length})
  | sort_by(-.attempts)'
```

`attempts` is the number of `Edit` and `Write` calls that targeted the file —
not edits that landed. A call that failed on a stale `old_string` is counted;
whether one landed is in the paired result (`toolResults`, see
[Finding which session touched a file](#finding-which-session-touched-a-file)).

`--tool` keeps a whole turn that made one of those calls, and a turn can carry
others, such as a `Read` of another file. The `select` repeats the filter on
each call, so only the named ones are counted; `jq` compares names exactly, where
`--tool` ignores case. Add `MultiEdit` or `NotebookEdit` to both lists to count
them. `--source claude` is there because a Codex call records no path.

## Codex support

Codex transcripts are searched alongside Claude's by default, and a Codex hit is
marked `codex` in its header so the two never read as one corpus. Everything the
two schemas express the same way works identically — the pattern, `--role`,
`--since` / `--until`, `--cwd`, `--session` dumps, `--subagents`, `-c` / `-l`,
`--json` (which carries a `source` field), and the resume affordance.

JSON-encoded tool output is decoded once before matching and rendering, so `-C N`
shows neighbouring output lines. Nested strings retain literal backslash escapes;
non-JSON output stays verbatim. Patterns match the decoded text rather than its
JSON escaping or quoted object keys.

Three filters read something Codex records differently, or not at all:

- **`--file` never matches a Codex turn.** Codex passes a tool's arguments as one
  string — JavaScript source for `exec`, a JSON blob for a function call — and
  even parsed, no field is known to hold a path, so guessing one would attribute
  edits to sessions that merely mentioned a filename. Grep for the path instead. A run
  that pairs it with a Codex root says on stderr that it searched Claude only,
  so an empty result is never mistaken for "Codex has none either".
- **`--tool` matches Codex's own tool names** (`exec`, `send_message`,
  `web_search_call`, …), not Claude's `Edit` / `Write` / `Bash`. Unlike the
  other two it still works on Codex — under a Codex name — so a name list
  written for one source simply selects nothing in the other, with no notice.
- **`--branch` never matches a Codex turn** — not yet. Codex does record the
  branch on a rollout's `session_meta` (absent only outside a repo), but only
  there: it is the branch at session start rather than Claude's per-turn value,
  so reading it is a different filter than the one `--branch` documents. Until
  that is settled the field is left unset, and a `--branch` run says on stderr
  that it searched Claude only, the same way `--file` does.

`--include-meta` reaches Codex's `developer` turns, which carry injected
instructions rather than anything either party said — the role Claude's `isMeta`
turns play.

A Codex tool call's input is rendered like a Claude `tool_use`: a `⚙ <name>`
line, then one `key: value` line per key, so any field is searchable and the
matched line says which key hit. This covers a `function_call`'s `arguments`
(parsed as JSON), a `tool_search_call`'s `arguments` and every `web_search_call`
`action` — `open_page` and `find_in_page` included, not only searches. A string
value's own newlines become separate lines, so `-C N` shows a command's
neighbourhood; arrays and nested objects render inline (`queries: [a, b]`). Every
key is shown, `type` included, so a pattern equal to a key name matches every
call carrying that key. A `function_call` whose arguments are not an object shows
the parsed value, or the raw string when it does not parse. `--tool
web_search_call` therefore selects `open_page` and `find_in_page` calls too.

Codex's reasoning is stored encrypted, so only the one-line summary some
rollouts record beside it is searchable — current Codex writes that field empty,
so in practice this reaches older transcripts. Claude's thinking blocks are
searchable in full, as usual.

Codex writes one file per thread and usually records the spawning parent on it,
so a subagent thread carries its parent's session id exactly as Claude's
sidechain turns do; `--subagents` scopes both the same way. Some early rollouts
are the exception: they mark the thread as a subagent without naming a parent,
so it carries its own id instead and is searchable under that.

## Recipes

```sh
# Is X worth searching for at all, and where does it live?
cg "X" -c
cg "X" -l

# What did I ask about X in the last month?
cg "X" --role human --since 30d --subagents exclude

# What did the agents a session spawned actually do with X?
cg "X" --subagents only

# Jump back into the most relevant past session
cg "X" --resume

# Only sessions from a specific project
cg "X" --cwd myrepo

# Which session touched this file, and when?
cg --tool Edit,Write --file src/format.ts --since 7d

# List the unique sessions that mention X (source included: the id spaces overlap)
cg "X" --json | jq -r '"\(.source) \(.sessionId)"' | sort -u

# Only Codex sessions, user turns carrying text (not tool output)
cg "X" --source codex --role human

# What did a Codex session search the web for?
cg "X" --tool web_search_call,tool_search_call --source codex

# Find the session that discussed X, then read how it started
cg "X" --json | jq -r .sessionId | head -1 | xargs -I{} cg --session {} --role human
```

Counting rather than finding — sessions active per project, edit attempts per
file — is in [Aggregating with jq](#aggregating-with-jq).

## Exit status

`0` when at least one hit is found, `1` when none — including when a root you
named turned out to be unreadable — and `2` on a usage error (following the
`grep` convention).

## How it works

A line that cannot contain the pattern is skipped before it is parsed — the raw
text is tested for a literal the pattern requires, which for a rare term avoids
almost all of the parsing. (A Codex rollout's `session_meta` and `turn_context`
lines are parsed regardless, since every later turn in the file inherits the
`cwd` and session id they carry.) Every line that survives that test is parsed
defensively: unrecognised line shapes and malformed JSON are skipped rather than
crashing the scan, since neither transcript schema is documented and both drift.
Searchable text is pulled from message text, thinking blocks, tool inputs (e.g.
the Bash command run), and tool results.

The rest of this section describes the Claude transcript. A Codex
`custom_tool_call` carries its input as one opaque string rather than a keyed
object, so the shaping below does not apply to it — the line shows the payload as
recorded.

A tool call's arguments become one `key: value` line each, with multi-line
values keeping their real line breaks — so a hit inside a long heredoc shows its
own neighbourhood rather than the whole argument. The tool's name is tagged on
the hit header:

```
~/proj-a  2026-07-30 22:59  22c88264  assistant  [Bash]
  │ >> command: gh pr create --draft --title "…"
  │ …following line of the heredoc…
```

The name is tagged even when the match lands deep enough in an argument that the
call's own header falls outside `-C N`.

An `Edit` renders its two sides as a diff rather than as labelled fields, and
arguments that carry no meaning for the reader (such as `replace_all`) are left
out unless they are what matched:

```
~/proj-a  2026-08-07 23:01  84c616b9  assistant  [Edit]
  │ file_path: .githooks/pre-commit
  │ >> - "$(git rev-parse --show-toplevel)/.githooks/lib/run-gitleaks.sh"
  │ + "$(git rev-parse --show-toplevel)/.githooks/lib/check-external-symlinks.sh"
```

This shaping is display-only: matching runs against the extracted `key: value`
lines, so `old_string:` still finds an edit and `--json` emits those lines
untouched. A pattern is tested per extracted line, so one spanning two arguments
won't match, and `command:` matches every Bash call.

Because extraction keeps a value's newlines but not the record of where they
were, the display layer tells an argument from a line of file content that looks
like one (`port: 80`) heuristically — a known argument name, not yet seen in
that call. An argument is only _hidden_ on the stricter test of also holding
that flag's own value and being the call's first line, since any earlier
argument may itself have run over several lines.

Every tie is broken towards showing the line: a wrong guess never hides one, and
a line that matched always prints. What it can do is carry a `-`/`+` marker onto
lines that are not part of that value. The same rule decides a `⚙` inside a diff
value — transcripts do quote this tool's own output — so a second call opening
there is read as content instead, a shape that is rare in practice.

The scan is a plain linear read, with no index to build or keep fresh, costing
very roughly a second per 300 MB of transcript — dominated by reading the lines
rather than by matching, and on the same order for either source. Both roots are
scanned by default, so the wait follows their combined size; `--source` narrows
it to the corpus you actually mean.

## Requirements

Node.js 22+ — the floor tracks the active LTS line (enforced via the
package's `engines` field); older runtimes are untested. No native
dependencies.

## Development

```
pnpm install
pnpm run build
pnpm start <pattern> [options]   # e.g. `pnpm start -h`, `pnpm start "auth flow"`
```

`pnpm start` runs the built output, so re-run `pnpm run build` after each
source change.

### Checks

```
pnpm run lint            # eslint, prettier, type-check and knip, in parallel
pnpm run fix             # apply the eslint and prettier fixes
pnpm run test            # unit tests (the README recipe tests need `jq` on PATH)
pnpm run test:coverage   # unit tests with a coverage report
```

`pnpm run lint` uses `--continue-on-error`, so one failing check does not hide
the others. Coverage thresholds live in `vitest.config.ts` with `autoUpdate`
enabled: they rise as coverage improves and never fall on their own.

### Git hooks

`lefthook` installs them on `pnpm install`. `pre-commit` runs eslint and
prettier over the staged files, applying their fixes and re-staging what they
changed; `post-merge` reinstalls dependencies or toolchain versions when
`pnpm-lock.yaml` or `mise.toml` changed in the merge.

`lefthook.yml` only points at [`nemolize/lefthook-configs`](https://github.com/nemolize/lefthook-configs),
which holds the steps themselves and is shared across repositories.

### Releasing

Releases run on [Changesets](https://changesets.dev) — no version is edited and
no tag is pushed by hand. Alongside a user-visible change, run:

```
pnpm exec changeset        # pick patch/minor/major, write the summary
```

and commit the file it writes under `.changeset/`. Changes invisible to users
need none — and do not reach for `changeset --empty` to say so: an empty
changeset makes the workflow treat the repo as mid-release and never publish.

Those changesets accumulate on `main` until the release workflow collects them
into a **Version Packages** pull request — a version bump plus `CHANGELOG.md`
entries. That PR is the release: review it, and merging it publishes to npm,
pushes the `v<version>` tag and creates the GitHub Release.

Merge it with `gh pr merge <number> --admin`. GitHub does not trigger workflows
from events its own token created, so `ci.yml` never runs on that PR and `main`'s
required checks stay unreported. The release workflow checks the tree itself
instead — before opening the PR, and again on the merged commit before publishing.

When it goes wrong:

- `pnpm exec changeset version` needs `GITHUB_TOKEN` locally — it resolves pull
  request links through the API.
- A run that publishes to npm and then fails before tagging cannot be recovered
  by re-running: the version is already published, so the next run finds nothing
  to do. Tag and release by hand, using that version's `CHANGELOG.md` section as
  the release body.
- Merge the release PR only once its own workflow run has finished. A changeset
  landing on `main` while that run is still updating the PR leaves the merged
  bump unpublished, and the next release swallows the version.

## License

MIT
