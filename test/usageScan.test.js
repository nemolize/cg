import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { parseArgs } from "../src/args.js";
import { scanUsage } from "../src/usageScan.js";

async function withDirs(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cg-usage-"));
  const claude = join(dir, "claude");
  const codex = join(dir, "codex");
  await mkdir(claude);
  await mkdir(codex);
  try {
    await fn({ claude, codex });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function scan({ claude, codex }, extra = []) {
  const parsed = parseArgs(
    ["--usage", "--root", claude, "--codex-root", codex, ...extra],
    {},
    "/home/u",
  );
  if (parsed.kind !== "options") throw new Error(JSON.stringify(parsed));
  const out = [];
  for await (const event of scanUsage(parsed.options)) out.push(event);
  return out;
}

const write = (dir, name, lines) =>
  writeFile(join(dir, name), lines.join("\n"));

const claudeUsage = (over = {}) => ({
  input_tokens: 1,
  cache_read_input_tokens: 10,
  cache_creation_input_tokens: 100,
  output_tokens: 5,
  ...over,
});

function claudeLine({
  id = "msg_1",
  usage = claudeUsage(),
  stop,
  ...over
} = {}) {
  return JSON.stringify({
    type: "assistant",
    sessionId: "s1",
    version: over.version ?? "2.1.307",
    timestamp: "2026-11-01T00:00:00Z",
    cwd: "/proj",
    message: {
      id,
      usage,
      content: [{ type: "text", text: "x" }],
      ...(stop === undefined ? {} : { stop_reason: stop }),
    },
    ...over,
  });
}

test("a reply from Claude 2.1.306 or older yields its final line's usage, not the placeholders", async () => {
  await withDirs(async (dirs) => {
    await write(dirs.claude, "a.jsonl", [
      claudeLine({
        version: "2.1.306",
        usage: claudeUsage({ output_tokens: 3 }),
      }),
      claudeLine({
        version: "2.1.306",
        usage: claudeUsage({ output_tokens: 8 }),
      }),
      claudeLine({
        version: "2.1.306",
        usage: claudeUsage({ output_tokens: 42, iterations: [{}] }),
        stop: "tool_use",
      }),
    ]);
    const records = await scan(dirs, ["--source", "claude"]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ lineIndex: 2, final: true });
    expect(records[0].usage.outputTokens).toBe(42);
  });
});

test("a reply from Claude 2.1.307 or newer, every line identical, yields one final record", async () => {
  await withDirs(async (dirs) => {
    const same = {
      usage: claudeUsage({ output_tokens: 42, iterations: [{}] }),
      stop: "end_turn",
    };
    await write(dirs.claude, "a.jsonl", [
      claudeLine(same),
      claudeLine(same),
      claudeLine({ ...same, id: "msg_2" }),
    ]);
    const records = await scan(dirs, ["--source", "claude"]);
    expect(
      records.map((r) => [r.messageId, r.final, r.usage.outputTokens]),
    ).toStrictEqual([
      ["msg_1", true, 42],
      ["msg_2", true, 42],
    ]);
  });
});

test("a reply with no final line yields its last line, flagged unfinalised", async () => {
  await withDirs(async (dirs) => {
    await write(dirs.claude, "a.jsonl", [
      claudeLine({ usage: claudeUsage({ output_tokens: 3 }) }),
      "{ malformed",
      claudeLine({ usage: claudeUsage({ output_tokens: 9 }) }),
    ]);
    const [record, ...rest] = await scan(dirs, ["--source", "claude"]);
    expect(rest).toStrictEqual([]);
    expect(record).toMatchObject({ lineIndex: 2, final: false });
    expect(record.usage.outputTokens).toBe(9);
  });
});

test("a message.id in several files counts once, from the smallest path", async () => {
  await withDirs(async (dirs) => {
    const line = (sessionId) =>
      claudeLine({ sessionId, stop: "end_turn", usage: claudeUsage() });
    await write(dirs.claude, "b.jsonl", [line("resumed")]);
    await write(dirs.claude, "a.jsonl", [line("original")]);
    await mkdir(join(dirs.claude, "sub"));
    await write(join(dirs.claude, "sub"), "0.jsonl", [line("deeper")]);
    const records = await scan(dirs, ["--source", "claude"]);
    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toBe("original");
    expect(records[0].file).toBe(join(dirs.claude, "a.jsonl"));
  });
});

test("only files in scope compete for a message.id", async () => {
  await withDirs(async (dirs) => {
    await write(dirs.claude, "a.jsonl", [
      claudeLine({ sessionId: "old", timestamp: "2020-01-01T00:00:00Z" }),
    ]);
    await write(dirs.claude, "b.jsonl", [
      claudeLine({ sessionId: "new", timestamp: "2026-11-01T00:00:00Z" }),
    ]);
    const records = await scan(dirs, [
      "--source",
      "claude",
      "--since",
      "2026-01-01",
    ]);
    expect(records.map((r) => r.sessionId)).toStrictEqual(["new"]);
  });
});

test("scope filters narrow the records and subagents count by default, even under --session", async () => {
  await withDirs(async (dirs) => {
    await write(dirs.claude, "a.jsonl", [
      claudeLine({ id: "m1", cwd: "/proj-a", gitBranch: "feat" }),
      claudeLine({ id: "m2", cwd: "/proj-b", gitBranch: "main" }),
      claudeLine({
        id: "m3",
        cwd: "/proj-a",
        isSidechain: true,
        agentId: "ag",
      }),
    ]);
    const ids = async (extra) =>
      (await scan(dirs, ["--source", "claude", ...extra])).map(
        (r) => r.messageId,
      );
    expect(await ids([])).toStrictEqual(["m1", "m2", "m3"]);
    expect(await ids(["--cwd", "proj-a"])).toStrictEqual(["m1", "m3"]);
    expect(await ids(["--branch", "main"])).toStrictEqual(["m2"]);
    expect(await ids(["--session", "s1"])).toStrictEqual(["m1", "m2", "m3"]);
    expect(await ids(["--subagents", "exclude"])).toStrictEqual(["m1", "m2"]);
    expect(await ids(["--subagents", "only"])).toStrictEqual(["m3"]);
    expect(await ids(["--until", "2026-01-01"])).toStrictEqual([]);
  });
});

const meta = (over = {}) =>
  JSON.stringify({
    timestamp: "2026-11-01T00:00:00Z",
    type: "session_meta",
    payload: { session_id: "sess", id: "thread-1", cwd: "/proj-a", ...over },
  });

const total = (n) => ({ total_tokens: n, input_tokens: n });

const event = (last, totalUsage, ts = "2026-11-01T01:00:00Z", extra = {}) =>
  JSON.stringify({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: { last_token_usage: last, total_token_usage: totalUsage },
      rate_limits: null,
      ...extra,
    },
  });

