import type { FileMap } from "./types";

/**
 * The accessibility widget every Appmaker website gets: a small button in the
 * corner that opens settings visitors can change for themselves (bigger text,
 * high contrast, readable font, spacing, underlined links, no animations,
 * big cursor). Appmaker writes it, like an app's theme file, whatever the AI
 * wrote; it is plain JavaScript with no outside requests or tracking, and
 * remembers each visitor's choices in their own browser.
 */
export const A11Y_FILE = "a11y.js";

export const A11Y_WIDGET = `/* Accessibility settings for visitors. Added by Appmaker. */
(function () {
  if (window.__appmakerA11y) return;
  window.__appmakerA11y = true;
  var KEY = "a11y-settings";
  var OPTIONS = [
    ["text", "Bigger text", "Makes all text larger"],
    ["contrast", "High contrast", "Black, white and yellow for clearer reading"],
    ["font", "Readable font", "A plain font with wider letters"],
    ["spacing", "More spacing", "More space between lines, words and letters"],
    ["links", "Underline links", "Shows every link clearly"],
    ["motion", "Stop animations", "Turns off movement and transitions"],
    ["cursor", "Big cursor", "A larger mouse pointer"]
  ];
  var state = {};
  try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { state = {}; }
  var root = document.documentElement;

  var css = document.createElement("style");
  css.textContent = [
    ".a11y-text body{zoom:1.18}",
    "@supports not (zoom:1){.a11y-text{font-size:118%}}",
    ".a11y-contrast body, .a11y-contrast body *:not(.a11y-ui):not(.a11y-ui *){background:#000 !important;color:#fff !important;border-color:#fff !important;box-shadow:none !important;text-shadow:none !important}",
    ".a11y-contrast a, .a11y-contrast a *{color:#ffeb3b !important}",
    ".a11y-contrast img, .a11y-contrast video{filter:grayscale(1) contrast(1.2)}",
    ".a11y-font body, .a11y-font body *:not(.a11y-ui *){font-family:Verdana, Tahoma, 'Segoe UI', Arial, sans-serif !important;letter-spacing:0.02em}",
    ".a11y-spacing body *:not(.a11y-ui *){line-height:1.8 !important;word-spacing:0.16em !important;letter-spacing:0.04em !important}",
    ".a11y-links a{text-decoration:underline !important;text-underline-offset:3px;outline:2px solid currentColor;outline-offset:2px}",
    ".a11y-motion *, .a11y-motion *::before, .a11y-motion *::after{animation:none !important;transition:none !important;scroll-behavior:auto !important}",
    ".a11y-cursor, .a11y-cursor *{cursor:url(\\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 24 24'><path d='M4 2l16 9-7 2-3 7z' fill='black' stroke='white' stroke-width='1.5'/></svg>\\") 4 2, auto !important}",
    ".a11y-ui{position:fixed;left:16px;bottom:16px;z-index:2147483000;font:15px/1.4 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    ".a11y-ui *{box-sizing:border-box}",
    ".a11y-ui .a11y-open{width:52px;height:52px;border-radius:50%;border:2px solid #fff;background:#1d4ed8;color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)}",
    ".a11y-ui .a11y-open:focus-visible, .a11y-ui button:focus-visible{outline:3px solid #f59e0b;outline-offset:2px}",
    ".a11y-ui .a11y-panel{position:absolute;left:0;bottom:64px;width:min(320px,calc(100vw - 32px));max-height:min(520px,calc(100vh - 100px));overflow:auto;background:#fff;color:#111;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.35);padding:14px}",
    ".a11y-ui .a11y-panel[hidden]{display:none}",
    ".a11y-ui h2{font-size:17px;margin:2px 4px 10px;color:#111}",
    ".a11y-ui .a11y-option{display:flex;width:100%;align-items:center;gap:10px;min-height:48px;padding:8px 10px;margin:4px 0;border-radius:10px;border:2px solid #d1d5db;background:#fff;color:#111;text-align:left;cursor:pointer}",
    ".a11y-ui .a11y-option[aria-pressed=true]{border-color:#1d4ed8;background:#eff6ff}",
    ".a11y-ui .a11y-option small{display:block;color:#4b5563;font-size:12px}",
    ".a11y-ui .a11y-check{width:22px;height:22px;flex:none;border-radius:6px;border:2px solid #6b7280;display:grid;place-items:center}",
    ".a11y-ui .a11y-option[aria-pressed=true] .a11y-check{background:#1d4ed8;border-color:#1d4ed8;color:#fff}",
    ".a11y-ui .a11y-row{display:flex;gap:8px;margin-top:10px}",
    ".a11y-ui .a11y-row button{flex:1;min-height:44px;border-radius:10px;border:2px solid #d1d5db;background:#f9fafb;color:#111;cursor:pointer}"
  ].join("\\n");
  document.head.appendChild(css);

  function apply() {
    OPTIONS.forEach(function (o) { root.classList.toggle("a11y-" + o[0], !!state[o[0]]); });
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  apply();

  function build() {
    var ui = document.createElement("div");
    ui.className = "a11y-ui";
    var open = document.createElement("button");
    open.type = "button";
    open.className = "a11y-open";
    open.setAttribute("aria-label", "Accessibility settings");
    open.setAttribute("aria-expanded", "false");
    open.setAttribute("aria-controls", "a11y-panel");
    open.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M12 14.5l-3 6M12 14.5l3 6"/></svg>';
    var panel = document.createElement("div");
    panel.className = "a11y-panel";
    panel.id = "a11y-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Accessibility settings");
    panel.hidden = true;
    var title = document.createElement("h2");
    title.textContent = "Accessibility";
    panel.appendChild(title);
    OPTIONS.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "a11y-option";
      b.setAttribute("aria-pressed", state[o[0]] ? "true" : "false");
      b.innerHTML = '<span class="a11y-check" aria-hidden="true">' + (state[o[0]] ? "✓" : "") + "</span><span>" + o[1] + "<small>" + o[2] + "</small></span>";
      b.addEventListener("click", function () {
        state[o[0]] = !state[o[0]];
        b.setAttribute("aria-pressed", state[o[0]] ? "true" : "false");
        b.querySelector(".a11y-check").textContent = state[o[0]] ? "✓" : "";
        apply();
      });
      panel.appendChild(b);
    });
    var row = document.createElement("div");
    row.className = "a11y-row";
    var reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset all";
    reset.addEventListener("click", function () {
      state = {};
      apply();
      panel.querySelectorAll(".a11y-option").forEach(function (b) { b.setAttribute("aria-pressed", "false"); b.querySelector(".a11y-check").textContent = ""; });
    });
    var close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    function hide() { panel.hidden = true; open.setAttribute("aria-expanded", "false"); open.focus(); }
    close.addEventListener("click", hide);
    row.appendChild(reset);
    row.appendChild(close);
    panel.appendChild(row);
    open.addEventListener("click", function () {
      var show = panel.hidden;
      panel.hidden = !show;
      open.setAttribute("aria-expanded", show ? "true" : "false");
      if (show) panel.querySelector("button").focus();
    });
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
    ui.appendChild(panel);
    ui.appendChild(open);
    document.body.appendChild(ui);
  }
  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
`;

const TAG = /<script[^>]*src=["']\.?\/?(?:\.\.\/)?a11y\.js["'][^>]*>\s*<\/script>/i;

/** Every page loads the widget (pages one folder deep reach it one level up), and the file is Appmaker's. */
export function withA11yWidget(files: FileMap): FileMap {
  const out: FileMap = { ...files, [A11Y_FILE]: A11Y_WIDGET };
  for (const [path, code] of Object.entries(files)) {
    if (!path.endsWith(".html") || TAG.test(code)) continue;
    const tag = `<script src="${path.includes("/") ? "../" : ""}${A11Y_FILE}" defer></script>`;
    out[path] = /<\/body>/i.test(code) ? code.replace(/<\/body>/i, `${tag}\n</body>`) : `${code}\n${tag}`;
  }
  return out;
}
