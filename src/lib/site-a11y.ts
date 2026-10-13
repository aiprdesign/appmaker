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

/* Logo strips (clients, partners, "trusted by"): a smooth, endless scroll. Added by Appmaker.
   Markup: <div data-logo-marquee aria-label="Our clients"><ul><li><img src="…" alt="Company"></li>…</ul></div>
   Optional: data-direction="right", data-speed="slow" | "fast". */
(function () {
  var strips = document.querySelectorAll("[data-logo-marquee]");
  if (!strips.length) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = document.createElement("style");
  css.textContent =
    ".am-marquee{position:relative;overflow:hidden;--am-gap:3.5rem;-webkit-mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent);mask-image:linear-gradient(90deg,transparent,#000 9%,#000 91%,transparent)}" +
    ".am-marquee-track{display:flex;width:max-content;gap:var(--am-gap);animation:am-marquee var(--am-dur,40s) linear infinite;will-change:transform}" +
    ".am-marquee[data-direction=right] .am-marquee-track{animation-direction:reverse}" +
    ".am-marquee:hover .am-marquee-track,.am-marquee:focus-within .am-marquee-track,.am-marquee.is-paused .am-marquee-track{animation-play-state:paused}" +
    ".am-marquee-track>ul,.am-marquee-track>ol{display:flex;flex-wrap:nowrap;align-items:center;gap:var(--am-gap);margin:0;padding:0;list-style:none;flex-shrink:0}" +
    ".am-marquee-track li{flex-shrink:0;display:flex;align-items:center}" +
    // :where() keeps these as defaults: the site's own classes (h-8, h-12…) win.
    ":where(.am-marquee) img{height:var(--am-logo-h,2.5rem);width:auto;max-width:10rem;object-fit:contain}" +
    ".am-marquee.is-static{-webkit-mask-image:none;mask-image:none}" +
    ".am-marquee.is-static .am-marquee-track{animation:none;width:auto;justify-content:center}" +
    ".am-marquee.is-static .am-marquee-track>ul,.am-marquee.is-static .am-marquee-track>ol{flex-wrap:wrap;justify-content:center;row-gap:1.5rem}" +
    ".am-marquee-toggle{position:absolute;right:.25rem;top:50%;transform:translateY(-50%);width:2rem;height:2rem;border-radius:999px;border:0;background:rgba(0,0,0,.55);color:#fff;font:600 11px/1 system-ui;cursor:pointer;opacity:0;transition:opacity .2s}" +
    ".am-marquee:hover .am-marquee-toggle,.am-marquee-toggle:focus-visible,.am-marquee.is-paused .am-marquee-toggle{opacity:1}" +
    ".am-marquee-toggle:focus-visible{outline:2px solid #fff;outline-offset:2px}" +
    "@keyframes am-marquee{to{transform:translateX(calc(-50% - var(--am-gap) / 2))}}" +
    "@media (prefers-reduced-motion:reduce){.am-marquee-track{animation:none!important}}";
  document.head.appendChild(css);

  function quiet(node) {
    node.setAttribute("aria-hidden", "true");
    var focusable = node.querySelectorAll("a,button,input,select,textarea,[tabindex]");
    for (var i = 0; i < focusable.length; i++) focusable[i].setAttribute("tabindex", "-1");
    var imgs = node.querySelectorAll("img");
    for (var j = 0; j < imgs.length; j++) imgs[j].setAttribute("alt", "");
  }

  function setUp(strip) {
    if (strip.getAttribute("data-am-ready")) return;
    var list = strip.querySelector("ul,ol");
    if (!list) return;
    strip.setAttribute("data-am-ready", "1");
    strip.classList.add("am-marquee");
    if (!strip.getAttribute("role")) strip.setAttribute("role", "region");
    var items = list.children.length;
    var track = document.createElement("div");
    track.className = "am-marquee-track";
    list.parentNode.insertBefore(track, list);
    track.appendChild(list);
    // Too few logos to scroll, or motion turned off: a calm, centred row instead.
    if (items < 4 || reduce) {
      strip.classList.add("is-static");
      return;
    }
    // Repeat the logos inside the list until it's wider than the strip, then add one
    // copy of the whole list: moving by half of the track loops without a jump.
    var originals = Array.prototype.slice.call(list.children);
    var guard = 0;
    while (list.scrollWidth < strip.clientWidth * 1.1 && guard++ < 6) {
      for (var k = 0; k < originals.length; k++) {
        var extra = originals[k].cloneNode(true);
        quiet(extra);
        list.appendChild(extra);
      }
    }
    var copy = list.cloneNode(true);
    quiet(copy);
    track.appendChild(copy);
    var speed = { slow: 25, fast: 70 }[strip.getAttribute("data-speed")] || 40;
    strip.style.setProperty("--am-dur", Math.max(15, Math.round(list.scrollWidth / speed)) + "s");
    // A pause button for moving content (WCAG 2.2.2), shown on hover and keyboard focus.
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "am-marquee-toggle";
    toggle.setAttribute("aria-label", "Pause the logos");
    toggle.setAttribute("aria-pressed", "false");
    toggle.textContent = "II";
    toggle.addEventListener("click", function () {
      var paused = strip.classList.toggle("is-paused");
      toggle.setAttribute("aria-pressed", paused ? "true" : "false");
      toggle.setAttribute("aria-label", paused ? "Play the logos" : "Pause the logos");
      toggle.textContent = paused ? "\u25B6" : "II";
    });
    strip.appendChild(toggle);
  }

  function all() {
    for (var i = 0; i < strips.length; i++) setUp(strips[i]);
  }
  // Logos without a set size are measured once they've loaded.
  if (document.readyState === "complete") all();
  else window.addEventListener("load", all);
})();

