import { expect, test } from "vitest";

import { applyPatchPaths } from "../src/applyPatch.js";

function call(patch, wrap = (s) => `await tools.apply_patch(${s})`) {
  return wrap(JSON.stringify(patch));
}

const patch = (...lines) => ["*** Begin Patch", ...lines].join("\n");

test("Add, Update and Delete headers each yield their path, in order", () => {
  const src = call(
    patch(
      "*** Add File: /a/new.ts",
      "+x",
      "*** Update File: /a/b.ts",
      "@@",
      "-a",
      "+b",
      "*** Delete File: /a/gone.ts",
      "*** End Patch",
    ),
  );
  expect(applyPatchPaths(src)).toEqual(["/a/new.ts", "/a/b.ts", "/a/gone.ts"]);
});

test("the observed text(await …) wrapper and a preceding statement are read", () => {
  const src = `const pr=load("x");\n${call(patch("*** Update File: p.ts", "*** End Patch"), (s) => `text(await tools.apply_patch(${s}))`)}`;
  expect(applyPatchPaths(src)).toEqual(["p.ts"]);
});

test("several top-level calls are all read, a repeated path once", () => {
  const one = call(patch("*** Update File: a.ts", "*** End Patch"));
  const two = call(
    patch("*** Update File: a.ts", "*** Add File: b.ts", "*** End Patch"),
  );
  expect(applyPatchPaths(`${one};\n${two};`)).toEqual(["a.ts", "b.ts"]);
});

test("Move to right after Update File yields both paths, even with no hunk", () => {
  const src = call(
    patch("*** Update File: old.ts", "*** Move to: new.ts", "*** End Patch"),
  );
  expect(applyPatchPaths(src)).toEqual(["old.ts", "new.ts"]);
});

test.each([
  ["a lone Move to", ["*** Move to: x.ts"]],
  ["Move to after Add File", ["*** Add File: a.ts", "*** Move to: x.ts"]],
  [
    "Move to after a hunk marker",
    ["*** Update File: a.ts", "@@", "*** Move to: x.ts"],
  ],
])("%s adds no destination", (_name, lines) => {
  const paths = applyPatchPaths(call(patch(...lines, "*** End Patch")));
  expect(paths).not.toContain("x.ts");
});

test("a missing End Patch still yields the headers", () => {
  expect(
    applyPatchPaths(call(patch("*** Update File: a.ts", "@@", "+x"))),
  ).toEqual(["a.ts"]);
});

test("nothing after End Patch counts", () => {
  const src = call(
    patch(
      "*** Update File: a.ts",
      "*** End Patch",
      "*** Delete File: ghost.ts",
    ),
  );
  expect(applyPatchPaths(src)).toEqual(["a.ts"]);
});

test("headers keep inner spaces and survive CRLF", () => {
  const src = call(
    [
      "*** Begin Patch\r",
      "*** Update File: dir/a b.ts\r",
      "*** End Patch\r",
    ].join("\n"),
  );
  expect(applyPatchPaths(src)).toEqual(["dir/a b.ts"]);
});

test.each([
  ["an added diff line", "+*** Delete File: ghost.ts"],
  ["a context diff line", " *** Delete File: ghost.ts"],
])("%s is not a header", (_name, line) => {
  const src = call(patch("*** Update File: a.ts", line, "*** End Patch"));
  expect(applyPatchPaths(src)).toEqual(["a.ts"]);
});

test("a blank path is dropped", () => {
  expect(
    applyPatchPaths(call(patch("*** Add File:   ", "*** End Patch"))),
  ).toEqual([]);
});

test("a first line other than exactly Begin Patch yields nothing", () => {
  const src = call("*** Begin Patch notes\n*** Add File: a.ts\n*** End Patch");
  expect(applyPatchPaths(src)).toEqual([]);
});

test("a concatenated literal yields only headers it finished", () => {
  const first = JSON.stringify("*** Begin Patch\n*** Add File: x.ts\n+");
  const src = `await tools.apply_patch(${first}+JSON.stringify(data)+"\\n*** End Patch")`;
  expect(applyPatchPaths(src)).toEqual(["x.ts"]);

  const split = `await tools.apply_patch("*** Begin Patch\\n*** Delete File: x" + ".ts\\n*** End Patch")`;
  expect(applyPatchPaths(split)).toEqual([]);
});

test.each([
  [
    "a mention in rg",
    'tools.exec_command({cmd:"rg \\"*** Update File: a.ts\\" src"})',
  ],
  ["cat of a file", 'tools.exec_command({cmd:"cat src/a.ts"})'],
  [
    "a comment",
    `// ${call(patch("*** Update File: ghost.ts", "*** End Patch"))}`,
  ],
  [
    "a shell argument",
    `tools.exec_command({cmd: 'echo ${call(patch("*** Update File: ghost.ts"))}'})`,
  ],
  [
    "another receiver",
    call(
      patch("*** Update File: ghost.ts"),
      (s) => `await other.tools.apply_patch(${s})`,
    ),
  ],
  [
    "an arrow function body",
    call(
      patch("*** Update File: ghost.ts"),
      (s) => `const f = () => tools.apply_patch(${s})`,
    ),
  ],
  [
    "a short-circuited branch",
    call(
      patch("*** Update File: ghost.ts"),
      (s) => `false && tools.apply_patch(${s})`,
    ),
  ],
  [
    "an indented call",
    call(
      patch("*** Update File: ghost.ts"),
      (s) => `  await tools.apply_patch(${s})`,
    ),
  ],
  [
    "a derived argument",
    call(
      patch("*** Update File: ghost.ts"),
      (s) => `await tools.apply_patch(${s}.replace("a", "b"))`,
    ),
  ],
  ["a boolean argument", 'await tools.apply_patch("" === "")'],
  ["a variable argument", "await tools.apply_patch(patchText)"],
  [
    "a template literal",
    "await tools.apply_patch(`*** Begin Patch\n*** Update File: ghost.ts\n*** End Patch`)",
  ],
])("%s yields nothing", (_name, src) => {
  expect(applyPatchPaths(src)).toEqual([]);
});

test.each([
  ["an escaped single quote", String.raw`\'`],
  ["a hex escape", String.raw`\x41`],
  ["a NUL escape", String.raw`\0`],
])("a literal using %s, which JSON rejects, yields nothing", (_name, esc) => {
  const src = `await tools.apply_patch("*** Begin Patch\\n*** Add File: a${esc}.ts\\n*** End Patch")`;
  expect(applyPatchPaths(src)).toEqual([]);
});

test("a path with a quote and a backslash round-trips", () => {
  const path = 'a"b\\c.ts';
  const src = call(patch(`*** Add File: ${path}`, "*** End Patch"));
  expect(applyPatchPaths(src)).toEqual([path]);
});

test("a literal ending in an escaped backslash is read to its close", () => {
  const src = `await tools.apply_patch("*** Begin Patch\\n*** Add File: a\\\\")`;
  expect(applyPatchPaths(src)).toEqual(["a\\"]);
});

test("an unterminated literal yields nothing", () => {
  expect(
    applyPatchPaths(
      'await tools.apply_patch("*** Begin Patch\\n*** Add File: a',
    ),
  ).toEqual([]);
});

test("an Update File on the last line has no destination to read", () => {
  expect(applyPatchPaths(call(patch("*** Update File: a.ts")))).toEqual([
    "a.ts",
  ]);
});

test("a blank Move to destination is dropped", () => {
  const src = call(
    patch("*** Update File: a.ts", "*** Move to:   ", "*** End Patch"),
  );
  expect(applyPatchPaths(src)).toEqual(["a.ts"]);
});
