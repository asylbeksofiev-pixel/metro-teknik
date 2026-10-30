"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ReactNode } from "react";

export function Switch({ checked, onCheckedChange, label, hint, id, name, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode; id: string; name?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <SwitchPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-input transition-colors data-[state=checked]:bg-primary disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </SwitchPrimitive.Root>
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </label>
    </div>
  );
}
