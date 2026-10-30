import { describe, expect, it } from "vitest";
import { detectFileType, safeFileName } from "./files";

describe("detectFileType", () => {
  it("detects by magic bytes", () => {
    expect(detectFileType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });
  it("rejects HTML disguised as an image", () => expect(detectFileType(new TextEncoder().encode("<html><script>"))).toBeNull());
  it("sanitizes file names", () => expect(safeFileName("../../etc/passwd")).toBe(".._.._etc_passwd"));
});
