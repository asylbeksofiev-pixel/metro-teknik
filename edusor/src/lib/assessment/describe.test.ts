import { describe, expect, it } from "vitest";
import { describeKey, describeResponse } from "./describe";

const options = [{ id: "a", text: "x = 3" }, { id: "b", text: "x = -3" }];

describe("describeResponse / describeKey", () => {
  it("labels choice options with letters in canonical order", () => {
    expect(describeResponse("single_choice", { prompt: "q", options }, { optionId: "b" })).toBe("B. x = -3");
    expect(describeKey("single_choice", { prompt: "q", options }, { correct: "a" })).toBe("A. x = 3");
  });
  it("describes matching pairs", () => {
    const content = { prompt: "q", left: [{ id: "l1", text: "2+2" }], right: [{ id: "r1", text: "4" }] };
    expect(describeResponse("matching", content, { pairs: { l1: "r1" } })).toBe("1. 2+2 → 4");
  });
  it("describes ordering in the student's order", () => {
    const content = { prompt: "q", items: [{ id: "x", text: "first" }, { id: "y", text: "second" }] };
    expect(describeResponse("ordering", content, { order: ["y", "x"] })).toBe("1. second\n2. first");
    expect(describeKey("ordering", content, { order: ["x", "y"] })).toBe("1. first\n2. second");
  });
  it("returns null for missing keys and handles booleans", () => {
    expect(describeKey("true_false", { prompt: "q" }, { correct: null })).toBeNull();
    expect(describeResponse("true_false", { prompt: "q" }, { value: false }, "Дұрыс", "Бұрыс")).toBe("Бұрыс");
  });
  it("includes units and tolerance for numeric answers", () => {
    expect(describeKey("numeric", { prompt: "q", unit: "м/с" }, { value: 9.8, tolerance: 0.1 })).toBe("9.8 ± 0.1 м/с");
  });
});
