import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const { d } = await getI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-semibold text-muted-foreground/40">404</p>
      <h1 className="text-lg font-semibold">{d.errors.notFound}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{d.errors.notFoundText}</p>
      <Button asChild className="mt-2"><Link href="/app">{d.errors.toHome}</Link></Button>
    </div>
  );
}
