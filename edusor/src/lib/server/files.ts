import "server-only";

export type DetectedType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Detects file type from magic bytes; the browser-supplied MIME type is not trusted. */
export function detectFileType(buf: Uint8Array): DetectedType | null {
  const starts = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x52, 0x49, 0x46, 0x46) && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  if (starts(0x50, 0x4b, 0x03, 0x04)) {
    // DOCX is a zip containing "word/" entries.
    const head = new TextDecoder("latin1").decode(buf.slice(0, Math.min(buf.length, 64 * 1024)));
    if (head.includes("word/") || head.includes("[Content_Types].xml")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

export const EXT: Record<DetectedType, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 200) || "file";
}
