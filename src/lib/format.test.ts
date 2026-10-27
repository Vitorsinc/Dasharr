import { formatBytes, formatEta, formatSpeed, formatAge } from "./format";

test("formatBytes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1,5 KB");
  expect(formatBytes(5 * 1024 ** 3)).toBe("5 GB");
  expect(formatBytes(undefined)).toBe("—");
});

test("formatSpeed", () => {
  expect(formatSpeed(0)).toBe("0 B/s");
  expect(formatSpeed(2 * 1024 * 1024)).toBe("2 MB/s");
});

test("formatEta", () => {
  expect(formatEta(3661)).toBe("1 h 1 min");
  expect(formatEta(8640000)).toBe("∞");
  expect(formatEta(42)).toBe("42 s");
  expect(formatEta(90000)).toBe("1 d 1 h");
});

test("formatAge", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  expect(formatAge("2026-10-24T12:00:00Z", now)).toBe("3 d");
  expect(formatAge("2026-10-27T10:00:00Z", now)).toBe("2 h");
});
