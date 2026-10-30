"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("inline-flex flex-wrap gap-1 rounded-md bg-muted p-1", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn("rounded-sm px-3 py-1.5 text-[13px] font-medium text-muted-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm", className)}
      {...props}
    />
  );
}
export const TabsContent = TabsPrimitive.Content;