const call = (n, running, ts) =>
  event(
    { total_tokens: n, input_tokens: n - 1, output_tokens: 1 },
    total(running),
    ts,
  );

test("Codex skips a repeat of the previous event and a null info; the rest sum to the last total", async () => {
  await withDirs(async (dirs) => {
    const first = call(10, 10);
    const second = call(20, 30);
    await write(dirs.codex, "rollout-a.jsonl", [
      meta(),
      first,
      JSON.stringify({
        type: "event_msg",
        payload: { type: "token_count", info: null },
      }),
      first.replace('"rate_limits":null', '"rate_limits":{"primary":1}'),
      second,
      second,
      call(5, 35),
    ]);
    const records = await scan(dirs, ["--source", "codex"]);
    expect(records.map((r) => r.usage.totalTokens)).toStrictEqual([10, 20, 5]);
    expect(records.reduce((sum, r) => sum + r.usage.totalTokens, 0)).toBe(35);
    expect(records[0]).toMatchObject({
      source: "codex",
      sessionId: "sess",
      cwd: "/proj-a",
    });
  });
});

test("an event after a compaction records only totalTokens", async () => {
  await withDirs(async (dirs) => {
    await write(dirs.codex, "rollout-a.jsonl", [
      meta(),
      call(10, 10),
      JSON.stringify({ type: "compacted", payload: { message: "" } }),
      event({ total_tokens: 7 }, total(17)),
    ]);
    const records = await scan(dirs, ["--source", "codex"]);
    expect(records[1].usage).toStrictEqual({ totalTokens: 7 });
    expect(records.reduce((sum, r) => sum + r.usage.totalTokens, 0)).toBe(17);
  });
});

