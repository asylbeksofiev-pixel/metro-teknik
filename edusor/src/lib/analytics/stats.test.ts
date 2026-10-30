import { describe, expect, it } from "vitest";
import { csvEscape, distribution, median, optionDistribution, questionStats, topicPerformance } from "./stats";

describe("analytics stats", () => {
  it("median handles odd/even/empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("distribution buckets 100% into the last bucket", () => {
    const d = distribution([0, 9.9, 10, 95, 100]);
    expect(d[0]!.count).toBe(2);
    expect(d[1]!.count).toBe(1);
    expect(d[9]!.count).toBe(2);
  });
  it("does not flag difficulty on small samples", () => {
    const s = questionStats([{ result: "incorrect", points: 0, max: 1 }, { result: "incorrect", points: 0, max: 1 }]);
    expect(s.accuracy).toBe(0);
    expect(s.difficulty).toEqual({ flagged: false, reasons: [], smallSample: true });
  });
  it("flags low accuracy and many unanswered with enough data", () => {
    const rows = [
      ...Array(3).fill({ result: "unanswered", points: 0, max: 2 }),
      ...Array(3).fill({ result: "incorrect", points: 0, max: 2 }),
      { result: "partial", points: 1, max: 2 },
    ];
    const s = questionStats(rows);
    expect(s.difficulty.reasons).toEqual(["lowAccuracy", "highUnanswered"]);
    expect(s.partial).toBe(1);
  });
  it("pending responses are excluded from accuracy", () => {
    const s = questionStats([{ result: "pending", points: null, max: 4 }, { result: "correct", points: 4, max: 4 }]);
    expect(s.accuracy).toBe(100);
    expect(s.pending).toBe(1);
  });
  it("option distribution finds the most common wrong option", () => {
    const r = optionDistribution([{ id: "a" }, { id: "b" }, { id: "c" }], [["a"], ["b"], ["b"], ["c"]], ["a"]);
    expect(r.mostCommonWrong?.id).toBe("b");
    expect(r.rows.find((x) => x.id === "b")!.share).toBe(0.5);
  });
  it("topic performance skips ungraded rows and sorts weakest first", () => {
    const t = topicPerformance([
      { topic: "A", points: 1, max: 1 },
      { topic: "B", points: 0, max: 2 },
      { topic: "B", points: null, max: 2 },
      { topic: null, points: 1, max: 1 },
    ]);
    expect(t).toEqual([{ topic: "B", percent: 0, responses: 1 }, { topic: "A", percent: 100, responses: 1 }]);
  });
  it("csv escapes quotes and formula injection", () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
    expect(csvEscape("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
});
