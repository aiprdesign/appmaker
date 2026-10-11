// Builds the self-hosted preview sandbox runtime into public/preview/.
import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
mkdirSync("public/preview", { recursive: true });

await build({
  entryPoints: ["preview-runtime/entry.js"],
  bundle: true,
  minify: true,
  format: "iife",
  outfile: "public/preview/runtime.js",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

copyFileSync(require.resolve("@babel/standalone/babel.min.js"), "public/preview/babel.min.js");
// axe-core (MPL-2.0, used unmodified) audits redesigned websites for WCAG 2.2 AA in the preview.
copyFileSync(require.resolve("axe-core/axe.min.js"), "public/preview/axe.min.js");
copyFileSync(require.resolve("axe-core/LICENSE"), "public/preview/axe-core-LICENSE.txt");
console.log("preview runtime built -> public/preview/");
