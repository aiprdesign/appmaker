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
console.log("preview runtime built -> public/preview/");
