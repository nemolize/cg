import { newCodexFileState } from "./codex.js";
import { passesFilters } from "./filters.js";
import { findTranscripts, readJsonlLines } from "./loader.js";
import type { Options, ResolvedRoot, Turn } from "./types.js";
import {
  type CodexUsageLine,
  isDuplicateCodexEvent,
  parseClaudeUsageLine,
  parseCodexUsageLine,
  type UsageEvent,
} from "./usage.js";

function inScope(event: UsageEvent, opts: Options): boolean {
  const turn: Turn = {
    file: event.file,
    lineIndex: event.lineIndex,
    source: event.source,
    role: "assistant",
    sessionId: event.sessionId,
    timestamp: event.timestamp,
    timestampMs: event.timestampMs,
    cwd: event.cwd,
    gitBranch: event.gitBranch,
    isMeta: false,
    isSidechain: event.isSidechain,
    agentId: event.agentId,
    textLines: [],
    toolCalls: [],
    toolResults: [],
    contentKinds: [],
  };
  return passesFilters(turn, opts);
}

async function* scanClaude(
  root: ResolvedRoot,
  opts: Options,
): AsyncGenerator<UsageEvent> {
  const byMessage = new Map<string, UsageEvent>();
  for await (const file of findTranscripts(root.path)) {
    const replies = new Map<
      string,
      { final?: UsageEvent | undefined; last: UsageEvent }
    >();
    for await (const { lineIndex, line } of readJsonlLines(file)) {
      const parsed = parseClaudeUsageLine(file, lineIndex, line);
      if (parsed === undefined) continue;
      const reply = replies.get(parsed.messageId);
      const final = parsed.isFinal ? parsed.event : reply?.final;
      replies.set(parsed.messageId, { final, last: parsed.event });
    }
    for (const [id, { final, last }] of replies) {
      const chosen: UsageEvent =
        final === undefined
          ? { ...last, final: false }
          : { ...final, final: true };
      if (!inScope(chosen, opts)) continue;
      const kept = byMessage.get(id);
      if (kept === undefined || file < kept.file) byMessage.set(id, chosen);
    }
  }
  yield* byMessage.values();
}

async function findForkParents(files: string[]): Promise<Map<string, string>> {
  const fileByThread = new Map<string, string>();
  const forkedFrom = new Map<string, string>();
  for (const file of files) {
    const state = newCodexFileState();
    for await (const { lineIndex, line } of readJsonlLines(file)) {
      parseCodexUsageLine(file, lineIndex, line, state);
      if (state.sessionId !== undefined) break;
    }
    if (state.threadId !== undefined) fileByThread.set(state.threadId, file);
    if (state.forkedFromId !== undefined)
      forkedFrom.set(file, state.forkedFromId);
  }
  const parents = new Map<string, string>();
  for (const [file, parentThread] of forkedFrom) {
    const parent = fileByThread.get(parentThread);
    if (parent !== undefined && parent !== file) parents.set(file, parent);
  }
  return parents;
}

async function* codexEvents(
  file: string,
): AsyncGenerator<{ event: UsageEvent; infoKey: string; duplicate: boolean }> {
  const state = newCodexFileState();
  let previousKey: string | undefined;
  for await (const { lineIndex, line } of readJsonlLines(file)) {
    const parsed: CodexUsageLine | undefined = parseCodexUsageLine(
      file,
      lineIndex,
      line,
      state,
    );
    if (parsed === undefined) continue;
    const duplicate = isDuplicateCodexEvent(previousKey, parsed.infoKey);
    previousKey = parsed.infoKey;
    yield { ...parsed, duplicate };
  }
}

async function inScopeInfoKeys(
  file: string,
  opts: Options,
): Promise<Set<string>> {
  const keys = new Set<string>();
  for await (const { event, infoKey } of codexEvents(file)) {
    if (inScope(event, opts)) keys.add(infoKey);
  }
  return keys;
}

/**
 * A fork replays its parent's events ahead of its own, so an event whose whole
 * `info` is in the parent's in-scope events is the parent's to report.
 */
async function* scanCodex(
  root: ResolvedRoot,
  opts: Options,
): AsyncGenerator<UsageEvent> {
  const files: string[] = [];
  for await (const file of findTranscripts(root.path)) files.push(file);

  const parentOf = await findForkParents(files);
  const parentKeys = new Map<string, Set<string>>();
  for (const parent of new Set(parentOf.values())) {
    parentKeys.set(parent, await inScopeInfoKeys(parent, opts));
  }

  for (const file of files) {
    const parent = parentOf.get(file);
    const replayed = parent === undefined ? undefined : parentKeys.get(parent);
    for await (const { event, infoKey, duplicate } of codexEvents(file)) {
      if (duplicate || !inScope(event, opts)) continue;
      if (replayed?.has(infoKey) === true) continue;
      yield event;
    }
  }
}

export async function* scanUsage(opts: Options): AsyncGenerator<UsageEvent> {
  for (const [source, root] of opts.roots) {
    yield* source === "claude" ? scanClaude(root, opts) : scanCodex(root, opts);
  }
}
