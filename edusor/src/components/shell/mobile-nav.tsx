"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Brand, SidebarNav } from "./sidebar";
import type { NavItem } from "./nav-config";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Menu">
        <Menu className="size-5" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 bg-sidebar py-4 text-white lg:hidden">
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Navigation</DialogPrimitive.Description>
          <div className="mb-4 flex items-center justify-between px-5">
            <Brand />
            <DialogPrimitive.Close className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-active" aria-label="Close">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <SidebarNav items={items} onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
