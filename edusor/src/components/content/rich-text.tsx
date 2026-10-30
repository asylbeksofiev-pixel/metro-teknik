import { Fragment, type ReactNode } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

/**
 * Safe renderer for question content: paragraphs, **bold**, *italic*, `code`, pipe tables,
 * inline math $…$ and display math $$…$$. User text is never injected as HTML; only KaTeX
 * output (generated with trust disabled, which escapes its input) is set as HTML.
 */

function Math({ tex, display }: { tex: string; display: boolean }) {
  let html: string;
  try {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml" });
  } catch {
    return <code>{tex}</code>;
  }
  return display ? <div className="katex-block" dangerouslySetInnerHTML={{ __html: html }} /> : <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Splits text into math and non-math parts. Supports \$ escapes. */
function splitMath(text: string): { type: "text" | "inline" | "display"; value: string }[] {
  const out: { type: "text" | "inline" | "display"; value: string }[] = [];
  let i = 0;
  let buf = "";
  while (i < text.length) {
    if (text[i] === "\\" && text[i + 1] === "$") {
      buf += "$";
      i += 2;
      continue;
    }
    if (text[i] === "$") {
      const display = text[i + 1] === "$";
      const open = display ? 2 : 1;
      const close = text.indexOf(display ? "$$" : "$", i + open);
      if (close > i + open - 1) {
        if (buf) out.push({ type: "text", value: buf });
        buf = "";
        out.push({ type: display ? "display" : "inline", value: text.slice(i + open, close) });
        i = close + open;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) out.push({ type: "text", value: buf });
  return out;
}

function inlineFormat(text: string, keyPrefix: string, renderToken?: (token: string, key: string) => ReactNode): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\[\d{1,2}\]\])/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (tok.startsWith("[[")) nodes.push(renderToken ? renderToken(tok.slice(2, -2), key) : <span key={key} className="mx-0.5 inline-block min-w-12 border-b-2 border-dashed border-muted-foreground/50 text-center text-muted-foreground">{tok.slice(2, -2)}</span>);
    else if (tok.startsWith("**")) nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = idx + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderInline(text: string, key: string, renderToken?: (token: string, key: string) => ReactNode): ReactNode {
  return splitMath(text).map((part, i) =>
    part.type === "text" ? <Fragment key={`${key}-${i}`}>{inlineFormat(part.value, `${key}-${i}`, renderToken)}</Fragment> : <Math key={`${key}-${i}`} tex={part.value} display={part.type === "display"} />,
  );
}

function isTableRow(line: string) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function parseRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

export function RichText({ text, className, renderBlank }: { text: string; className?: string; renderBlank?: (blankId: string, key: string) => ReactNode }) {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let i = 0;
  const flush = () => {
    if (para.length) {
      const k = `p${blocks.length}`;
      blocks.push(
        <p key={k}>
          {para.map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {renderInline(l, `${k}-${j}`, renderBlank)}
            </Fragment>
          ))}
        </p>,
      );
      para = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]!)) {
      flush();
      const header = parseRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]!)) rows.push(parseRow(lines[i++]!));
      const k = `t${blocks.length}`;
      blocks.push(
        <table key={k}>
          <thead><tr>{header.map((h, j) => <th key={j}>{renderInline(h, `${k}-h${j}`, renderBlank)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, `${k}-${ri}-${ci}`, renderBlank)}</td>)}</tr>)}</tbody>
        </table>,
      );
      continue;
    }
    if (line.trim() === "") flush();
    else para.push(line);
    i++;
  }
  flush();
  return <div className={cn("prose-q", className)}>{blocks}</div>;
}

/** Single-line variant for options (no paragraphs/tables). */
export function InlineRich({ text, className }: { text: string; className?: string }) {
  return <span className={cn("prose-q", className)}>{renderInline(text ?? "", "i")}</span>;
}
