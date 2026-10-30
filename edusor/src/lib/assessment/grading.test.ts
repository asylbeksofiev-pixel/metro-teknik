import { describe, expect, it } from "vitest";
import { gradeResponse, markFromPercent, parseLocaleNumber, sanitizeContentForStorage } from "./grading";
import { defaultQuestion, isEmptyResponse, validateQuestion } from "./schema";

describe("parseLocaleNumber", () => {
  it.each([
    ["3,5", 3.5],
    ["-2.75", -2.75],
    ["1 000", 1000],
    ["  42 ", 42],
    [".5", 0.5],
    ["1e3", 1000],
  ])("parses %s", (raw, expected) => expect(parseLocaleNumber(raw)).toBe(expected));

  it.each(["", "abc", "1,2,3", "--1", "1.2.3"])("rejects %s", (raw) => expect(parseLocaleNumber(raw)).toBeNull());
});

describe("gradeResponse: unanswered", () => {
  it("returns unanswered with 0 points for empty responses", () => {
    expect(gradeResponse("single_choice", { correct: "a" }, {}, 2)).toEqual({ points: 0, result: "unanswered", needsReview: false });
    expect(gradeResponse("essay", {}, { text: "   " }, 5)).toEqual({ points: 0, result: "unanswered", needsReview: false });
    expect(gradeResponse("fill_blanks", { blanks: { "1": ["x"] } }, { blanks: { "1": " " } }, 1).result).toBe("unanswered");
  });
});

describe("gradeResponse: single choice / true-false", () => {
  it("grades single choice", () => {
    expect(gradeResponse("single_choice", { correct: "b" }, { optionId: "b" }, 2)).toMatchObject({ points: 2, result: "correct" });
    expect(gradeResponse("single_choice", { correct: "b" }, { optionId: "a" }, 2)).toMatchObject({ points: 0, result: "incorrect" });
  });
  it("needs review when the key is missing", () => {
    expect(gradeResponse("single_choice", { correct: null }, { optionId: "a" }, 1)).toMatchObject({ points: null, needsReview: true });
  });
  it("grades true/false including false as a valid answer", () => {
    expect(gradeResponse("true_false", { correct: false }, { value: false }, 1)).toMatchObject({ points: 1, result: "correct" });
    expect(gradeResponse("true_false", { correct: true }, { value: false }, 1)).toMatchObject({ points: 0, result: "incorrect" });
  });
});

describe("gradeResponse: multiple choice", () => {
  const key = { correct: ["a", "c"], scoring: "partial" };
  it("full credit for exact set", () => expect(gradeResponse("multiple_choice", key, { optionIds: ["c", "a"] }, 2)).toMatchObject({ points: 2, result: "correct" }));
  it("partial credit for subset", () => expect(gradeResponse("multiple_choice", key, { optionIds: ["a"] }, 2)).toMatchObject({ points: 1, result: "partial" }));
  it("wrong picks cancel correct ones", () => expect(gradeResponse("multiple_choice", key, { optionIds: ["a", "b"] }, 2)).toMatchObject({ points: 0, result: "incorrect" }));
  it("selecting everything is not rewarded", () => expect(gradeResponse("multiple_choice", key, { optionIds: ["a", "b", "c", "d"] }, 2).points).toBe(0));
  it("all-or-nothing gives 0 for subset", () =>
    expect(gradeResponse("multiple_choice", { correct: ["a", "c"], scoring: "all_or_nothing" }, { optionIds: ["a"] }, 2)).toMatchObject({ points: 0, result: "incorrect" }));
});

describe("gradeResponse: numeric", () => {
  it("accepts decimal comma", () => expect(gradeResponse("numeric", { value: 3.5, tolerance: 0 }, { value: "3,5" }, 1).result).toBe("correct"));
  it("respects tolerance", () => {
    expect(gradeResponse("numeric", { value: 9.8, tolerance: 0.1 }, { value: "9.75" }, 1).result).toBe("correct");
    expect(gradeResponse("numeric", { value: 9.8, tolerance: 0.1 }, { value: "9.6" }, 1).result).toBe("incorrect");
  });
  it("handles float rounding without tolerance", () => expect(gradeResponse("numeric", { value: 0.3, tolerance: 0 }, { value: String(0.1 + 0.2) }, 1).result).toBe("correct"));
  it("non-numbers are incorrect", () => expect(gradeResponse("numeric", { value: 1, tolerance: 0 }, { value: "one" }, 1).result).toBe("incorrect"));
});