test("a fork's replay of its parent's events is left to the parent, its own events stay", async () => {
  await withDirs(async (dirs) => {
    const shared = [call(10, 10), call(20, 30)];
    await write(dirs.codex, "rollout-parent.jsonl", [
      meta({ id: "parent-thread", session_id: "parent-sess" }),
      ...shared,
    ]);
    await write(dirs.codex, "rollout-child.jsonl", [
      meta({
        id: "child-thread",
        session_id: "child-sess",
        forked_from_id: "parent-thread",
      }),
      meta({ id: "parent-thread", session_id: "parent-sess" }),
      ...shared,
      call(7, 37),
    ]);
    const records = await scan(dirs, ["--source", "codex"]);
    const byFile = (name) =>
      records
        .filter((r) => r.file.endsWith(name))
        .map((r) => r.usage.totalTokens);
    expect(byFile("rollout-parent.jsonl")).toStrictEqual([10, 20]);
    expect(byFile("rollout-child.jsonl")).toStrictEqual([7]);
  });
});

test("a fork whose parent is out of scope keeps the replayed events", async () => {
  await withDirs(async (dirs) => {
    const shared = [call(10, 10, "2026-11-01T01:00:00Z")];
    await write(dirs.codex, "rollout-parent.jsonl", [
      meta({ id: "parent-thread", session_id: "parent-sess" }),
      ...shared,
    ]);
    await write(dirs.codex, "rollout-child.jsonl", [
      meta({
        id: "child-thread",
        session_id: "child-sess",
        forked_from_id: "parent-thread",
      }),
      ...shared,
      call(7, 17),
    ]);
    const records = await scan(dirs, [
      "--source",
      "codex",
      "--session",
      "child-sess",
    ]);
    expect(records.map((r) => r.usage.totalTokens)).toStrictEqual([10, 7]);
  });
});

test("a rollout naming no resolvable parent keeps every event", async () => {
  await withDirs(async (dirs) => {
    await write(dirs.codex, "rollout-a.jsonl", [
      meta({ forked_from_id: "gone" }),
      call(10, 10),
    ]);
    await write(dirs.codex, "rollout-b.jsonl", [
      meta({ id: "thread-b", forked_from_id: "thread-b" }),
      call(20, 20),
    ]);
    await write(dirs.codex, "rollout-c.jsonl", [call(30, 30)]);
    const records = await scan(dirs, ["--source", "codex"]);
    expect(records.map((r) => r.usage.totalTokens)).toStrictEqual([10, 20, 30]);
  });
});

test("both sources stream in one run, an empty root yields nothing", async () => {
  await withDirs(async (dirs) => {
    expect(await scan(dirs)).toStrictEqual([]);
    await write(dirs.claude, "a.jsonl", [claudeLine({ stop: "end_turn" })]);
    await write(dirs.codex, "rollout-a.jsonl", [meta(), call(10, 10)]);
    const records = await scan(dirs);
    expect(records.map((r) => r.source).sort()).toStrictEqual([
      "claude",
      "codex",
    ]);
  });
});

test("rollouts of an older and a newer Codex shape both yield their records", async () => {
  await withDirs(async (dirs) => {
    const older = {
      timestamp: "2026-11-01T01:00:00Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: 9,
            output_tokens: 1,
            total_tokens: 10,
          },
          last_token_usage: {
            input_tokens: 9,
            output_tokens: 1,
            total_tokens: 10,
          },
        },
      },
    };
    const newer = {
      ...older,
      payload: {
        ...older.payload,
        info: {
          ...older.payload.info,
          model_context_window: 258400,
          last_usage_includes_reasoning: true,
        },
        rate_limits: { primary: null },
      },
    };
    await write(dirs.codex, "rollout-old.jsonl", [
      meta({ cli_version: "0.38.0", id: "old" }),
      JSON.stringify(older),
    ]);
    await write(dirs.codex, "rollout-new.jsonl", [
      meta({ cli_version: "0.169.0", id: "new" }),
      JSON.stringify(newer),
    ]);
    const records = await scan(dirs, ["--source", "codex"]);
    expect(records.map((r) => r.usage)).toStrictEqual([
      { inputTokens: 9, outputTokens: 1, totalTokens: 10 },
      { inputTokens: 9, outputTokens: 1, totalTokens: 10 },
    ]);
  });
});
