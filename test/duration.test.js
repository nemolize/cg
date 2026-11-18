import { expect, test } from "vitest";

import { parseSinceUntil } from "../src/duration.js";

const NOW = Date.parse("2026-07-14T00:00:00Z");

test("relative durations subtract from now (boundary ignored)", () => {
  expect(parseSinceUntil("7d", "since", NOW)).toBe(NOW - 7 * 86_400_000);
  expect(parseSinceUntil("7d", "until", NOW)).toBe(NOW - 7 * 86_400_000);
  expect(parseSinceUntil("2h", "since", NOW)).toBe(NOW - 2 * 3_600_000);
  expect(parseSinceUntil("30m", "since", NOW)).toBe(NOW - 30 * 60_000);
  expect(parseSinceUntil("1w", "since", NOW)).toBe(NOW - 7 * 86_400_000);
});

test("whitespace tolerated in relative durations", () => {
  expect(parseSinceUntil(" 7d ", "since", NOW)).toBe(NOW - 7 * 86_400_000);
});

test("date-only values anchor to a UTC day boundary per side", () => {
  const startOfDay = Date.parse("2026-06-01T00:00:00Z");
  expect(parseSinceUntil("2026-06-01", "since", NOW)).toBe(startOfDay);
  expect(parseSinceUntil("2026-06-01", "until", NOW)).toBe(
    startOfDay + 86_400_000 - 1,
  );
});

test("full datetime values pass through unchanged for both sides", () => {
  const ts = Date.parse("2026-06-01T12:34:56Z");
  expect(parseSinceUntil("2026-06-01T12:34:56Z", "since", NOW)).toBe(ts);
  expect(parseSinceUntil("2026-06-01T12:34:56Z", "until", NOW)).toBe(ts);
});

test("invalid values throw with a helpful message", () => {
  expect(() => parseSinceUntil("nope", "since", NOW)).toThrow(
    /invalid time value/,
  );
  expect(() => parseSinceUntil("7x", "since", NOW)).toThrow(
    /invalid time value/,
  );
});

test.each([
  "7",
  "12",
  "2026",
  "2026-02-30",
  "2026-13-01",
  "2026-06-31",
  "Jul 4 2026",
])("%s is rejected, not read as some other date", (value) => {
  expect(() => parseSinceUntil(value, "since", NOW)).toThrow(
    /invalid time value/,
  );
});

test("a datetime on a day that does not exist is rejected", () => {
  expect(() => parseSinceUntil("2026-02-30T10:00:00Z", "since", NOW)).toThrow(
    /invalid time value/,
  );
});

test("a leap day is accepted only in a leap year", () => {
  expect(parseSinceUntil("2028-02-29", "since", NOW)).toBe(
    Date.parse("2028-02-29T00:00:00Z"),
  );
  expect(() => parseSinceUntil("2026-02-29", "since", NOW)).toThrow(
    /invalid time value/,
  );
});

test("a datetime without seconds or with a space separator is accepted", () => {
  expect(parseSinceUntil("2026-06-01T12:34Z", "since", NOW)).toBe(
    Date.parse("2026-06-01T12:34:00Z"),
  );
  expect(parseSinceUntil("2026-06-01 12:34:56+02:00", "since", NOW)).toBe(
    Date.parse("2026-06-01T10:34:56Z"),
  );
});

test("a duration that overflows to a non-finite instant is rejected", () => {
  expect(() => parseSinceUntil(`${"9".repeat(400)}d`, "since", NOW)).toThrow(
    /invalid time value/,
  );
});
