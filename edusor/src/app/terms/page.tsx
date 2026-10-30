import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { LegalContent } from "@/components/legal-content";

export default async function Page() {
  const { d, locale } = await getI18n();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Link href="/" className="text-sm text-primary hover:underline">EduSOR</Link>
      <h1 className="mt-4 text-2xl font-semibold">{d.legal.termsTitle}</h1>
      <LegalContent kind="terms" locale={locale} />
    </main>
  );
}