describe("gradeResponse: matching", () => {
  const key = { pairs: { l1: "r1", l2: "r2", l3: "r3", l4: "r4" }, scoring: "partial" };
  it("partial by correct pairs", () => expect(gradeResponse("matching", key, { pairs: { l1: "r1", l2: "r3", l3: "r2", l4: "r4" } }, 4)).toMatchObject({ points: 2, result: "partial" }));
  it("all correct", () => expect(gradeResponse("matching", key, { pairs: key.pairs }, 4)).toMatchObject({ points: 4, result: "correct" }));
  it("all-or-nothing", () => expect(gradeResponse("matching", { ...key, scoring: "all_or_nothing" }, { pairs: { l1: "r1" } }, 4).points).toBe(0));
});

describe("gradeResponse: ordering", () => {
  const key = { order: ["a", "b", "c", "d"], scoring: "partial" };
  it("exact order is correct", () => expect(gradeResponse("ordering", key, { order: ["a", "b", "c", "d"] }, 3)).toMatchObject({ points: 3, result: "correct" }));
  it("adjacent-pair partial credit", () => expect(gradeResponse("ordering", key, { order: ["b", "a", "c", "d"] }, 3)).toMatchObject({ points: 2, result: "partial" }));
  it("reversed order gets nothing", () => expect(gradeResponse("ordering", key, { order: ["d", "c", "b", "a"] }, 3).points).toBe(0));
});

describe("gradeResponse: fill in the blanks", () => {
  const content = { prompt: "Столица Казахстана — [[1]], крупнейший город — [[2]].", images: [] };
  const key = { blanks: { "1": ["Астана"], "2": ["Алматы", "Алма-Ата"] }, caseSensitive: false, scoring: "partial" };
  it("case-insensitive with alternatives", () =>
    expect(gradeResponse("fill_blanks", key, { blanks: { "1": " астана", "2": "алма-ата" } }, 2, content)).toMatchObject({ points: 2, result: "correct" }));
  it("partial", () => expect(gradeResponse("fill_blanks", key, { blanks: { "1": "Астана", "2": "Шымкент" } }, 2, content)).toMatchObject({ points: 1, result: "partial" }));
  it("case-sensitive", () =>
    expect(gradeResponse("fill_blanks", { ...key, caseSensitive: true }, { blanks: { "1": "астана", "2": "Алматы" } }, 2, content).points).toBe(1));
});

describe("gradeResponse: short text and subjective", () => {
  it("exact accepted answer is auto-graded", () =>
    expect(gradeResponse("short_text", { accepted: ["фотосинтез"], caseSensitive: false }, { text: "Фотосинтез" }, 1)).toMatchObject({ points: 1, result: "correct", needsReview: false }));
  it("non-matching short answer goes to review instead of being marked wrong", () =>
    expect(gradeResponse("short_text", { accepted: ["фотосинтез"], caseSensitive: false }, { text: "процесс фотосинтеза" }, 1)).toMatchObject({ points: null, result: "pending", needsReview: true }));
  it("essays always need review", () => expect(gradeResponse("essay", { referenceAnswer: "..." }, { text: "Мой ответ" }, 5)).toMatchObject({ points: null, needsReview: true }));
});

describe("validateQuestion", () => {
  it("rejects empty defaults and accepts a complete single-choice question", () => {
    const q = defaultQuestion("single_choice");
    expect(validateQuestion(q)).toBe("prompt");
    const options = (q.content.options as { id: string; text: string }[]).map((o, i) => ({ ...o, text: `Вариант ${i}` }));
    expect(validateQuestion({ ...q, content: { ...q.content, prompt: "2+2?", options }, answer_key: { correct: null } })).toBe("correct");
    expect(validateQuestion({ ...q, content: { ...q.content, prompt: "2+2?", options }, answer_key: { correct: options[1]!.id } })).toBeNull();
  });
  it("requires blanks in fill-in questions", () => {
    expect(validateQuestion({ type: "fill_blanks", content: { prompt: "Нет пропусков" }, answer_key: { blanks: {} } })).toBe("blanks");
    expect(validateQuestion({ type: "fill_blanks", content: { prompt: "a [[1]]" }, answer_key: { blanks: { "1": ["x"] } } })).toBeNull();
  });
});

describe("sanitizeContentForStorage", () => {
  it("does not keep ordering items in answer order", () => {
    const items = [{ id: "zz", text: "1" }, { id: "aa", text: "2" }, { id: "mm", text: "3" }];
    const out = sanitizeContentForStorage("ordering", { prompt: "", items }) as { items: { id: string }[] };
    expect(out.items.map((i) => i.id)).toEqual(["aa", "mm", "zz"]);
  });
});

describe("misc", () => {
  it("isEmptyResponse handles malformed data", () => expect(isEmptyResponse("single_choice", { optionId: 5 })).toBe(true));
  it("markFromPercent", () => {
    expect(markFromPercent(90)).toBe(5);
    expect(markFromPercent(70)).toBe(4);
    expect(markFromPercent(40)).toBe(3);
    expect(markFromPercent(39.9)).toBe(2);
  });
});
