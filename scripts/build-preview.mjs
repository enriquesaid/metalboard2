import { build } from "esbuild";
await build({
  entryPoints: ["src/preview-runtime.tsx"],
  outfile: "src/generated/preview-runtime.js",
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
});
