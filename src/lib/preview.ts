import type { FileMap } from "./types";

/**
 * Builds the HTML document that runs a generated app inside the sandboxed
 * preview iframe. The app's files are compiled in the iframe with Babel and
 * wired together with a tiny CommonJS loader; `react-native` resolves to
 * React Native Web from the self-hosted runtime in /public/preview.
 */
export function buildPreviewHtml(files: FileMap, origin: string, platform: "ios" | "android"): string {
  const payload = JSON.stringify({ files, platform }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body, #root { height: 100%; margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Roboto, "Segoe UI", sans-serif; background: #fff; overflow: hidden; }
  #root { display: flex; }
  #root > div { flex: 1; }
  ::-webkit-scrollbar { display: none; }
</style>
<script src="${origin}/preview/runtime.js"></script>
<script src="${origin}/preview/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  var payload = ${payload};
  var files = payload.files;
  var post = function (msg) { parent.postMessage(Object.assign({ source: "appmaker-preview" }, msg), "*"); };
  var reported = false;
  var report = function (message, stack) {
    if (reported) return;
    reported = true;
    post({ type: "error", message: String(message), stack: stack ? String(stack) : "" });
  };
  window.addEventListener("error", function (e) { report(e.message, e.error && e.error.stack); });
  window.addEventListener("unhandledrejection", function (e) { report(e.reason && e.reason.message || e.reason, e.reason && e.reason.stack); });
  ["log", "warn", "error"].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      try { post({ type: "console", level: level, args: Array.prototype.map.call(arguments, function (a) { try { return typeof a === "string" ? a : JSON.stringify(a); } catch (_) { return String(a); } }) }); } catch (_) {}
      orig.apply(console, arguments);
    };
  });

  try {
    var RT = window.__APPMAKER_RUNTIME__;
    if (!RT || !window.Babel) throw new Error("Preview runtime failed to load.");
    var Platform = RT.modules["react-native"].Platform;
    if (Platform) { try { Platform.OS = payload.platform; } catch (_) {} }

    var cache = {};
    var dirname = function (p) { var i = p.lastIndexOf("/"); return i === -1 ? "" : p.slice(0, i); };
    var join = function (base, rel) {
      var parts = (base ? base.split("/") : []).concat(rel.split("/"));
      var out = [];
      parts.forEach(function (seg) {
        if (!seg || seg === ".") return;
        if (seg === "..") out.pop(); else out.push(seg);
      });
      return out.join("/");
    };
    var resolve = function (from, spec) {
      var base = join(dirname(from), spec);
      var candidates = [base, base + ".js", base + ".jsx", base + ".json", base + "/index.js", base + "/index.jsx"];
      for (var i = 0; i < candidates.length; i++) if (files[candidates[i]] != null) return candidates[i];
      throw new Error("Cannot find module '" + spec + "' imported from " + from);
    };
    var load = function (path) {
      if (cache[path]) return cache[path].exports;
      var module = { exports: {} };
      cache[path] = module;
      var source = files[path];
      if (/\\.json$/.test(path)) { module.exports = JSON.parse(source); return module.exports; }
      var code;
      try {
        code = window.Babel.transform(source, {
          filename: path,
          presets: [["react", { runtime: "automatic" }]],
          plugins: ["transform-modules-commonjs"],
        }).code;
      } catch (e) {
        throw new Error("Syntax error in " + path + ": " + e.message);
      }
      var localRequire = function (spec) {
        if (spec.charAt(0) === ".") return load(resolve(path, spec));
        var mod = RT.modules[spec];
        if (!mod) throw new Error("Module '" + spec + "' is not available in the preview. Use react-native built-ins instead.");
        return mod;
      };
      new Function("require", "module", "exports", code)(localRequire, module, module.exports);
      return module.exports;
    };

    var entry = files["App.js"] != null ? "App.js" : files["App.jsx"] != null ? "App.jsx" : null;
    if (!entry) throw new Error("App.js was not found.");
    var App = load(entry);
    App = App && App.default ? App.default : App;
    if (typeof App !== "function" && typeof App !== "object") throw new Error("App.js must default-export a React component.");

    var React = RT.React;
    var Boundary = (function () {
      function B(props) { React.Component.call(this, props); this.state = { error: null }; }
      B.prototype = Object.create(React.Component.prototype);
      B.getDerivedStateFromError = function (error) { return { error: error }; };
      B.prototype.componentDidCatch = function (error) { report(error.message, error.stack); };
      B.prototype.render = function () {
        if (this.state.error) {
          return React.createElement("div", { style: { padding: 24, paddingTop: 70, color: "#b91c1c", fontSize: 14, fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" } }, "⚠️ " + this.state.error.message);
        }
        return this.props.children;
      };
      return B;
    })();

    var AppRegistry = RT.modules["react-native"].AppRegistry;
    AppRegistry.registerComponent("main", function () {
      return function Root() { return React.createElement(Boundary, null, React.createElement(App)); };
    });
    AppRegistry.runApplication("main", { rootTag: document.getElementById("root") });
    post({ type: "ready" });

    // Layout check: the app should fill the screen, with a bottom tab bar at
    // the bottom. Catches a root View without flex: 1 or a fixed screen height.
    var layoutIssue = function () {
      var root = document.getElementById("root");
      var H = window.innerHeight, W = window.innerWidth;
      if (!root || !root.firstElementChild) return null;
      var empty = function (el) { return !el || el === document.body || el === document.documentElement || el === root || el === root.firstElementChild; };
      var hits = [H - 24, H - 90].map(function (y) { return document.elementFromPoint(W / 2, y); });
      if (hits.every(empty)) {
        // Where the app's content ends: scan up from the bottom of the screen.
        var bottom = 0;
        for (var y = H - 1; y > 0; y -= 4) {
          if (!empty(document.elementFromPoint(W / 2, y))) { bottom = y + 1; break; }
        }
        return "The app only fills the top " + Math.round(bottom) + "px of the " + H + "px-tall screen, leaving an empty band at the bottom.";
      }
      // A bottom tab bar (a full-width row of 3+ tappable items in the lower half) must sit at the bottom.
      var pointer = function (el) { return getComputedStyle(el).cursor === "pointer"; };
      var rows = new Map();
      Array.prototype.forEach.call(root.querySelectorAll("*"), function (el) {
        if (!pointer(el) || (el.parentElement && pointer(el.parentElement))) return;
        var parent = el.parentElement;
        if (!parent) return;
        if (!rows.has(parent)) rows.set(parent, []);
        rows.get(parent).push(el.getBoundingClientRect());
      });
      var issue = null;
      rows.forEach(function (rects, parent) {
        if (issue || rects.length < 3) return;
        var r = parent.getBoundingClientRect();
        var sameRow = rects.every(function (x) { return Math.abs(x.top - rects[0].top) < 6; });
        if (!sameRow || r.width < W * 0.8 || r.top < H * 0.5 || r.bottom > H - 48) return;
        var below = document.elementFromPoint(W / 2, Math.min(H - 4, (r.bottom + H) / 2));
        if (below && (empty(below) || below.contains(parent))) {
          issue = "The bottom tab bar ends at " + Math.round(r.bottom) + "px instead of at the bottom of the " + H + "px-tall screen, with empty space below it.";
        }
      });
      return issue;
    };
    setTimeout(function () {
      try {
        var issue = layoutIssue();
        window.__layoutIssue = issue;
        if (issue && !reported) post({ type: "layout", message: issue });
      } catch (_) {}
    }, 1500);
  } catch (e) {
    report(e.message, e.stack);
    document.getElementById("root").innerHTML = '<pre style="padding:24px;padding-top:70px;color:#b91c1c;font:13px ui-monospace,monospace;white-space:pre-wrap"></pre>';
    document.querySelector("pre").textContent = "⚠️ " + e.message;
  }
})();
</script>
</body>
</html>`;
}
