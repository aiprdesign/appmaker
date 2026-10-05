import type { FileMap } from "./types";

/**
 * Builds the HTML document that runs a generated app inside the sandboxed
 * preview iframe. The app's files are compiled in the iframe with Babel and
 * wired together with a tiny CommonJS loader; `react-native` resolves to
 * React Native Web from the self-hosted runtime in /public/preview.
 */
export function buildPreviewHtml(files: FileMap, origin: string, platform: "ios" | "android" | "ipad", scheme?: "light" | "dark", opts: { test?: boolean } = {}): string {
  // An iPad runs iOS; the runtime gets "ipad" for its safe areas and Platform.isPad.
  const payload = JSON.stringify({ files, platform: platform === "ipad" ? "ios" : platform, device: platform, scheme: scheme ?? null, test: !!opts.test }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html, body, #root { height: 100%; margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Roboto, "Segoe UI", sans-serif; background: ${scheme === "dark" ? "#0B0B10" : "#fff"}; overflow: hidden; }
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
  if (payload.scheme) window.__APPMAKER_SCHEME__ = payload.scheme;
  window.__APPMAKER_DEVICE__ = payload.device;
  var files = payload.files;
  var post = function (msg) { parent.postMessage(Object.assign({ source: "appmaker-preview" }, msg), "*"); };
  var reported = false;
  // Tap-test mode (a hidden copy of the app): crashes are collected, not posted,
  // pop-ups don't block, and nothing is sent to servers.
  var testErrors = [];
  var lastTapped = "";
  if (payload.test) {
    window.alert = function () {};
    window.confirm = function () { return true; };
    window.prompt = function () { return null; };
    // Photo pickers never open in the hidden copy: they act as if the person cancelled.
    var realClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type !== "file") return realClick.apply(this, arguments);
      var input = this;
      setTimeout(function () { input.dispatchEvent(new Event("cancel")); }, 0);
    };
    var realFetch = window.fetch;
    window.fetch = function (input, init) {
      var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") return Promise.resolve(new Response("{}", { status: 503, headers: { "content-type": "application/json" } }));
      return realFetch.apply(window, arguments);
    };
  }
  var report = function (message, stack) {
    if (payload.test) {
      if (testErrors.length < 3) testErrors.push({ message: String(message).slice(0, 300), after: lastTapped });
      return;
    }
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
    if (Platform) { try { Platform.OS = payload.platform; Platform.isPad = payload.device === "ipad"; } catch (_) {} }

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
    // The rest of the quality bar, measured on the first screen with the same
    // limits as the app-quality grader: readable contrast, text size, nothing
    // wider than the phone, and big enough buttons.
    var screenIssues = function () {
      var root = document.getElementById("root");
      var vw = window.innerWidth;
      var parse = function (c) { var m = (c.match(/[\\d.]+/g) || [0, 0, 0, 0]).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
      var lum = function (c) {
        var f = function (v) { var x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      var background = function (el) {
        while (el) { var c = parse(getComputedStyle(el).backgroundColor); if (c.a > 0.5) return c; el = el.parentElement; }
        return { r: 255, g: 255, b: 255 };
      };
      var textEls = 0, low = [], tiny = [], overflow = 0, buttons = 0, small = [], unlabeled = 0;
      Array.prototype.forEach.call(root.querySelectorAll("*"), function (el) {
        var r = el.getBoundingClientRect();
        var style = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || style.visibility === "hidden" || Number(style.opacity) < 0.1 || r.bottom < 0 || r.top > window.innerHeight) return;
        if (style.cursor === "pointer" && !(el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer")) {
          buttons++;
          if (!(el.innerText || "").trim() && !el.getAttribute("aria-label") && !el.querySelector("[aria-label]")) unlabeled++;
          if (r.width < 40 || r.height < 40) small.push('"' + (el.innerText || el.getAttribute("aria-label") || "icon").trim().slice(0, 20) + '" ' + Math.round(r.width) + "×" + Math.round(r.height));
        }
        if (r.right > vw + 2 || r.left < -2) {
          var carousel = false;
          for (var p = el.parentElement; p; p = p.parentElement) {
            var ps = getComputedStyle(p);
            if ((ps.overflowX === "auto" || ps.overflowX === "scroll") && ps.overflowY !== "auto" && ps.overflowY !== "scroll") { carousel = true; break; }
          }
          if (!carousel) overflow++;
        }
        var hasText = Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
        if (!hasText) return;
        var text = el.innerText.trim();
        if (!/[A-Za-z0-9]/.test(text)) return;
        textEls++;
        var size = parseFloat(style.fontSize);
        if (size < 11) tiny.push('"' + text.slice(0, 20) + '" ' + size + "px");
        var fg = parse(style.color);
        var L1 = lum(fg), L2 = lum(background(el));
        var ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        var large = size >= 18 || (size >= 14 && Number(style.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5) && fg.a > 0.3) low.push('"' + text.slice(0, 20) + '" ' + ratio.toFixed(1) + ":1");
      });
      var out = [];
      if (low.length > Math.max(1, textEls * 0.05)) out.push({ kind: "contrast", message: "Text is hard to read (below WCAG AA contrast): " + low.slice(0, 3).join(", ") + "." });
      if (tiny.length) out.push({ kind: "text-size", message: "Text smaller than 11pt: " + tiny.slice(0, 3).join(", ") + "." });
      if (overflow) out.push({ kind: "overflow", message: overflow + " element" + (overflow === 1 ? " is" : "s are") + " wider than the screen and cut off." });
      if (unlabeled) out.push({ kind: "label", message: unlabeled + " button" + (unlabeled === 1 ? " has" : "s have") + " no label for screen readers (icon-only buttons need an accessibilityLabel)." });
      if (buttons && small.length > buttons * 0.1) out.push({ kind: "touch", message: "Buttons smaller than 44pt, hard to tap: " + small.slice(0, 3).join(", ") + "." });
      return out;
    };
    // The tap test: like a first-time user, fill in forms and tap every control.
    var tapTest = async function () {
      var root = document.getElementById("root");
      var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
      var token = "Test" + Math.floor(Math.random() * 9000 + 1000);
      var PRIMARY = /\\b(add|save|create|done|submit|log|start|new|ok|confirm|post|send)\\b|^\\+/i;
      var shown = function (el) {
        var r = el.getBoundingClientRect();
        var st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && r.bottom > 0 && r.top < window.innerHeight;
      };
      var label = function (el) { return ((el.innerText || el.getAttribute("aria-label") || "").trim() || "an icon button").slice(0, 40); };
      var controls = function () {
        return Array.prototype.filter.call(root.querySelectorAll("*"), function (el) {
          return getComputedStyle(el).cursor === "pointer" && !(el.parentElement && getComputedStyle(el.parentElement).cursor === "pointer") && shown(el);
        });
      };
      var typed = false, tokenSeen = false, savedAfterTyping = "", taps = 0, tried = {};
      var fill = function () {
        Array.prototype.forEach.call(root.querySelectorAll("input, textarea"), function (input) {
          if (!shown(input) || input.value) return;
          var hint = ((input.getAttribute("placeholder") || "") + " " + (input.getAttribute("aria-label") || "")).toLowerCase();
          if (/search|filter|find/.test(hint)) return;
          var numeric = /decimal|numeric|number|tel/.test(input.getAttribute("inputmode") || "") || /amount|price|qty|quantity|how many|minutes|phone/.test(hint);
          var proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value").set.call(input, numeric ? "4255501234" : token + " item");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          typed = true;
        });
      };
      // Text typed into inputs isn't part of innerText: finding it means it was saved and shown.
      var seen = function () { return document.body.innerText.indexOf(token + " item") !== -1; };
      for (var round = 0; round < 30 && !testErrors.length; round++) {
        fill();
        await wait(50);
        var list = controls().filter(function (el) { return !tried[label(el) + "|" + Math.round(el.getBoundingClientRect().top / 10)]; });
        var next = (typed && list.find(function (el) { return PRIMARY.test(label(el)); })) || list[0];
        if (!next) break;
        tried[label(next) + "|" + Math.round(next.getBoundingClientRect().top / 10)] = true;
        lastTapped = label(next);
        if (typed && PRIMARY.test(lastTapped) && !savedAfterTyping) savedAfterTyping = lastTapped;
        next.click();
        taps++;
        await wait(150);
        if (savedAfterTyping && seen()) tokenSeen = true;
      }
      return { taps: taps, errors: testErrors, deadSave: !!savedAfterTyping && !tokenSeen && !testErrors.length ? savedAfterTyping : "" };
    };
    if (payload.test) {
      setTimeout(function () {
        tapTest()
          .then(function (result) { post({ type: "taptest", result: result }); })
          .catch(function (e) { post({ type: "taptest", result: { taps: 0, errors: [{ message: String(e && e.message || e), after: lastTapped }], deadSave: "" } }); });
      }, 1200);
      return;
    }
    setTimeout(function () {
      try {
        var issue = layoutIssue();
        window.__layoutIssue = issue;
        var issues = (issue ? [{ kind: "layout", message: issue }] : []).concat(screenIssues());
        window.__screenIssues = issues;
        if (!reported) post({ type: "quality", issues: issues });
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
