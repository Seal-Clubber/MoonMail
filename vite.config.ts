import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
export default defineConfig({
  base: process.env.GHOSTDROP_BASE || "./",
  plugins: [wasm()],
  build: { target: "esnext" },
  test: { include: ["tests/**/*.test.ts"] },
} as Parameters<typeof defineConfig>[0]);
