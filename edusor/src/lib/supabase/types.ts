import type { Database } from "./database.types";

export type { Database };
export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
import type { Json } from "./database.types";
export type JsonObject = { [key: string]: Json | undefined };
