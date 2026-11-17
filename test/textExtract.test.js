import { expect, test } from "vitest";

import {
  extractContent,
  extractTextLines,
  renderValue,
} from "../src/textExtract.js";

test("plain string content", () => {
  expect(extractTextLines("hello world")).toEqual(["hello world"]);
});

test("multiline string splits into lines", () => {
  expect(extractTextLines("a\nb\nc")).toEqual(["a", "b", "c"]);
});

test("text block array", () => {
  const content = [
    { type: "text", text: "first" },
    { type: "text", text: "second" },
  ];
  expect(extractTextLines(content)).toEqual(["first", "second"]);
});

test("thinking block is searchable", () => {
  expect(extractTextLines([{ type: "thinking", thinking: "hmm" }])).toEqual([
    "hmm",
  ]);
});

test("tool_use is labelled with its tool name and itemised per field", () => {
  const lines = extractTextLines([
    {
      type: "tool_use",
      name: "Bash",
      input: { command: "ls -la", description: "List files" },
    },
  ]);
  expect(lines).toEqual([
    "⚙ Bash",
    "command: ls -la",
    "description: List files",
  ]);
});

test("tool_use multi-line string value keeps real line breaks", () => {
  const lines = extractTextLines([
    {
      type: "tool_use",
      name: "Bash",
      input: { command: "cat <<'EOF'\nneedle here\nEOF" },
    },
  ]);
  expect(lines).toEqual([
    "⚙ Bash",
    "command: cat <<'EOF'",
    "needle here",
    "EOF",
  ]);
});

test("tool_use nested value keeps structure with real newlines", () => {
  const lines = extractTextLines([
    { type: "tool_use", name: "Edit", input: { edits: ["a\nb"] } },
  ]);
  expect(lines).toEqual(["⚙ Edit", "edits: [a", "b]"]);
});

test("tool_use nested object renders as key: value pairs", () => {
  const lines = extractTextLines([
    { type: "tool_use", name: "Edit", input: { edit: { path: "/tmp/x" } } },
  ]);
  expect(lines).toEqual(["⚙ Edit", "edit: {path: /tmp/x}"]);
});

test("a literal backslash-n in nested data is not turned into a line break", () => {
  const lines = extractTextLines([
    {
      type: "tool_use",
      name: "MultiEdit",
      input: { edits: [{ old_string: String.raw`printf("\n");` }] },
    },
  ]);
  expect(lines).toEqual([
    "⚙ MultiEdit",
    String.raw`edits: [{old_string: printf("\n");}]`,
  ]);
});

test("pathologically nested input degrades instead of throwing", () => {
  let deep = {};
  let cursor = deep;
  for (let i = 0; i < 200000; i++) {
    cursor.n = {};
    cursor = cursor.n;
  }
  expect(() =>
    extractTextLines([{ type: "tool_use", name: "X", input: { deep } }]),
  ).not.toThrow();
});

test("tool_use non-string scalars are rendered", () => {
  const lines = extractTextLines([
    { type: "tool_use", name: "Bash", input: { timeout: 180000, bg: true } },
  ]);
  expect(lines).toEqual(["⚙ Bash", "timeout: 180000", "bg: true"]);
});

test("tool_use with a non-object input still yields the value", () => {
  expect(
    extractTextLines([{ type: "tool_use", name: "Bash", input: "raw arg" }]),
  ).toEqual(["⚙ Bash", "raw arg"]);
});

test("tool_use without a name still itemises its input", () => {
  expect(
    extractTextLines([{ type: "tool_use", input: { path: "/tmp/x" } }]),
  ).toEqual(["path: /tmp/x"]);
});

test("tool_use without name or input yields nothing", () => {
  expect(extractTextLines([{ type: "tool_use", name: "" }])).toEqual([]);
});

test("tool_result with string content", () => {
  expect(
    extractTextLines([{ type: "tool_result", content: "output here" }]),
  ).toEqual(["output here"]);
});

test("tool_result with nested text-block array", () => {
  const content = [
    { type: "tool_result", content: [{ type: "text", text: "nested out" }] },
  ];
  expect(extractTextLines(content)).toEqual(["nested out"]);
});

test("image block yields nothing", () => {
  expect(extractTextLines([{ type: "image", source: {} }])).toEqual([]);
});

test("unknown block falls back to a text field if present", () => {
  expect(extractTextLines([{ type: "future_kind", text: "salvaged" }])).toEqual(
    ["salvaged"],
  );
});

