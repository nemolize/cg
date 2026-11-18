const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

const DURATION_RE = /^(\d+)([smhdw])$/;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;
const END_OF_DAY_MS = 86_400_000 - 1;

function isRealDay(year: string, month: string, day: string): boolean {
  const probe = new Date(0);
  probe.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  return (
    probe.getUTCFullYear() === Number(year) &&
    probe.getUTCMonth() === Number(month) - 1 &&
    probe.getUTCDate() === Number(day)
  );
}

export function parseSinceUntil(
  value: string,
  boundary: "since" | "until",
  now: number = Date.now(),
): number {
  const rel = DURATION_RE.exec(value);
  if (rel) {
    const unit = rel[2] === undefined ? undefined : UNIT_MS[rel[2]];
    if (unit !== undefined) {
      const instant = now - Number(rel[1]) * unit;
      if (Number.isFinite(instant)) return instant;
    }
  }
  const dateOnly = DATE_ONLY_RE.test(value);
  const parts = DATE_ONLY_RE.exec(value) ?? DATETIME_RE.exec(value);
  if (parts !== null) {
    const [, year = "", month = "", day = ""] = parts;
    if (isRealDay(year, month, day)) {
      if (dateOnly) {
        const startOfDay = Date.parse(`${value}T00:00:00Z`);
        return boundary === "since" ? startOfDay : startOfDay + END_OF_DAY_MS;
      }
      const abs = Date.parse(value);
      if (!Number.isNaN(abs)) return abs;
    }
  }
  throw new Error(
    `invalid time value: "${value}" (use a duration like "7d"/"2h"/"30m", a date like "2026-06-01", or a datetime like "2026-06-01T12:00:00Z")`,
  );
}
