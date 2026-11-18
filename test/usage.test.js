import { expect, test } from "vitest";

import { newCodexFileState } from "../src/codex.js";
import {
  formatUsageJson,
  isDuplicateCodexEvent,
  isFinalClaudeUsage,
  parseClaudeUsageLine,
  parseCodexUsageLine,
} from "../src/usage.js";

const usage = (over = {}) => ({
  input_tokens: 3,
  cache_read_input_tokens: 100,
  cache_creation_input_tokens: 20,
  output_tokens: 7,
  ...over,
});

function claudeLine(over = {}, message = {}) {
  return JSON.stringify({
    type: "assistant",
    sessionId: "s1",
    timestamp: "2026-11-01T00:00:00Z",
    cwd: "/proj",
    gitBranch: "main",
    message: { id: "msg_1", usage: usage(), ...message },
    ...over,
  });
}

const parseClaude = (line) => parseClaudeUsageLine("/f.jsonl", 4, line);

test("a Claude line maps its usage, summing every input part into inputTokens", () => {
  const parsed = parseClaude(claudeLine());
  expect(parsed.event).toMatchObject({
    file: "/f.jsonl",
    lineIndex: 4,
    source: "claude",
    cwd: "/proj",
    sessionId: "s1",
    gitBranch: "main",
    messageId: "msg_1",
    isSidechain: false,
  });
  expect(parsed.event.usage).toStrictEqual({
    inputTokens: 123,
    cachedInputTokens: 100,
    cacheCreationInputTokens: 20,
    outputTokens: 7,
    totalTokens: 130,
  });
});

test("a Claude line outside the allowlist yields nothing", () => {
  const noId = JSON.stringify({
    type: "assistant",
    message: { usage: usage() },
  });
  const emptyId = claudeLine({}, { id: "" });
  const user = claudeLine({ type: "user" });
  const noUsage = claudeLine({}, { usage: "none" });
  const notObject = JSON.stringify([1]);
  const malformed = '{ "usage": not json';
  for (const line of [noId, emptyId, user, noUsage, notObject, malformed]) {
    expect(parseClaude(line)).toBe(undefined);
  }
  expect(parseClaude(claudeLine({ message: "usage" }))).toBe(undefined);
});

test("a missing or unparseable timestamp leaves the record without one to filter on", () => {
  const absent = parseClaude(claudeLine({ timestamp: undefined })).event;
  expect(absent.timestamp).toBe(undefined);
  expect(absent.timestampMs).toBe(undefined);
  const garbled = parseClaude(claudeLine({ timestamp: "yesterday" })).event;
  expect(garbled.timestamp).toBe("yesterday");
  expect(garbled.timestampMs).toBe(undefined);
});

test("a source field that is missing or not a non-negative integer leaves its key out, never 0", () => {
  const bad = parseClaude(
    claudeLine({}, { usage: { output_tokens: -1, input_tokens: 1.5 } }),
  );
  expect(bad.event.usage).toStrictEqual({});

  const partial = parseClaude(
    claudeLine({}, { usage: { input_tokens: 5, output_tokens: 2 } }),
  );
  expect(partial.event.usage).toStrictEqual({ outputTokens: 2 });

  const stringy = parseClaude(
    claudeLine({}, { usage: usage({ output_tokens: "7" }) }),
  );
  expect(stringy.event.usage.outputTokens).toBe(undefined);
  expect(stringy.event.usage.totalTokens).toBe(undefined);
  expect(stringy.event.usage.inputTokens).toBe(123);
});

test("a final Claude line records a stop reason or per-iteration usage", () => {
  expect(parseClaude(claudeLine()).isFinal).toBe(false);
  expect(parseClaude(claudeLine({}, { stop_reason: "end_turn" })).isFinal).toBe(
    true,
  );
  expect(
    parseClaude(claudeLine({}, { usage: usage({ iterations: [] }) })).isFinal,
  ).toBe(true);
  expect(
    parseClaude(claudeLine({}, { stop_reason: null, usage: usage() })).isFinal,
  ).toBe(false);
  expect(isFinalClaudeUsage({ stop_reason: "tool_use" }, {})).toBe(true);
  expect(isFinalClaudeUsage({}, { iterations: null })).toBe(false);
});

test("a sidechain line names its agent and, when it differs, its parent session", () => {
  const sub = parseClaude(
    claudeLine({ isSidechain: true, agentId: "a1" }),
  ).event;
  const json = JSON.parse(formatUsageJson({ ...sub, final: true }));
  expect(json).toMatchObject({
    isSubagent: true,
    agentId: "a1",
    parentSessionId: "s1",
    messageId: "msg_1",
    final: true,
  });
  const own = JSON.parse(
    formatUsageJson({ ...sub, sessionId: "a1", final: true }),
  );
  expect(own).not.toHaveProperty("parentSessionId");
});

test("the usage record carries no keys of the main-session hit format beyond the documented ones", () => {
  const event = parseClaude(claudeLine()).event;
  const json = JSON.parse(formatUsageJson({ ...event, final: false }));
  expect(Object.keys(json)).toStrictEqual([
    "file",
    "lineIndex",
    "source",
    "cwd",
    "timestamp",
    "sessionId",
    "gitBranch",
    "isSubagent",
    "messageId",
    "final",
    "usage",
  ]);
});

