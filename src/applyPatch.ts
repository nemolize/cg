/** `text(await …)` is the observed wrapper; column 0 keeps nested or commented calls out. */
const CALL_START = /^(?:text\()?await tools\.apply_patch\(\s*"/gm;

const BEGIN = "*** Begin Patch";
const END = "*** End Patch";
const FILE_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/;
const MOVE_HEADER = /^\*\*\* Move to: (.+)$/;

function readLiteral(
  source: string,
  from: number,
): { text: string; end: number } | undefined {
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") i++;
    else if (ch === '"') {
      try {
        const text = String(JSON.parse(`"${source.slice(from, i)}"`));
        return { text, end: i + 1 };
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function headerPaths(patch: string, concatenated: boolean): string[] {
  const lines = patch.split("\n").map((l) => l.replace(/\r$/, ""));
  if (concatenated && !patch.endsWith("\n")) lines.pop();
  if (lines[0] !== BEGIN) return [];

  const out: string[] = [];
  for (const [i, line] of lines.entries()) {
    if (line === END) break;
    const path = FILE_HEADER.exec(line)?.[1]?.trimEnd();
    if (path === undefined || path === "") continue;
    out.push(path);
    if (line.startsWith("*** Update File:")) {
      const dest = MOVE_HEADER.exec(lines[i + 1] ?? "")?.[1]?.trimEnd();
      if (dest !== undefined && dest !== "") out.push(dest);
    }
  }
  return out;
}

export function applyPatchPaths(source: string): string[] {
  const found = new Set<string>();
  for (const call of source.matchAll(CALL_START)) {
    const literal = readLiteral(source, call.index + call[0].length);
    if (literal === undefined) continue;
    const rest = source.slice(literal.end).trimStart();
    const concatenated = rest.startsWith("+");
    if (!concatenated && !rest.startsWith(")")) continue;
    for (const path of headerPaths(literal.text, concatenated)) found.add(path);
  }
  return [...found];
}
