import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { findTranscripts, isReadableDir, loadTurns } from "../src/loader.js";

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "cg-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("loadTurns parses user/assistant lines and skips others", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    const lines = [
      JSON.stringify({ type: "queue-operation", operation: {} }),
      JSON.stringify({ type: "summary", summary: "x" }),
      JSON.stringify({
        type: "user",
        sessionId: "sess-1",
        timestamp: "2026-07-10T00:00:00Z",
        cwd: "/proj",
        gitBranch: "main",
        message: { content: "hello world" },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-1",
        timestamp: "2026-07-10T00:01:00Z",
        message: { content: [{ type: "text", text: "hi back" }] },
      }),
      "{ this is not valid json",
      "",
    ];
    await writeFile(file, lines.join("\n"));

    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);

    expect(turns.length).toBe(2);
    expect(turns[0].role).toBe("user");
    expect(turns[0].sessionId).toBe("sess-1");
    expect(turns[0].cwd).toBe("/proj");
    expect(turns[0].textLines).toEqual(["hello world"]);
    expect(turns[0].timestampMs).toBe(Date.parse("2026-07-10T00:00:00Z"));
    expect(turns[1].role).toBe("assistant");
    expect(turns[1].textLines).toEqual(["hi back"]);
    expect(turns[1].toolCalls).toEqual([]);
  });
});

test("loadTurns carries a line's tool calls onto the turn", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    await writeFile(
      file,
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-1",
        timestamp: "2026-07-10T00:00:00Z",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Edit",
              input: { file_path: "/proj/a.ts", old_string: "x" },
            },
          ],
        },
      }),
    );

    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);

    expect(turns[0].toolCalls).toEqual([
      {
        name: "Edit",
        paths: ["/proj/a.ts"],
        input: { file_path: "/proj/a.ts", old_string: "x" },
      },
    ]);
  });
});

test("loadTurns tolerates missing optional fields", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    await writeFile(
      file,
      JSON.stringify({ type: "user", message: { content: "bare" } }) + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns.length).toBe(1);
    expect(turns[0].sessionId).toBe(undefined);
    expect(turns[0].timestampMs).toBe(undefined);
    expect(turns[0].isMeta).toBe(false);
    expect(turns[0].isSidechain).toBe(false);
    expect(turns[0].origin).toBe(undefined);
    expect(turns[0].turnOrigin).toBe(undefined);
  });
});

test("loadTurns reads origin.kind and turnOrigin, ignoring non-string values", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    const line = (extra) =>
      JSON.stringify({ type: "user", message: { content: "x" }, ...extra });
    await writeFile(
      file,
      [
        line({ origin: { kind: "plugin" }, turnOrigin: "system" }),
        line({ turnOrigin: "scheduled" }),
        line({ origin: { kind: 3 }, turnOrigin: { kind: "human" } }),
        line({ origin: "human" }),
      ].join("\n") + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns.map((t) => [t.origin, t.turnOrigin])).toEqual([
      ["plugin", "system"],
      [undefined, "scheduled"],
      [undefined, undefined],
      [undefined, undefined],
    ]);
  });
});

test("loadTurns reads message.id as messageId, ignoring a non-string id and a non-record message", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    const line = (message) => JSON.stringify({ type: "assistant", message });
    await writeFile(
      file,
      [
        line({ id: "msg_a", content: "x" }),
        line({ id: 7, content: "x" }),
        line({ content: "x" }),
        line("x"),
      ].join("\n") + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns.map((t) => t.messageId)).toEqual([
      "msg_a",
      undefined,
      undefined,
    ]);
  });
});

test("loadTurns carries isSidechain and agentId through", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    await writeFile(
      file,
      JSON.stringify({
        type: "user",
        isSidechain: true,
        agentId: "a0d4d2d0b4abed822",
        message: { content: "from a subagent" },
      }) + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns[0].isSidechain).toBe(true);
    expect(turns[0].agentId).toBe("a0d4d2d0b4abed822");
  });
});

test("agentId is undefined when the field is absent or not a string", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    await writeFile(
      file,
      JSON.stringify({ type: "user", message: { content: "main" } }) +
        "\n" +
        JSON.stringify({
          type: "user",
          agentId: null,
          message: { content: "main" },
        }) +
        "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns[0].agentId).toBe(undefined);
    expect(turns[1].agentId).toBe(undefined);
  });
});

test("loadTurns on a missing file yields nothing (no throw)", async () => {
  const turns = [];
  for await (const t of loadTurns("/does/not/exist.jsonl")) turns.push(t);
  expect(turns.length).toBe(0);
});