/* Videos (YouTube, Vimeo, Instagram, TikTok): a still with a play button; the official
   player loads only when someone presses play (faster, and no tracking before that).
   Markup: <div data-video="https://www.youtube-nocookie.com/embed/ID" data-title="What it shows" class="aspect-video"></div>
   Optional: data-still="https://i.ytimg.com/vi/ID/hqdefault.jpg" (YouTube stills are found by themselves). Added by Appmaker. */
(function () {
  var OK = /^https:\\/\\/(www\\.youtube-nocookie\\.com\\/embed\\/|www\\.youtube\\.com\\/embed\\/|player\\.vimeo\\.com\\/video\\/|www\\.instagram\\.com\\/(p|reel)\\/[\\w-]+\\/embed|www\\.tiktok\\.com\\/embed\\/)/i;
  var boxes = document.querySelectorAll("[data-video]");
  if (!boxes.length) return;
  var css = document.createElement("style");
  css.textContent =
    ":where(.am-video){position:relative;overflow:hidden;background:#111}" +
    // :where() keeps 16:9 as a default: the site's own aspect class (aspect-[9/16]…) wins.
    ":where(.am-video){aspect-ratio:16/9}" +
    ".am-video-play{position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;cursor:pointer;background:#111 center/cover no-repeat;color:#fff}" +
    ".am-video-play::after{content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55),rgba(0,0,0,.05) 55%)}" +
    ".am-video-icon{position:absolute;left:50%;top:50%;z-index:1;width:4.25rem;height:4.25rem;margin:-2.125rem 0 0 -2.125rem;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 10px 30px rgba(0,0,0,.35);transition:transform .25s cubic-bezier(.22,1,.36,1)}" +
    ".am-video-icon::before{content:'';position:absolute;left:54%;top:50%;transform:translate(-50%,-50%);border-style:solid;border-width:.7rem 0 .7rem 1.15rem;border-color:transparent transparent transparent #111}" +
    ".am-video-play:hover .am-video-icon,.am-video-play:focus-visible .am-video-icon{transform:scale(1.08)}" +
    ".am-video-play:focus-visible{outline:3px solid #fff;outline-offset:-6px}" +
    ".am-video-title{position:absolute;left:1rem;right:1rem;bottom:.9rem;z-index:1;font:600 .95rem/1.3 system-ui,sans-serif;text-align:left;text-shadow:0 1px 3px rgba(0,0,0,.6)}" +
    ".am-video-note{position:absolute;left:50%;bottom:3.2rem;z-index:2;transform:translateX(-50%);max-width:90%;padding:.45rem .8rem;border-radius:999px;background:rgba(0,0,0,.75);color:#fff;font:500 .8rem/1.3 system-ui,sans-serif;text-align:center}" +
    ".am-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}" +
    "@media (prefers-reduced-motion:reduce){.am-video-icon{transition:none}}";
  document.head.appendChild(css);

  function still(src) {
    var m = /\\/embed\\/([\\w-]{11})/.exec(src);
    return m && /youtube/.test(src) ? "https://i.ytimg.com/vi/" + m[1] + "/hqdefault.jpg" : "";
  }

  for (var i = 0; i < boxes.length; i++) {
    (function (box) {
      var src = box.getAttribute("data-video") || "";
      if (!OK.test(src) || box.getAttribute("data-am-ready")) return;
      box.setAttribute("data-am-ready", "1");
      box.classList.add("am-video");
      var title = box.getAttribute("data-title") || "Video";
      var button = document.createElement("button");
      button.type = "button";
      button.className = "am-video-play";
      button.setAttribute("aria-label", "Play video: " + title);
      var picture = box.getAttribute("data-still") || still(src);
      if (picture) button.style.backgroundImage = "url(" + JSON.stringify(picture) + ")";
      var icon = document.createElement("span");
      icon.className = "am-video-icon";
      icon.setAttribute("aria-hidden", "true");
      var label = document.createElement("span");
      label.className = "am-video-title";
      label.textContent = title;
      button.appendChild(icon);
      button.appendChild(label);
      button.addEventListener("click", function () {
        // In Appmaker's preview, players can't run: say where it plays instead.
        if (window.__appmakerPreview) {
          if (!box.querySelector(".am-video-note")) {
            var note = document.createElement("span");
            note.className = "am-video-note";
            note.setAttribute("role", "status");
            note.textContent = "The video plays on your live site.";
            box.appendChild(note);
          }
          return;
        }
        var frame = document.createElement("iframe");
        var auto = /youtube|vimeo/.test(src) ? (src.indexOf("?") < 0 ? "?" : "&") + "autoplay=1" : "";
        frame.src = src + auto;
        frame.title = title;
        frame.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
        frame.setAttribute("allowfullscreen", "");
        frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        box.innerHTML = "";
        box.appendChild(frame);
        frame.focus();
      });
      box.innerHTML = "";
      box.appendChild(button);
    })(boxes[i]);
  }
})();