test("unrecognised shapes are skipped, not thrown", () => {
  expect(extractTextLines(null)).toEqual([]);
  expect(extractTextLines(undefined)).toEqual([]);
  expect(extractTextLines(42)).toEqual([]);
  expect(extractTextLines([{ type: "tool_use" }])).toEqual([]);
});

test("empty strings are dropped", () => {
  expect(extractTextLines([{ type: "text", text: "" }])).toEqual([]);
});

test("extractContent collects tool calls alongside the text", () => {
  const { textLines, toolCalls } = extractContent([
    { type: "text", text: "before" },
    { type: "tool_use", name: "Edit", input: { file_path: "/a/b.ts" } },
  ]);
  expect(textLines).toEqual(["before", "⚙ Edit", "file_path: /a/b.ts"]);
  expect(toolCalls).toEqual([
    { name: "Edit", paths: ["/a/b.ts"], input: { file_path: "/a/b.ts" } },
  ]);
});

test("only path-shaped fields land in a tool call's paths", () => {
  const { toolCalls } = extractContent([
    { type: "tool_use", name: "Grep", input: { pattern: "x", path: "/a" } },
    {
      type: "tool_use",
      name: "NotebookEdit",
      input: { notebook_path: "/n.ipynb" },
    },
  ]);
  expect(toolCalls).toEqual([
    { name: "Grep", paths: [], input: { pattern: "x", path: "/a" } },
    {
      name: "NotebookEdit",
      paths: ["/n.ipynb"],
      input: { notebook_path: "/n.ipynb" },
    },
  ]);
});

test("a tool call carries its input verbatim", () => {
  const input = {
    command: "ls -la",
    nested: { list: [1, "two", null, { deep: true }], empty: "" },
    flag: false,
  };
  const { toolCalls } = extractContent([
    { type: "tool_use", name: "Bash", input },
  ]);
  expect(toolCalls[0].input).toStrictEqual(input);
});

test.each([
  ["null input", { input: null }, []],
  ["absent input", {}, []],
  ["an empty record", { input: {} }, []],
  ["a key whose value is null", { input: { cmd: null } }, ["cmd: null"]],
])("tool_use renders %s", (_label, fields, expected) => {
  expect(
    extractTextLines([{ type: "tool_use", name: "Bash", ...fields }]),
  ).toEqual(["⚙ Bash", ...expected]);
});

test("a tool call with no input omits the key", () => {
  const { toolCalls } = extractContent([{ type: "tool_use", name: "Noop" }]);
  expect(toolCalls).toEqual([{ name: "Noop", paths: [] }]);
  expect(toolCalls[0]).not.toHaveProperty("input");
});

test("a turn with no tool_use has no tool calls", () => {
  expect(extractContent([{ type: "text", text: "hi" }]).toolCalls).toEqual([]);
});

test("a nameless, pathless tool_use is not recorded", () => {
  expect(extractContent([{ type: "tool_use" }]).toolCalls).toEqual([]);
  expect(
    extractContent([{ type: "tool_use", input: { path: "/tmp/x" } }]).toolCalls,
  ).toEqual([]);
});

test("a nameless call is still recorded when it carries a path", () => {
  expect(
    extractContent([{ type: "tool_use", input: { file_path: "/tmp/x" } }])
      .toolCalls,
  ).toEqual([{ name: "", paths: ["/tmp/x"], input: { file_path: "/tmp/x" } }]);
});

test("a tool_use echoed back inside a tool_result is not a collected call", () => {
  const { textLines, toolCalls } = extractContent([
    {
      type: "tool_result",
      content: [
        { type: "tool_use", name: "Write", input: { file_path: "/w" } },
      ],
    },
  ]);
  expect(toolCalls).toEqual([]);
  expect(textLines).toEqual(["⚙ Write", "file_path: /w"]);
});

test("a real call is still collected after a tool_result in the same turn", () => {
  const { toolCalls } = extractContent([
    {
      type: "tool_result",
      content: [
        { type: "tool_use", name: "Write", input: { file_path: "/w" } },
      ],
    },
    { type: "tool_use", name: "Edit", input: { file_path: "/e" } },
  ]);
  expect(toolCalls).toEqual([
    { name: "Edit", paths: ["/e"], input: { file_path: "/e" } },
  ]);
});

test("tool_use carries its block id; a missing or empty id is omitted", () => {
  const { toolCalls } = extractContent([
    { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } },
    { type: "tool_use", id: "", name: "Read", input: {} },
    { type: "tool_use", name: "Grep", input: {} },
  ]);
  expect(toolCalls.map((c) => c.id)).toEqual(["toolu_1", undefined, undefined]);
  expect(toolCalls[1]).not.toHaveProperty("id");
  expect(toolCalls[2]).not.toHaveProperty("id");
});