test("findTranscripts recurses and only yields .jsonl", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "a", "b"), { recursive: true });
    await writeFile(join(dir, "a", "one.jsonl"), "");
    await writeFile(join(dir, "a", "b", "two.jsonl"), "");
    await writeFile(join(dir, "a", "note.txt"), "");

    const found = [];
    for await (const f of findTranscripts(dir)) found.push(f);
    expect(found.length).toBe(2);
    const names = found.map((f) => f.split("/").pop()).sort();
    expect(names).toEqual(["one.jsonl", "two.jsonl"]);
  });
});

test("findTranscripts does not follow symlinks (loop-safe)", async () => {
  await withTempDir(async (dir) => {
    await mkdir(join(dir, "real"), { recursive: true });
    await writeFile(join(dir, "real", "r.jsonl"), "");
    // A dir symlink back to the root would recurse forever if followed.
    await symlink(dir, join(dir, "real", "loop"));
    // A file symlink to a .jsonl is also skipped (conservative default).
    await symlink(
      join(dir, "real", "r.jsonl"),
      join(dir, "real", "link.jsonl"),
    );

    const found = [];
    for await (const f of findTranscripts(dir)) found.push(f);
    const names = found.map((f) => f.split("/").pop()).sort();
    expect(names).toEqual(["r.jsonl"]);
  });
});

test("findTranscripts on a missing root yields nothing", async () => {
  const found = [];
  for await (const f of findTranscripts("/no/such/root")) found.push(f);
  expect(found.length).toBe(0);
});

// An unreadable root is reported as an error rather than as no hits, so the
// check has to reach the permission bit `findTranscripts` would trip over.
test("isReadableDir is false for a directory that cannot be read", async () => {
  await withTempDir(async (dir) => {
    const locked = join(dir, "locked");
    await mkdir(locked);
    await chmod(locked, 0o000);
    try {
      expect(await isReadableDir(locked)).toBe(false);
    } finally {
      await chmod(locked, 0o755);
    }
  });
});

test("isReadableDir true for dir, false for missing", async () => {
  await withTempDir(async (dir) => {
    expect(await isReadableDir(dir)).toBe(true);
    expect(await isReadableDir(join(dir, "nope"))).toBe(false);
  });
});

test("a Claude call and its result on separate lines join on id", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    await writeFile(
      file,
      [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "toolu_9", name: "Bash", input: {} },
            ],
          },
        }),
        JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_9",
                is_error: true,
                content: "denied",
              },
            ],
          },
        }),
      ].join("\n"),
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns[0].toolCalls[0].id).toBe("toolu_9");
    expect(turns[1].toolResults).toStrictEqual([
      { callId: "toolu_9", isError: true },
    ]);
  });
});

test("a Claude line whose only block is an empty tool_result is kept; one with neither text nor result is dropped", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    await writeFile(
      file,
      [
        JSON.stringify({
          type: "user",
          message: {
            content: [{ type: "tool_result", tool_use_id: "t", content: "" }],
          },
        }),
        JSON.stringify({ type: "user", message: { content: [] } }),
        JSON.stringify({
          type: "user",
          message: { content: [{ type: "image" }] },
        }),
      ].join("\n"),
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns).toHaveLength(1);
    expect(turns[0].lineIndex).toBe(0);
    expect(turns[0].textLines).toEqual([]);
    expect(turns[0].toolResults).toStrictEqual([
      { callId: "t", isError: null },
    ]);
  });
});

test("loadTurns flags only a plain-string forwarded envelope at the very start of a user line", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    const head = "Another Claude session sent a message:";
    const line = (content, type = "user") =>
      JSON.stringify({ type, message: { content } });
    const cases = [
      [
        `${head}\n<teammate-message teammate_id="x">\nhi\n</teammate-message>`,
        true,
      ],
      [`${head}\r\n<agent-message from="a">\nhi`, true],
      [`${head}\n<cross-session-message from="u">\nhi`, true],
      [`${head}\n<teammate-message>\nhi`, true],
      [`  ${head}\n<teammate-message>`, false],
      [`${head}\nplain text`, false],
      [`${head}\n<teammate-messages>`, false],
      [`${head}\n<other-message>`, false],
      [`note\n${head}\n<teammate-message>`, false],
      ['<teammate-message teammate_id="team-lead">\nhi', false],
    ];
    await writeFile(
      file,
      [
        ...cases.map(([text]) => line(text)),
        line([{ type: "text", text: `${head}\n<teammate-message>` }]),
        line(`${head}\n<teammate-message>`, "assistant"),
      ].join("\n") + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns.map((t) => t.isInjectedText)).toEqual([
      ...cases.map(([, flagged]) => flagged),
      false,
      false,
    ]);
  });
});