/* Skip links and other in-page links move keyboard focus to where they point, not
   just the scroll position, so the next Tab continues from there. Added by Appmaker. */
(function () {
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = decodeURIComponent(a.getAttribute("href").slice(1));
    var target = id && document.getElementById(id);
    if (!target) return;
    if (!target.hasAttribute("tabindex") && !target.matches("a,button,input,select,textarea")) target.setAttribute("tabindex", "-1");
    setTimeout(function () { target.focus({ preventScroll: true }); }, 0);
  });
})();

/* Small comforts on every page. Added by Appmaker. */
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = document.createElement("style");
  css.setAttribute("data-appmaker-comforts", "");
  css.textContent =
    /* 46. Anchored sections aren't hidden under a sticky header. */
    "[id]{scroll-margin-top:5rem}" +
    /* 47. Smooth scrolling, only for people who don't ask for less motion. */
    (reduce ? "" : "html{scroll-behavior:smooth}") +
    /* 48. A visible focus outline wherever the design forgot one. */
    ":where(a,button,input,select,textarea,summary,[tabindex]):focus-visible{outline:2px solid currentColor;outline-offset:2px}" +
    /* 49. Reduce motion means it: no long animations or transitions. */
    "@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}" +
    ".am-top{position:fixed;left:1rem;bottom:1rem;z-index:2147483000;min-width:44px;min-height:44px;border-radius:9999px;border:1px solid rgba(0,0,0,.2);background:#fff;color:#111;font:600 14px/1 system-ui,sans-serif;padding:0 14px;box-shadow:0 4px 14px rgba(0,0,0,.15)}.am-top[hidden]{display:none}" +
    "@media print{.am-top{display:none!important}}";
  document.head.appendChild(css);

  /* 50. Back to top on long pages. */
  if (document.documentElement.scrollHeight > window.innerHeight * 3) {
    var top = document.createElement("button");
    top.type = "button";
    top.className = "am-top";
    top.hidden = true;
    top.textContent = "Top";
    top.setAttribute("aria-label", "Back to top");
    top.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      var first = document.querySelector("h1") || document.body;
      if (!first.hasAttribute("tabindex")) first.setAttribute("tabindex", "-1");
      first.focus({ preventScroll: true });
    });
    document.body.appendChild(top);
    window.addEventListener("scroll", function () { top.hidden = window.scrollY < window.innerHeight * 1.5; }, { passive: true });
  }

  /* 51. Escape closes an open menu and returns focus to its button. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var open = document.querySelectorAll('button[aria-expanded="true"][aria-controls]');
    for (var i = 0; i < open.length; i++) {
      var b = open[i];
      if (b.closest(".a11y-ui")) continue;
      b.click();
      if (b.getAttribute("aria-expanded") === "true") {
        b.setAttribute("aria-expanded", "false");
        var panel = document.getElementById(b.getAttribute("aria-controls"));
        if (panel) panel.hidden = true;
      }
      b.focus();
    }
  });

  /* 52. A picture that fails to load doesn't leave a broken icon. */
  var imgs = document.images;
  for (var j = 0; j < imgs.length; j++) {
    if (imgs[j].complete && imgs[j].naturalWidth === 0 && imgs[j].getAttribute("src")) imgs[j].style.visibility = "hidden";
    imgs[j].addEventListener("error", function (ev) { ev.target.style.visibility = "hidden"; });
  }

  /* 53. Following a link into a closed <details> opens it. */
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    var t = id && document.getElementById(id);
    for (var d = t; d; d = d.parentElement) if (d.tagName === "DETAILS") d.open = true;
  }
  window.addEventListener("hashchange", openTarget);
  openTarget();
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
