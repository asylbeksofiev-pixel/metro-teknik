"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Debounced search box synced to the `?q=` URL parameter (server components filter by it). */
export function SearchInput({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(param) ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(param, value);
      else next.delete(param);
      next.delete("page");
      const qs = next.toString();
      if (qs !== params.toString()) router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [value, param, params, pathname, router]);

  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-8" type="search" />
    </div>
  );
}
