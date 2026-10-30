"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png";

export function DocumentUploadForm({ subjects, aiReady }: { subjects: string[]; aiReady: boolean }) {
  const { d } = useI18n();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return setError(d.documents.fileTooLarge);
    if (!/\.(pdf|docx|jpe?g|png)$/i.test(f.name)) return setError(d.documents.fileType);
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (subject) fd.append("subject", subject);
      if (grade) fd.append("grade", grade);
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setError(json.error === "fileTooLarge" ? d.documents.fileTooLarge : json.error === "fileType" ? d.documents.fileType : json.error === "rateLimited" ? d.errors.rateLimited : d.errors.uploadFailed);
        return;
      }
      router.push(`/teacher/documents/${json.id}`);
    } catch {
      setError(d.errors.network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!aiReady && <Alert tone="warning">{d.documents.aiUnavailable}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={cn("flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors", drag ? "border-primary bg-primary-soft" : "border-input bg-surface hover:bg-muted/50")}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <span className="text-sm font-medium">{file ? file.name : d.documents.dropHere}</span>
        <span className="text-xs text-muted-foreground">{d.documents.uploadHint}</span>
      </button>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={d.common.subject} htmlFor="doc-subject" hint={d.documents.subjectHint}>
          <NativeSelect id="doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">—</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </Field>
        <Field label={d.common.grade} htmlFor="doc-grade">
          <Input id="doc-grade" inputMode="numeric" value={grade} onChange={(e) => setGrade(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </Field>
      </div>
      <div><Button onClick={submit} disabled={!file} loading={busy}><UploadCloud /> {d.documents.upload}</Button></div>
    </div>
  );
}
