import { defineConfig } from "tsup";

export default defineConfig({
    clean: true,
    dts: true,
    format: ["cjs", "esm"],
    sourcemap: true,
    splitting: false,
    target: "es2022",
    entry: ["src/**/*.ts", "!src/**/*.test.ts"],
});
