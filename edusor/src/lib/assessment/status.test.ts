import { describe, expect, it } from "vitest";
import { studentStatus, type AssessmentLite, type AttemptLite } from "./status";

const now = new Date("2026-10-30T10:00:00Z");
const base: AssessmentLite = { status: "published", starts_at: "2026-10-29T00:00:00Z", due_at: "2026-11-01T00:00:00Z", max_attempts: 1 };
const attempt = (p: Partial<AttemptLite>): AttemptLite => ({ id: "t", status: "submitted", grading_status: "pending", attempt_no: 1, submitted_at: "2026-10-30T09:00:00Z", deadline_at: null, ...p });

describe("studentStatus", () => {
  it("available when open and unattempted", () => expect(studentStatus(base, [], 0, now)).toMatchObject({ status: "available", canStart: true }));
  it("upcoming before start", () => expect(studentStatus({ ...base, starts_at: "2026-10-31T00:00:00Z" }, [], 0, now).status).toBe("upcoming"));
  it("expired after due without attempts", () => expect(studentStatus({ ...base, due_at: "2026-10-30T09:00:00Z" }, [], 0, now).status).toBe("expired"));
  it("expired when closed", () => expect(studentStatus({ ...base, status: "closed" }, [], 0, now).status).toBe("expired"));
  it("in progress", () => expect(studentStatus(base, [attempt({ status: "in_progress", deadline_at: "2026-10-30T11:00:00Z" })], 0, now).status).toBe("in_progress"));
  it("timed-out in-progress attempt is shown as submitted", () =>
    expect(studentStatus(base, [attempt({ status: "in_progress", deadline_at: "2026-10-30T09:30:00Z" })], 0, now)).toMatchObject({ status: "submitted", canStart: false }));
  it("pipeline: submitted → under review → graded → released", () => {
    expect(studentStatus(base, [attempt({})], 0, now).status).toBe("submitted");
    expect(studentStatus(base, [attempt({ grading_status: "needs_review" })], 0, now).status).toBe("under_review");
    expect(studentStatus(base, [attempt({ grading_status: "graded" })], 0, now).status).toBe("graded");
    expect(studentStatus(base, [attempt({ grading_status: "graded", released: true })], 0, now).status).toBe("released");
  });
  it("extra attempts from accommodations allow another start", () => {
    expect(studentStatus(base, [attempt({})], 0, now).canStart).toBe(false);
    expect(studentStatus(base, [attempt({})], 1, now).canStart).toBe(true);
  });
});
