import { passesFilters } from "./filters.js";
import { findTranscripts, loadTurns } from "./loader.js";
import { buildMatcher } from "./matcher.js";
import { buildPrefilter } from "./prefilter.js";
import type { Hit, Options } from "./types.js";

/**
 * Stream hits across every transcript under each of `opts.roots`. For each turn that
 * passes the metadata filters, the matcher is run per text line; a turn with
 * ≥1 matching line yields one `Hit` carrying the matched line indices, and
 * with no pattern a turn with no text lines does too. Files are processed
 * sequentially and lazily so a large corpus streams rather than loading
 * wholesale.
 */
export async function* search(opts: Options): AsyncGenerator<Hit> {
  const matcher = buildMatcher(opts);
  const prefilter = buildPrefilter(opts);
  let yielded = 0;

  for (const [source, root] of opts.roots) {
    for await (const file of findTranscripts(root.path)) {
      for await (const turn of loadTurns(file, prefilter, source)) {
        if (!passesFilters(turn, opts)) continue;

        const matchedLineIndices: number[] = [];
        for (const [i, line] of turn.textLines.entries()) {
          if (matcher.test(line)) matchedLineIndices.push(i);
        }
        // A turn with no text (an empty tool result) has no line to match, so
        // only a patternless search or dump, which asks for every turn, keeps it.
        const wanted =
          matchedLineIndices.length > 0 ||
          (opts.pattern === undefined && turn.textLines.length === 0);
        if (wanted) {
          yield { turn, matchedLineIndices };
          yielded++;
          if (opts.maxCount !== undefined && yielded >= opts.maxCount) return;
        }
      }
    }
  }
}
