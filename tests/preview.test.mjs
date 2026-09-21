import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const result = await build({
  entryPoints: ["src/preview.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "raw",
      setup(b) {
        b.onResolve({ filter: /\?raw$/ }, (args) => ({
          path: new URL("../src/generated/preview-runtime.js", import.meta.url)
            .pathname,
          namespace: "raw",
        }));
        b.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({
          contents: await readFile(args.path, "utf8"),
          loader: "text",
        }));
      },
    },
  ],
});
const { buildPreview, exampleSource } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
test("React is bundled locally and JSX compiles", () => {
  const html = buildPreview(exampleSource, "tsx");
  assert.match(html, /window.renderPreview\(App, input\)/);
  assert.doesNotMatch(html, /<script src=/);
  assert.match(html, /React.createElement/);
});
test("preview denies network and forms", () => {
  for (const language of ["html", "tsx"]) {
    const html = buildPreview(
      language === "html" ? "<p>Hello</p>" : exampleSource,
      language,
    );
    assert.match(html, /connect-src 'none'/);
    assert.match(html, /form-action 'none'/);
    assert.match(html, /default-src 'none'/);
  }
});
test("invalid TSX and oversized source reject", () => {
  assert.throws(() => buildPreview("function App( { return <", "tsx"));
  assert.throws(() => buildPreview("a".repeat(100001), "html"), /100 KB/);
});
test("embedded script closing tags cannot terminate the runtime script", () => {
  const html = buildPreview(
    'function App() { return <p>{"</script><script>alert(1)</script>"}</p> }',
    "tsx",
  );
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
});
