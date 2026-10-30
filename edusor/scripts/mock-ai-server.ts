/**
 * DEVELOPMENT/TEST ONLY: a deterministic mock of an OpenAI-compatible Chat Completions API.
 * It lets the AI pipelines (document structuring, OCR, grading suggestions, explanations,
 * practice) run end-to-end without a provider key. Every textual output is prefixed with
 * "[MOCK AI]" so it can never be mistaken for real model output.
 *
 *   node --experimental-strip-types scripts/mock-ai-server.ts   (listens on 127.0.0.1:4010)
 *   AI_API_BASE_URL=http://127.0.0.1:4010/v1  AI_API_KEY=mock
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_AI_PORT ?? 4010);

type Msg = { role: string; content: string | { type: string; text?: string }[] };
const text = (m: Msg | undefined) => (typeof m?.content === "string" ? m.content : (m?.content ?? []).map((p) => p.text ?? "").join("\n"));
const between = (s: string, tag: string) => s.match(new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`))?.[1] ?? "";

function structure(doc: string) {
  const blocks = doc.split(/\n(?=\s*\d{1,2}[.)]\s)/).map((b) => b.trim()).filter((b) => /^\d{1,2}[.)]\s/.test(b));
  const questions = blocks.map((b) => {
    const number = b.match(/^(\d{1,2})/)![1]!;
    const lines = b.replace(/^\d{1,2}[.)]\s*/, "").split("\n").map((l) => l.trim()).filter(Boolean);
    const optionLines = lines.filter((l) => /^[A-DА-Га-гa-d][).]\s/.test(l));
    const answer = b.match(/(?:Ответ|Жауабы)\s*[:：]\s*([A-DА-Гa-dа-г0-9,.\-]+)/i)?.[1];
    const points = Number(b.match(/\((\d+)\s*(?:балл|б\.|ұпай)/i)?.[1] ?? 0) || null;
    const prompt = lines.filter((l) => !optionLines.includes(l) && !/^(Ответ|Жауабы)\s*[:：]/i.test(l)).join("\n");
    if (optionLines.length >= 2) {
      return {
        number, type: "single_choice", prompt,
        options: optionLines.map((l) => ({ label: l[0]!, text: l.slice(2).trim() })),
        correctOptions: answer ? [answer[0]!] : null, points, uncertain: false,
      };
    }
    if (answer && /^-?\d+([.,]\d+)?$/.test(answer)) return { number, type: "numeric", prompt, numericAnswer: Number(answer.replace(",", ".")), points, uncertain: false };
    return { number, type: "essay", prompt, referenceAnswer: null, rubric: null, points, uncertain: false };
  });
  return { title: null, instructions: null, questions, warnings: questions.length ? [] : ["[MOCK AI] Не удалось найти пронумерованные вопросы."] };
}

function grade(user: string) {
  let criteria: { criterionId: string; maxPoints: number }[] = [];
  try {
    criteria = JSON.parse(between(user, "criteria"));
  } catch {
    criteria = [];
  }
  const answer = between(user, "student_answer");
  const empty = !answer.trim() || answer.includes("(empty)");
  const scored = criteria.map((c) => ({ criterionId: c.criterionId, score: empty ? 0 : Math.round(c.maxPoints * 0.5 * 2) / 2, comment: "[MOCK AI] Критерий выполнен частично." }));
  const total = scored.reduce((s, c) => s + c.score, 0);
  return {
    criteria: scored,
    suggestedScore: total,
    explanation: "[MOCK AI] Это тестовое предложение мок-сервера, а не оценка модели.",
    feedback: "[MOCK AI] Хорошее начало. Раскройте решение подробнее.",
    confidence: empty ? 0.95 : 0.62,
    needsManualReview: !empty,
  };
}

function reply(system: string, user: string, hasImage: boolean): unknown {
  if (/Reply with the JSON object \{"ok": true\}/.test(user)) return { ok: true };
  if (system.startsWith("Task: OCR")) return { text: hasImage ? "[MOCK AI] 1. Решите уравнение $x + 2 = 5$.\nОтвет: 3" : "", uncertain: false, notes: null };
  if (system.startsWith("Task: convert the text")) return structure(between(user, "document"));
  if (system.startsWith("Task: suggest a score")) return grade(user);
  if (system.includes("Summarize for the teacher")) return { summary: "[MOCK AI] Типичная ошибка: неверный перенос слагаемых.", patterns: [{ pattern: "[MOCK AI] знак при переносе", count: 1 }] };
  if (system.includes("Create ONE new practice question")) return { type: "numeric", prompt: "[MOCK AI] Решите уравнение $3x - 4 = 11$.", options: null, correctOptionIndex: null, numericAnswer: 5, numericTolerance: 0, acceptedAnswers: null, explanation: "[MOCK AI] $3x = 15$, $x = 5$." };
  if (system.includes('{"answer": string}')) return { answer: "[MOCK AI] Попробуйте записать каждый шаг отдельно и проверить знак при переносе." };
  if (system.includes('{"explanation": string}')) return { explanation: "[MOCK AI] **Почему ответ неверный.** Проверьте перенос слагаемых: при переносе через знак равенства знак меняется.\n\n**Как решать.** $2x + 6 = 0 \\Rightarrow 2x = -6 \\Rightarrow x = -3$." };
  return { error: "unknown task" };
}

createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body || "{}") as { model?: string; messages?: Msg[] };
    const messages = parsed.messages ?? [];
    const system = text(messages.find((m) => m.role === "system"));
    const userMsgs = messages.filter((m) => m.role === "user");
    const user = userMsgs.map(text).join("\n");
    const hasImage = userMsgs.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
    const content = JSON.stringify(reply(system, user, hasImage));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "mock", model: `mock:${parsed.model ?? "model"}`, choices: [{ index: 0, message: { role: "assistant", content } }], usage: { prompt_tokens: Math.ceil(body.length / 4), completion_tokens: Math.ceil(content.length / 4) } }));
  });
}).listen(PORT, "127.0.0.1", () => console.log(`[mock-ai] listening on http://127.0.0.1:${PORT}/v1 (development only)`));
