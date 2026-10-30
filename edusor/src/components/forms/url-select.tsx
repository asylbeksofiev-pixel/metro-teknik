"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NativeSelect } from "@/components/ui/input";

/** Select bound to a URL search param so server components can filter/sort. */
export function UrlSelect({ param, label, options, allLabel }: { param: string; label: string; options: { value: string; label: string }[]; allLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <NativeSelect
      aria-label={label}
      className="w-auto min-w-36"
      value={params.get(param) ?? (allLabel ? "" : options[0]?.value)}
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        if (e.target.value) next.set(param, e.target.value);
        else next.delete(param);
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
    >
      {allLabel && <option value="">{label}: {allLabel}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{allLabel ? `${label}: ${o.label}` : o.label}</option>)}
    </NativeSelect>
  );
}