const meta = (over = {}) =>
  JSON.stringify({
    type: "session_meta",
    payload: {
      session_id: "parent-1",
      id: "thread-1",
      cwd: "/proj-a",
      thread_source: "user",
      ...over,
    },
  });

const tokenCount = (info, over = {}) =>
  JSON.stringify({
    timestamp: "2026-11-01T01:00:00Z",
    type: "event_msg",
    payload: { type: "token_count", info, rate_limits: null, ...over },
  });

const info = (last, total = { total_tokens: 100 }) => ({
  last_token_usage: last,
  total_token_usage: total,
});

const fullLast = {
  input_tokens: 50,
  cached_input_tokens: 30,
  cache_write_input_tokens: 4,
  output_tokens: 9,
  reasoning_output_tokens: 6,
  total_tokens: 59,
};

function parseCodexLines(lines) {
  const state = newCodexFileState();
  return lines.map((line, i) =>
    parseCodexUsageLine("/r.jsonl", i, line, state),
  );
}

test("a Codex token_count maps last_token_usage and takes the rollout's session fields", () => {
  const [metaResult, event] = parseCodexLines([
    meta(),
    tokenCount(info(fullLast)),
  ]);
  expect(metaResult).toBe(undefined);
  expect(event.event).toMatchObject({
    source: "codex",
    cwd: "/proj-a",
    sessionId: "parent-1",
    timestamp: "2026-11-01T01:00:00Z",
    isSidechain: false,
    lineIndex: 1,
  });
  expect(event.event.usage).toStrictEqual({
    inputTokens: 50,
    cachedInputTokens: 30,
    cacheCreationInputTokens: 4,
    outputTokens: 9,
    reasoningOutputTokens: 6,
    totalTokens: 59,
  });
  expect(event.event).not.toHaveProperty("messageId");
});

test("a Codex subagent rollout reports its thread as the agent", () => {
  const [, event] = parseCodexLines([
    meta({ thread_source: "subagent" }),
    tokenCount(info(fullLast)),
  ]);
  expect(event.event).toMatchObject({
    isSidechain: true,
    agentId: "thread-1",
  });
});

test("a Codex line outside the allowlist yields nothing", () => {
  const lines = [
    meta(),
    tokenCount(null),
    tokenCount({ last_token_usage: fullLast }),
    tokenCount({ total_token_usage: {}, last_token_usage: "x" }),
    tokenCount(info(fullLast), { type: "other" }),
    JSON.stringify({ type: "response_item", payload: { type: "token_count" } }),
    JSON.stringify({ type: "event_msg", payload: "token_count" }),
    '"token_count" { not json',
    '["token_count"]',
  ];
  expect(parseCodexLines(lines).slice(1)).toStrictEqual(
    Array(lines.length - 1).fill(undefined),
  );
});

test("an event after compaction keeps only the fields it records", () => {
  const [, event] = parseCodexLines([
    meta(),
    tokenCount(info({ total_tokens: 1234 })),
  ]);
  expect(event.event.usage).toStrictEqual({ totalTokens: 1234 });
});

test("two Codex events are duplicates only when the whole info is equal, whatever the key order", () => {
  const [, a, reordered, other, rateLimitOnly] = parseCodexLines([
    meta(),
    tokenCount(info(fullLast)),
    tokenCount({
      total_token_usage: { total_tokens: 100 },
      last_token_usage: Object.fromEntries(Object.entries(fullLast).reverse()),
    }),
    tokenCount(info({ ...fullLast, output_tokens: 10 })),
    tokenCount(info(fullLast), { rate_limits: { primary: 1 } }),
  ]);
  expect(isDuplicateCodexEvent(a.infoKey, reordered.infoKey)).toBe(true);
  expect(isDuplicateCodexEvent(a.infoKey, other.infoKey)).toBe(false);
  expect(isDuplicateCodexEvent(a.infoKey, rateLimitOnly.infoKey)).toBe(true);
  expect(isDuplicateCodexEvent(undefined, a.infoKey)).toBe(false);
});

test("an array inside info compares by content, with nested keys in any order", () => {
  const withList = (entry) =>
    tokenCount({ ...info(fullLast), credits: [entry, null, 1] });
  const [, a, b, c] = parseCodexLines([
    meta(),
    withList({ x: 1, y: 2 }),
    withList({ y: 2, x: 1 }),
    withList({ x: 1, y: 3 }),
  ]);
  expect(a.infoKey).toBe(b.infoKey);
  expect(a.infoKey).not.toBe(c.infoKey);
});

test("a Codex record carries no final or messageId key", () => {
  const [, event] = parseCodexLines([meta(), tokenCount(info(fullLast))]);
  const json = JSON.parse(formatUsageJson(event.event));
  expect(json).not.toHaveProperty("final");
  expect(json).not.toHaveProperty("messageId");
  expect(json.usage.reasoningOutputTokens).toBe(6);
});
