import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "supabase/**", "playwright-report/**", "test-results/**", "src/lib/supabase/database.types.ts", "next-env.d.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-imports": ["error", { paths: [{ name: "@/lib/supabase/admin", importNames: ["default"], message: "Use the named export createAdminClient in server-only modules." }] }],
    },
  },
];

export default config;
