"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { publicEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  browserClient ??= createBrowserClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return browserClient;
}