test("loadTurns flags an interrupt marker only as the single text block of a user line, matched exactly", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    const user = "[Request interrupted by user]";
    const tool = "[Request interrupted by user for tool use]";
    const text = (t) => ({ type: "text", text: t });
    const line = (content, type = "user") =>
      JSON.stringify({ type, message: { content } });
    const cases = [
      [[text(user)], true],
      [[text(tool)], true],
      [[text(`${user} please continue`)], false],
      [[text(` ${user}`)], false],
      [[text(`${user}\n`)], false],
      [[text(user.toLowerCase())], false],
      [[text(user), text("more")], false],
      [[{ type: "tool_result", content: user }], false],
      [[{ type: "tool_result", text: user }], false],
      [user, false],
    ];
    await writeFile(
      file,
      [
        ...cases.map(([content]) => line(content)),
        line([text(user)], "assistant"),
      ].join("\n") + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns.map((t) => t.isInjectedText)).toEqual([
      ...cases.map(([, flagged]) => flagged),
      false,
    ]);
  });
});

test("loadTurns flags a local-command record only when the whole string is one of its forms", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    const command = (args, name = "/clear") =>
      `<command-name>${name}</command-name>\n            <command-message>${name.slice(1)}</command-message>\n            <command-args>${args}</command-args>`;
    const out = (tag, body = "done") => `<${tag}>${body}</${tag}>`;
    const cases = [
      [out("local-command-stdout"), true],
      [out("local-command-stderr", "boom\nmore"), true],
      [out("local-command-stdout", ""), true],
      [command(""), true],
      [command("", "/mcp").replaceAll("\n            ", ""), true],
      [command("why did this fail?"), false],
      [out("bash-input", " railway login"), false],
      [`see ${out("local-command-stdout")}`, false],
      [`${out("local-command-stdout")} thanks`, false],
      [`${out("local-command-stdout")}\n`, false],
      [out("local-command-stdout") + out("local-command-stdout"), false],
      [`${command("")}\nextra`, false],
      [command("").replace("<command-args></command-args>", ""), false],
      [command("").replace("/clear", "<b>"), false],
      [out("bash-stdout", "ok"), false],
    ];
    const text = (t) => ({ type: "text", text: t });
    await writeFile(
      file,
      [
        ...cases.map(([content]) =>
          JSON.stringify({ type: "user", message: { content } }),
        ),
        JSON.stringify({
          type: "user",
          message: { content: [text(out("local-command-stdout"))] },
        }),
        JSON.stringify({
          type: "assistant",
          message: { content: out("local-command-stdout") },
        }),
      ].join("\n") + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns.map((t) => t.isInjectedText)).toEqual([
      ...cases.map(([, flagged]) => flagged),
      false,
      false,
    ]);
  });
});

test("loadTurns flags a `!` output record only when the whole string is one bash-stdout element, optionally followed by one bash-stderr", async () => {
  await withTempDir(async (dir) => {
    const file = join(dir, "s.jsonl");
    const out = (tag, body = "done") => `<${tag}>${body}</${tag}>`;
    const cases = [
      [out("bash-stdout", "ok"), true],
      [out("bash-stdout", ""), true],
      [out("bash-stdout", "a\nb"), true],
      [out("bash-stdout", "ok") + out("bash-stderr", ""), true],
      [out("bash-stdout", "ok") + out("bash-stderr", "warn"), true],
      [out("bash-input", " railway login"), false],
      [out("bash-stderr", "alone"), false],
      [out("bash-stderr", "x") + out("bash-stdout", "y"), false],
      [out("bash-stdout", "a") + out("bash-stdout", "b"), false],
      [`see ${out("bash-stdout", "ok")}`, false],
      [`${out("bash-stdout", "ok")} thanks`, false],
      [`${out("bash-stdout", "ok")}\n`, false],
      [out("bash-stdout", "ok") + "\n" + out("bash-stderr", "warn"), false],
      [out("local-command-stdout"), false],
    ];
    const text = (t) => ({ type: "text", text: t });
    await writeFile(
      file,
      [
        ...cases.map(([content]) =>
          JSON.stringify({ type: "user", message: { content } }),
        ),
        JSON.stringify({
          type: "user",
          message: { content: [text(out("bash-stdout", "ok"))] },
        }),
        JSON.stringify({
          type: "assistant",
          message: { content: out("bash-stdout", "ok") },
        }),
      ].join("\n") + "\n",
    );
    const turns = [];
    for await (const t of loadTurns(file)) turns.push(t);
    expect(turns.map((t) => t.isBashOutput)).toEqual([
      ...cases.map(([, flagged]) => flagged),
      false,
      false,
    ]);
  });
});