test("tool_result maps is_error true / false / absent to true / false / null", () => {
  const { toolResults } = extractContent([
    { type: "tool_result", tool_use_id: "a", is_error: true, content: "no" },
    { type: "tool_result", tool_use_id: "b", is_error: false, content: "ok" },
    { type: "tool_result", tool_use_id: "c", content: "unknown" },
  ]);
  expect(toolResults).toStrictEqual([
    { callId: "a", isError: true },
    { callId: "b", isError: false },
    { callId: "c", isError: null },
  ]);
});

test("a non-boolean is_error is null, and a result without tool_use_id omits callId", () => {
  const { toolResults } = extractContent([
    { type: "tool_result", is_error: "true", content: "x" },
    { type: "tool_result", tool_use_id: 7, is_error: 1, content: "y" },
  ]);
  expect(toolResults).toStrictEqual([{ isError: null }, { isError: null }]);
});

test("a tool_result nested inside another result's content is data, not a result", () => {
  const { toolResults, textLines } = extractContent([
    {
      type: "tool_result",
      tool_use_id: "outer",
      content: [
        { type: "text", text: "echoed" },
        { type: "tool_result", tool_use_id: "inner", is_error: true },
      ],
    },
  ]);
  expect(toolResults).toStrictEqual([{ callId: "outer", isError: null }]);
  expect(textLines).toEqual(["echoed"]);
});

test("an empty tool_result still yields a result and no text", () => {
  const { toolResults, textLines } = extractContent([
    { type: "tool_result", tool_use_id: "e", content: "" },
  ]);
  expect(textLines).toEqual([]);
  expect(toolResults).toStrictEqual([{ callId: "e", isError: null }]);
});

test("results are listed in source order across one content array", () => {
  const { toolResults } = extractContent([
    { type: "tool_result", tool_use_id: "1", content: "a" },
    { type: "text", text: "between" },
    { type: "tool_result", tool_use_id: "2", content: "b" },
  ]);
  expect(toolResults.map((r) => r.callId)).toEqual(["1", "2"]);
});

test("a value JSON cannot serialise renders as nothing rather than throwing", () => {
  expect(renderValue(1n)).toBe("");
});

test("contentKinds lists each kind once, in first-appearance order", () => {
  const { contentKinds } = extractContent([
    { type: "tool_result", tool_use_id: "a", content: "out" },
    { type: "text", text: "typed" },
    { type: "tool_result", tool_use_id: "b", content: "more" },
    { type: "thinking", thinking: "hmm" },
    { type: "tool_use", id: "c", name: "Read", input: {} },
    { type: "image", source: {} },
    { type: "text", text: "again" },
  ]);
  expect(contentKinds).toStrictEqual([
    "tool_result",
    "text",
    "thinking",
    "tool_use",
    "image",
  ]);
});

test("a plain string is text", () => {
  expect(extractContent("hello").contentKinds).toStrictEqual(["text"]);
});

test("a tool result's own text is not the turn's text", () => {
  const { contentKinds } = extractContent([
    { type: "tool_result", tool_use_id: "a", content: "out" },
    {
      type: "tool_result",
      tool_use_id: "b",
      content: [{ type: "text", text: "x" }],
    },
  ]);
  expect(contentKinds).toStrictEqual(["tool_result"]);
});

test("an empty result body still counts as a tool_result; empty text does not", () => {
  expect(
    extractContent([
      { type: "tool_result", tool_use_id: "a", content: "" },
      { type: "text", text: "" },
    ]).contentKinds,
  ).toStrictEqual(["tool_result"]);
});

test("an unrecognised block contributes no kind", () => {
  expect(
    extractContent([{ type: "mystery", text: "hi" }]).contentKinds,
  ).toStrictEqual([]);
});

test("an empty or non-string thinking block contributes no kind", () => {
  expect(
    extractContent([
      { type: "thinking", thinking: "" },
      { type: "thinking", thinking: 7 },
      { type: "thinking" },
    ]).contentKinds,
  ).toStrictEqual([]);
});

test("a thinking block echoed inside a tool result is data, not the turn's thinking", () => {
  expect(
    extractContent([
      {
        type: "tool_result",
        tool_use_id: "a",
        content: [{ type: "thinking", thinking: "echo" }],
      },
    ]).contentKinds,
  ).toStrictEqual(["tool_result"]);
});
