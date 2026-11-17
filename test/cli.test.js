import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repoRoot, "dist", "cli.js");

// The roots default off $HOME, so a test that does not name one would read the
// developer's own transcripts and its result would vary per machine.
function cliEnv(env) {
  return { ...process.env, HOME: "/nonexistent-home", ...env };
}

function runCli(args, env) {
  if (!existsSync(cliPath)) {
    throw new Error(`${cliPath} not found — run \`pnpm run build\` first`);
  }
  return execFileSync("node", [cliPath, ...args], {
    encoding: "utf8",
    env: cliEnv(env),
  });
}

function spawnCli(args, env) {
  return spawnSync("node", [cliPath, ...args, "--color", "never"], {
    encoding: "utf8",
    env: cliEnv(env),
  });
}

test("--version reports the version in package.json", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  expect(runCli(["--version"]).trim()).toBe(pkg.version);
});

function withCorpus(fn) {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-"));
  const turn = (sessionId, cwd) =>
    JSON.stringify({
      type: "user",
      sessionId,
      timestamp: "2026-07-13T00:00:00Z",
      cwd,
      message: { content: "a needle here" },
    });
  writeFileSync(
    join(dir, "a.jsonl"),
    [turn("aaaaaaaa-1111-2222-3333-444444444444", "/proj-a")].join("\n"),
  );
  writeFileSync(
    join(dir, "b.jsonl"),
    [
      turn("bbbbbbbb-1111-2222-3333-444444444444", "/proj-b"),
      turn("bbbbbbbb-1111-2222-3333-444444444444", "/proj-b"),
    ].join("\n"),
  );
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("--count prints the hit total instead of the hits", () => {
  withCorpus((root) => {
    const out = runCli(["needle", "--root", root, "-c"]);
    expect(out.trim()).toBe("3");
    expect(out).not.toContain("needle here");
  });
});

test("--list-sessions prints one line per session with full ids", () => {
  withCorpus((root) => {
    const lines = runCli(["needle", "--root", root, "-l", "--color", "never"])
      .trim()
      .split("\n");
    expect(lines.length).toBe(2);
    // Ranked by hits, not discovery order: b.jsonl has 2, a.jsonl has 1.
    expect(lines[0]).toContain("bbbbbbbb-1111-2222-3333-444444444444");
    expect(lines[0]).toContain("2 hits");
    expect(lines[1]).toContain("aaaaaaaa-1111-2222-3333-444444444444");
    expect(lines[1]).toContain("1 hit");
  });
});

test("--max-count caps the rendered hits", () => {
  withCorpus((root) => {
    const out = runCli([
      "needle",
      "--root",
      root,
      "-m",
      "1",
      "--color",
      "never",
    ]);
    expect(out.match(/needle here/g).length).toBe(1);
  });
});

test("--json pairs with the summary flags", () => {
  withCorpus((root) => {
    expect(
      JSON.parse(runCli(["needle", "--root", root, "-c", "--json"])),
    ).toEqual({ hits: 3 });

    const rows = runCli(["needle", "--root", root, "-l", "--json"])
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({
      source: "claude",
      sessionId: "bbbbbbbb-1111-2222-3333-444444444444",
      hits: 2,
      cwd: "/proj-b",
    });
  });
});

test("summary --json omits absent keys, matching the per-hit shape", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-noid-"));
  try {
    writeFileSync(
      join(dir, "a.jsonl"),
      JSON.stringify({
        type: "user",
        timestamp: "2026-07-13T00:00:00Z",
        message: { content: "a needle here" },
      }),
    );
    const row = JSON.parse(
      runCli(["needle", "--root", dir, "-l", "--json"]).trim(),
    );
    // `null` would be a second absent-value convention; formatHitJson drops the key.
    expect("sessionId" in row).toBe(false);
    expect("cwd" in row).toBe(false);
    expect(row.hits).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("sessionless turns in different files stay separate sessions", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-split-"));
  try {
    const turn = JSON.stringify({
      type: "user",
      timestamp: "2026-07-13T00:00:00Z",
      message: { content: "a needle here" },
    });
    writeFileSync(join(dir, "a.jsonl"), turn);
    writeFileSync(join(dir, "b.jsonl"), turn);
    const rows = runCli(["needle", "--root", dir, "-l", "--json"])
      .trim()
      .split("\n");
    // A shared "?" key would collapse these into one fake 2-hit session.
    expect(rows.length).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--max-count notes on stderr that it capped", () => {
  withCorpus((root) => {
    const capped = spawnCli(["needle", "--root", root, "-m", "1"]);
    expect(capped.stderr).toContain("--max-count");

    // Uncapped runs must stay quiet, or the note becomes noise on every search.
    const uncapped = spawnCli(["needle", "--root", root]);
    expect(uncapped.stderr).toBe("");
  });
});

test("-c and -m compose: the count reports the capped total", () => {
  withCorpus((root) => {
    expect(runCli(["needle", "--root", root, "-c", "-m", "2"]).trim()).toBe(
      "2",
    );
  });
});

test("--session composes with -c", () => {
  withCorpus((root) => {
    const out = runCli([
      "--session",
      "bbbbbbbb-1111-2222-3333-444444444444",
      "--root",
      root,
      "-c",
    ]);
    expect(out.trim()).toBe("2");
  });
});

test.each([
  ["--resume", "-c"],
  ["--print-resume", "-c"],
  ["--resume", "-l"],
  ["--print-resume", "-l"],
])("%s with %s is a usage error, not silently ignored", (resume, summary) => {
  withCorpus((root) => {
    expect(() => runCli(["needle", "--root", root, summary, resume])).toThrow(
      expect.objectContaining({ status: 2 }),
    );
  });
});

test("a summary with no hits still exits 1, like a search", () => {
  withCorpus((root) => {
    expect(() => runCli(["nomatch", "--root", root, "-c"])).toThrow(
      expect.objectContaining({ status: 1 }),
    );
  });
});

// One agent per machine is the normal case, so the absent root is not an error
// — but the run must still search the one that is there.
test("a defaulted root that does not exist is skipped, not fatal", () => {
  withCorpus((root) => {
    expect(runCli(["needle", "-c"], { CG_ROOT: root }).trim()).toBe("3");
  });
});

// Distinct from the row above: the user named this path, so silently searching
// the other source would answer a question they did not ask.
test("a named root that does not exist is an error, even when the other is readable", () => {
  withCorpus((root) => {
    expect(() =>
      runCli(["needle", "-c"], {
        CG_ROOT: root,
        CG_CODEX_ROOT: "/nonexistent-codex-root",
      }),
    ).toThrow(expect.objectContaining({ status: 1 }));
  });
});

// A stale CG_CODEX_ROOT in a shell profile otherwise surfaces as a bare
// path, leaving the reader to guess which of three places set it.
test("the error names what set an unreadable root, and how to fix it", () => {
  let err;
  try {
    runCli(["needle", "-c"], { CG_CODEX_ROOT: "/nonexistent-codex" });
  } catch (e) {
    err = e;
  }
  expect(err.status).toBe(1);
  expect(err.stderr).toContain('"/nonexistent-codex" (CG_CODEX_ROOT)');
  expect(err.stderr).toContain("Set --root");
});

// Silence here reads as "Codex has none of these" when the truth is that the
// filter cannot ask Codex at all.
test("a Claude-only filter says so when a Codex root is in scope", () => {
  withCorpus((root) => {
    const codexDir = mkdtempSync(join(tmpdir(), "cg-cli-cx-"));
    try {
      const run = spawnCli(["needle", "--file", "src", "-c"], {
        CG_ROOT: root,
        CG_CODEX_ROOT: codexDir,
      });
      expect(run.stderr).toContain("--file");
      expect(run.stderr).toContain("Claude only");
    } finally {
      rmSync(codexDir, { recursive: true, force: true });
    }
  });
});

test("the notice stays quiet when no Codex root is in scope", () => {
  withCorpus((root) => {
    const run = spawnCli([
      "needle",
      "--file",
      "src",
      "--root",
      root,
      "--source",
      "claude",
      "-c",
    ]);
    expect(run.stderr).toBe("");
  });
});

test("every root missing names them all", () => {
  let err;
  try {
    runCli(["needle", "-c"], {
      CG_ROOT: "/nonexistent-a",
      CG_CODEX_ROOT: "/nonexistent-b",
    });
  } catch (e) {
    err = e;
  }
  expect(err.status).toBe(1);
  expect(err.stderr).toContain("/nonexistent-a");
  expect(err.stderr).toContain("/nonexistent-b");
});

test("a codex root is searched under the codex schema end to end", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-codex-"));
  try {
    writeFileSync(
      join(dir, "rollout-2026-07-13T00-00-00-t1.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-07-13T00:00:00Z",
          type: "session_meta",
          payload: {
            session_id: "cx-1",
            id: "cx-1",
            cwd: "/cx-proj",
            thread_source: "user",
          },
        }),
        JSON.stringify({
          timestamp: "2026-07-13T00:01:00Z",
          type: "response_item",
          payload: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "a needle here" }],
          },
        }),
      ].join("\n"),
    );
    const rows = runCli([
      "needle",
      "--source",
      "codex",
      "--codex-root",
      dir,
      "-l",
      "--json",
    ])
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toEqual([
      { source: "codex", sessionId: "cx-1", hits: 1, cwd: "/cx-proj" },
    ]);
    expect(
      runCli([
        "needle",
        "--source",
        "codex",
        "--codex-root",
        dir,
        "-m",
        "1",
        "--print-resume",
      ]),
    ).toContain("codex resume cx-1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a codex open_page url is searchable end to end", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-codex-url-"));
  try {
    writeFileSync(
      join(dir, "rollout-2026-07-13T00-00-00-t1.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-07-13T00:00:00Z",
          type: "session_meta",
          payload: {
            session_id: "cx-1",
            id: "cx-1",
            cwd: "/cx-proj",
            thread_source: "user",
          },
        }),
        JSON.stringify({
          timestamp: "2026-07-13T00:01:00Z",
          type: "response_item",
          payload: {
            type: "web_search_call",
            action: { type: "open_page", url: "https://x.test/needle-page" },
          },
        }),
      ].join("\n"),
    );
    const out = runCli([
      "x.test/needle",
      "--source",
      "codex",
      "--codex-root",
      dir,
      "--color",
      "never",
    ]);
    expect(out).toContain("url: https://x.test/needle-page");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--json carries a tool call's input in full, on a hit and in a --session dump", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-"));
  const long = "x".repeat(100_000);
  const input = { command: `echo needle ${long}`, nested: { big: long } };
  const sessionId = "cccccccc-1111-2222-3333-444444444444";
  writeFileSync(
    join(dir, "c.jsonl"),
    JSON.stringify({
      type: "assistant",
      sessionId,
      timestamp: "2026-07-13T00:00:00Z",
      cwd: "/proj-c",
      message: { content: [{ type: "tool_use", name: "Bash", input }] },
    }),
  );
  try {
    for (const args of [
      ["needle", "--root", dir, "--json"],
      ["--session", sessionId, "--root", dir, "--json"],
    ]) {
      const rows = runCli(args)
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(rows).toHaveLength(1);
      expect(rows[0].toolCalls[0].input).toStrictEqual(input);
      expect(rows[0].toolCalls[0].input.nested.big).toBe(long);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--json links results to calls, and an empty result is searchable only without a pattern", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-"));
  const sessionId = "dddddddd-1111-2222-3333-444444444444";
  const line = (type, content) =>
    JSON.stringify({
      type,
      sessionId,
      timestamp: "2026-07-13T00:00:00Z",
      cwd: "/proj-d",
      message: { content },
    });
  writeFileSync(
    join(dir, "d.jsonl"),
    [
      line("assistant", [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "Bash",
          input: { command: "x" },
        },
      ]),
      line("user", [
        {
          type: "tool_result",
          tool_use_id: "toolu_1",
          is_error: true,
          content: "",
        },
      ]),
    ].join("\n"),
  );
  try {
    const parse = (args) =>
      runCli(args)
        .trim()
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => JSON.parse(l));

    const dump = parse(["--session", sessionId, "--root", dir, "--json"]);
    expect(dump).toHaveLength(2);
    expect(dump[0].toolCalls[0].id).toBe("toolu_1");
    expect(dump[1].toolResults).toStrictEqual([
      { callId: "toolu_1", isError: true },
    ]);
    expect(dump[1].toolCalls).toBeUndefined();
    expect(dump[0].toolResults).toBeUndefined();

    expect(parse(["--tool", "Bash", "--root", dir, "--json"])).toHaveLength(1);
    expect(parse(["command", "--root", dir, "--json"])).toHaveLength(1);
    expect(runCli(["--session", sessionId, "--root", dir, "-c"]).trim()).toBe(
      "2",
    );

    const text = runCli([
      "--session",
      sessionId,
      "--root",
      dir,
      "--color",
      "never",
    ]);
    expect(text).toContain("dddddddd");
    expect(text.trimEnd()).toMatch(/\nuser {2}\d{4}-\d\d-\d\d \d\d:\d\d$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--json links a Codex call to its empty output", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-"));
  const rec = (payload) =>
    JSON.stringify({
      timestamp: "2026-07-13T00:00:00Z",
      type: "response_item",
      payload,
    });
  writeFileSync(
    join(dir, "rollout-2026-07-13T00-00-00-thread-1.jsonl"),
    [
      JSON.stringify({
        type: "session_meta",
        payload: { id: "thread-1", cwd: "/proj-e", thread_source: "user" },
      }),
      rec({
        type: "function_call",
        name: "send_message",
        call_id: "call_1",
        arguments: "{}",
      }),
      rec({ type: "function_call_output", call_id: "call_1", output: "" }),
    ].join("\n"),
  );
  try {
    const rows = runCli([
      "--session",
      "thread-1",
      "--source",
      "codex",
      "--codex-root",
      dir,
      "--json",
    ])
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(rows).toHaveLength(2);
    expect(rows[0].toolCalls[0].id).toBe(rows[1].toolResults[0].callId);
    expect(rows[1].toolResults[0].isError).toBeNull();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--json lists contentKinds and --role human drops tool-result-only lines", () => {
  const dir = mkdtempSync(join(tmpdir(), "cg-cli-"));
  const line = (type, content) =>
    JSON.stringify({
      type,
      sessionId: "eeeeeeee-1111-2222-3333-444444444444",
      timestamp: "2026-07-13T00:00:00Z",
      cwd: "/proj-e",
      message: { content },
    });
  writeFileSync(
    join(dir, "e.jsonl"),
    [
      line("user", "marker typed by the human"),
      line("user", [
        { type: "tool_result", tool_use_id: "t1", content: "marker output" },
      ]),
      line("user", [
        { type: "tool_result", tool_use_id: "t2", content: "marker mixed" },
        { type: "text", text: "marker typed after a result" },
      ]),
    ].join("\n"),
  );
  try {
    const rows = (args) =>
      runCli(["marker", "--root", dir, "--json", ...args])
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));

    expect(rows([]).map((r) => r.contentKinds)).toStrictEqual([
      ["text"],
      ["tool_result"],
      ["tool_result", "text"],
    ]);
    expect(rows(["--role", "user"])).toHaveLength(3);
    expect(rows(["--role", "human"]).map((r) => r.contentKinds)).toStrictEqual([
      ["text"],
      ["tool_result", "text"],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
