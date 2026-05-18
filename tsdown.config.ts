import { defineConfig } from "tsdown";

export default defineConfig({
    clean: true,
    dts: true,
    format: ["cjs", "esm"],
    sourcemap: true,
    target: "es2022",
    entry: ["src/**/*.ts", "!src/**/*.test.ts"],
});
