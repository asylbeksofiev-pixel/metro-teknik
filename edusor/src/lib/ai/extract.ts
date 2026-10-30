import "server-only";

export type PageText = { page: number; text: string; method: "pdf_text" | "docx" | "vision_ocr"; uncertain: boolean; notes?: string };

/** Pages with less text than this are treated as scanned images and sent to OCR. */
const SCANNED_THRESHOLD = 40;
export const MAX_PAGES = 30;

export async function extractPdf(buf: Uint8Array): Promise<{ pages: PageText[]; scanned: number[]; pageCount: number }> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages: PageText[] = [];
  const scanned: number[] = [];
  text.slice(0, MAX_PAGES).forEach((t, i) => {
    const clean = t.replace(/[ \t]+\n/g, "\n").trim();
    if (clean.replace(/\s/g, "").length < SCANNED_THRESHOLD) scanned.push(i + 1);
    else pages.push({ page: i + 1, text: clean, method: "pdf_text", uncertain: false });
  });
  return { pages, scanned, pageCount: totalPages };
}

/** Renders one PDF page to a PNG data URL for vision OCR. */
export async function renderPdfPage(buf: Uint8Array, page: number): Promise<string> {
  const { renderPageAsImage } = await import("unpdf");
  return renderPageAsImage(new Uint8Array(buf), page, { canvasImport: () => import("@napi-rs/canvas"), scale: 2, toDataURL: true });
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

function inlineHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  ).replace(/\s+/g, " ").trim();
}

/** Minimal HTML → Markdown for mammoth output: paragraphs, lists, tables (as pipe tables). */
export function htmlToMarkdown(html: string): string {
  const out: string[] = [];
  const blockRe = /<table[\s\S]*?<\/table>|<(p|h[1-6]|li)[^>]*>[\s\S]*?<\/\1>/gi;
  for (const m of html.matchAll(blockRe)) {
    const block = m[0];
    if (/^<table/i.test(block)) {
      const rows = [...block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => inlineHtml(c[1]!).replace(/\|/g, "\\|")));
      if (rows.length) {
        const width = Math.max(...rows.map((r) => r.length));
        const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
        out.push(`| ${pad(rows[0]!).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`, ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`), "");
      }
    } else if (/^<li/i.test(block)) {
      out.push(`- ${inlineHtml(block)}`);
    } else {
      const t = inlineHtml(block);
      if (t) out.push(t, "");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractDocx(buf: Uint8Array): Promise<{ pages: PageText[]; imageCount: number }> {
  const mammoth = await import("mammoth");
  let imageCount = 0;
  const { value } = await mammoth.convertToHtml(
    { buffer: Buffer.from(buf) },
    {
      convertImage: mammoth.images.imgElement(async () => {
        imageCount++;
        return { src: "" };
      }),
    },
  );
  return { pages: [{ page: 1, text: htmlToMarkdown(value), method: "docx", uncertain: false }], imageCount };
}

export function toDataUrl(buf: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
}
