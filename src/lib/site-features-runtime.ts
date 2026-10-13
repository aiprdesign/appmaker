/**
 * features.js after its data line (see site-features.ts). Plain ES5 for every browser.
 * It's a template string: no backticks, no dollar-brace and no backslashes inside.
 */
export const FEATURES_RUNTIME = `(function () {
  var D = window.APPMAKER_SITE || {};
  var preview = !!window.__appmakerPreview || location.protocol === "about:";
  var base = (document.querySelector('script[src$="features.js"]') || {}).getAttribute ? document.querySelector('script[src$="features.js"]').getAttribute("src").replace(/features[.]js$/, "") : "";
  var css = document.createElement("style");
  css.textContent =
    ".am-bar{position:fixed;left:0;right:0;bottom:0;z-index:2147482990;display:flex;gap:6px;padding:8px 8px calc(8px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);border-top:1px solid rgba(0,0,0,.12);box-shadow:0 -4px 16px rgba(0,0,0,.08);font:600 14px/1.2 system-ui,sans-serif}" +
    ".am-bar a{flex:1;display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:12px;color:#111;text-decoration:none;background:rgba(0,0,0,.05)}" +
    ".am-bar a.am-primary{background:var(--am-color);color:var(--am-ink)}" +
    "@media (min-width:768px){.am-bar{display:none}}" +
    "@media (max-width:767px){body.am-has-bar{padding-bottom:72px}body.am-has-bar .a11y-ui,body.am-has-bar .am-top{bottom:84px!important}}" +
    "@media print{.am-bar,.am-tools,.am-dialog{display:none!important}}" +
    ".am-open{display:inline-flex;align-items:center;gap:6px;font:600 13px/1 system-ui,sans-serif;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.06);color:inherit}" +
    ".am-open::before{content:'';width:8px;height:8px;border-radius:50%;background:#9ca3af}.am-open.is-open::before{background:#16a34a}" +
    ".am-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.am-tools button{min-height:36px;padding:0 12px;border-radius:999px;border:1px solid currentColor;background:transparent;color:inherit;font:500 14px/1 system-ui,sans-serif;cursor:pointer;opacity:.85}.am-tools button:hover{opacity:1}" +
    ".am-dialog{border:0;padding:0;max-width:min(92vw,960px);width:100%;background:transparent;color:#111}.am-dialog::backdrop{background:rgba(0,0,0,.8)}" +
    ".am-panel{background:#fff;border-radius:16px;padding:16px;font:16px/1.5 system-ui,sans-serif}.am-panel input{width:100%;min-height:44px;padding:0 12px;border:1px solid #9ca3af;border-radius:10px;font:inherit}" +
    ".am-results{list-style:none;margin:12px 0 0;padding:0;max-height:60vh;overflow:auto}.am-results li{border-top:1px solid #e5e7eb}.am-results a{display:block;padding:10px 4px;color:#111;text-decoration:none}.am-results a:hover,.am-results a:focus{background:#f3f4f6}.am-results small{display:block;color:#4b5563}" +
    ".am-photo{position:relative;text-align:center}.am-photo img{max-width:100%;max-height:82vh;border-radius:12px;background:#222}.am-photo p{color:#fff;margin:8px 0 0;font:15px/1.4 system-ui,sans-serif}" +
    ".am-x,.am-prev,.am-next{position:absolute;min-width:44px;min-height:44px;border-radius:999px;border:0;background:rgba(0,0,0,.6);color:#fff;font:600 20px/1 system-ui,sans-serif;cursor:pointer}.am-x{top:8px;right:8px}.am-prev{left:8px;top:50%}.am-next{right:8px;top:50%}" +
    "main img.am-zoom{cursor:zoom-in}" +
    ".am-error{display:block;color:#b91c1c;font:500 14px/1.4 system-ui,sans-serif;margin-top:4px}.am-sent{margin-top:12px;padding:12px;border-radius:10px;background:rgba(22,163,74,.12)}";
  document.head.appendChild(css);
  document.documentElement.style.setProperty("--am-color", D.color || "#111");
  document.documentElement.style.setProperty("--am-ink", D.ink || "#fff");

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clock(min) {
    var h = Math.floor(min / 60) % 24, m = min % 60;
    try { return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: m ? "2-digit" : undefined }); } catch (e) { return pad(h) + ":" + pad(m); }
  }

  /* 2. Open now. */
  function openState() {
    if (!D.week) return null;
    var at = new Date(), d = at.getDay(), now = at.getHours() * 60 + at.getMinutes();
    var before = D.week[(d + 6) % 7] || [], today = D.week[d] || [], i;
    for (i = 0; i < before.length; i++) if (before[i][1] < before[i][0] && now < before[i][1]) return { open: true, until: before[i][1] };
    for (i = 0; i < today.length; i++) {
      var s = today[i][0], e = today[i][1];
      if (e < s ? now >= s : now >= s && now < e) return { open: true, until: e };
    }
    var next = null;
    for (i = 0; i < today.length; i++) if (today[i][0] > now && (next == null || today[i][0] < next)) next = today[i][0];
    return { open: false, opens: next };
  }
  function badge() {
    var st = openState();
    if (!st) return null;
    var b = el("span", { "class": "am-open" + (st.open ? " is-open" : ""), "data-appmaker-open": "" });
    b.textContent = st.open ? "Open now" + (st.until != null ? " · until " + clock(st.until) : "") : "Closed now" + (st.opens != null ? " · opens " + clock(st.opens) : "");
    return b;
  }

  /* 1. Quick actions on phones. */
  var actions = [];
  if (D.tel) actions.push(["tel:" + D.tel, "Call", "Call " + D.name]);
  if (D.whatsapp) actions.push([D.whatsapp, "WhatsApp", "Message " + D.name + " on WhatsApp (opens WhatsApp)"]);
  if (D.maps) actions.push([D.maps, "Directions", "Directions to " + D.name + " (opens the map)"]);
  if (D.booking) actions.push([D.booking, "Book", "Book with " + D.name + " (opens the booking page)"]);
  if (actions.length && !document.querySelector(".am-bar")) {
    var bar = el("nav", { "class": "am-bar", "aria-label": "Quick actions" });
    actions.slice(0, 4).forEach(function (a, i) {
      var link = el("a", { href: a[0], "aria-label": a[2] }, a[1]);
      if (!/^tel:/.test(a[0])) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
      if (a[1] === "Book" || (!D.booking && i === 0)) link.className = "am-primary";
      bar.appendChild(link);
    });
    document.body.appendChild(bar);
    document.body.classList.add("am-has-bar");
  }

  /* Footer tools: open badge, share, save contact, search. */
  var footer = document.querySelector("footer");
  var tools = el("div", { "class": "am-tools" });
  var b = badge();
  if (b && footer && !footer.querySelector("[data-appmaker-open]")) footer.insertBefore(b, footer.firstChild);

  /* 3. Share this page. */
  var share = el("button", { type: "button" }, "Share this page");
  share.addEventListener("click", function () {
    var data = { title: document.title, url: location.href };
    if (navigator.share) { navigator.share(data).catch(function () {}); return; }
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { share.textContent = "Link copied"; }, function () {});
  });
  tools.appendChild(share);

  /* 4. Save to contacts. */
  if (D.tel || D.email) {
    var save = el("button", { type: "button" }, "Save to contacts");
    save.addEventListener("click", function () {
      var esc = function (t) { return String(t).replace(/[,;]/g, " "); };
      var lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + esc(D.name), "ORG:" + esc(D.name)];
      if (D.tel) lines.push("TEL;TYPE=WORK:" + D.tel);
      if (D.email) lines.push("EMAIL;TYPE=WORK:" + D.email);
      if (D.address) lines.push("ADR;TYPE=WORK:;;" + esc(D.address) + ";;;;");
      if (D.site) lines.push("URL:" + D.site);
      lines.push("END:VCARD");
      var a = el("a", { href: URL.createObjectURL(new Blob([lines.join(String.fromCharCode(13, 10))], { type: "text/vcard" })), download: (D.name || "contact").replace(/[^a-z0-9]+/gi, "-") + ".vcf" });
      document.body.appendChild(a); a.click(); a.remove();
    });
    tools.appendChild(save);
  }

  /* 6. Search the site. */
  var search = el("button", { type: "button", "aria-keyshortcuts": "/" }, "Search this site");
  tools.appendChild(search);
  if (footer && !footer.querySelector(".am-tools")) footer.appendChild(tools);

  function dialog(label) {
    var d = el("dialog", { "class": "am-dialog", "aria-label": label });
    document.body.appendChild(d);
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    d.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); d.close(); } });
    return d;
  }
  var opener = null;
  function show(d) { opener = document.activeElement; if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
  function onClose(d) { d.addEventListener("close", function () { if (opener && opener.focus) opener.focus(); }); }

  var sd = null, input, list;
  function openSearch() {
    if (!sd) {
      sd = dialog("Search this site");
      var panel = el("div", { "class": "am-panel" });
      var label = el("label", { "for": "am-q" }, "Search " + (D.name || "this site"));
      input = el("input", { id: "am-q", type: "search", autocomplete: "off", "aria-describedby": "am-count" });
      var count = el("p", { id: "am-count", role: "status", style: "margin:8px 0 0;font-size:14px;color:#4b5563" });
      list = el("ul", { "class": "am-results" });
      var close = el("button", { type: "button", style: "margin-top:12px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid #9ca3af;background:#fff;cursor:pointer" }, "Close");
      close.addEventListener("click", function () { sd.close(); });
      panel.appendChild(label); panel.appendChild(input); panel.appendChild(count); panel.appendChild(list); panel.appendChild(close);
      sd.appendChild(panel);
      onClose(sd);
      var run = function () {
        var q = input.value.trim().toLowerCase(), pages = window.APPMAKER_SEARCH || [];
        list.textContent = "";
        if (!q) { count.textContent = ""; return; }
        var words = q.split(/ +/), hits = [];
        pages.forEach(function (p) {
          var hay = (p.title + " " + p.text).toLowerCase(), score = 0;
          for (var i = 0; i < words.length; i++) { if (hay.indexOf(words[i]) < 0) return; score += (p.title.toLowerCase().indexOf(words[i]) >= 0 ? 5 : 1); }
          var at = p.text.toLowerCase().indexOf(words[0]);
          hits.push({ p: p, score: score, snip: at < 0 ? p.text.slice(0, 140) : (at > 40 ? "…" : "") + p.text.slice(Math.max(0, at - 40), at + 100) + "…" });
        });
        hits.sort(function (a, b) { return b.score - a.score; });
        count.textContent = hits.length ? hits.length + (hits.length === 1 ? " page found" : " pages found") : "Nothing found. Try another word.";
        hits.slice(0, 12).forEach(function (h) {
          var li = el("li"), a = el("a", { href: base + h.p.url }, h.p.title);
          a.appendChild(el("small", {}, h.snip));
          li.appendChild(a); list.appendChild(li);
        });
      };
      input.addEventListener("input", run);
      if (!window.APPMAKER_SEARCH) {
        var s = el("script", { src: base + "search.js" });
        s.onload = run;
        document.head.appendChild(s);
      }
    }
    show(sd);
    input.focus();
  }
  search.addEventListener("click", openSearch);
  document.addEventListener("keydown", function (e) {
    var t = e.target && e.target.tagName;
    if ((e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t) && !(e.target && e.target.isContentEditable)) || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); openSearch(); }
  });

  /* 5. Pictures open full size. */
  var pics = [].slice.call(document.querySelectorAll("main img")).filter(function (img) {
    return !img.closest("a,button,[data-video],.am-marquee,picture[data-no-zoom]") && img.getAttribute("alt") !== "" && !img.hasAttribute("data-no-zoom");
  });
  var pd = null, current = 0;
  function openPhoto(i) {
    if (!pd) {
      pd = dialog("Picture");
      var box = el("div", { "class": "am-photo" });
      box.appendChild(el("img", { alt: "" }));
      box.appendChild(el("p", { id: "am-caption" }));
      var x = el("button", { type: "button", "class": "am-x", "aria-label": "Close picture" }, "×");
      var prev = el("button", { type: "button", "class": "am-prev", "aria-label": "Previous picture" }, "‹");
      var next = el("button", { type: "button", "class": "am-next", "aria-label": "Next picture" }, "›");
      x.addEventListener("click", function () { pd.close(); });
      prev.addEventListener("click", function () { openPhoto((current - 1 + pics.length) % pics.length); });
      next.addEventListener("click", function () { openPhoto((current + 1) % pics.length); });
      box.appendChild(x);
      if (pics.length > 1) { box.appendChild(prev); box.appendChild(next); }
      pd.appendChild(box);
      pd.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") prev.click();
        if (e.key === "ArrowRight") next.click();
      });
      onClose(pd);
    }
    current = i;
    var src = pics[i].currentSrc || pics[i].src, big = pd.querySelector("img");
    big.src = src;
    big.alt = pics[i].alt || "";
    pd.querySelector("p").textContent = pics[i].alt || "";
    if (!pd.open) show(pd);
    pd.querySelector(".am-x").focus();
  }
  pics.forEach(function (img, i) {
    var wide = function () {
      if (img.naturalWidth < 400 || img.clientWidth < 120 || img.clientWidth >= img.naturalWidth) return;
      img.classList.add("am-zoom");
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.setAttribute("aria-label", (img.alt || "Picture") + ", open full size");
    };
    if (img.complete) wide(); else img.addEventListener("load", wide);
    img.addEventListener("click", function () { if (img.classList.contains("am-zoom")) openPhoto(i); });
    img.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && img.classList.contains("am-zoom")) { e.preventDefault(); openPhoto(i); } });
  });

  /* 8. Forms: mistakes explained in text; with no server, they send by email. */
  [].slice.call(document.querySelectorAll("form")).forEach(function (form) {
    if (form.closest(".a11y-ui") || form.getAttribute("role") === "search") return;
    var action = (form.getAttribute("action") || "").trim();
    var noServer = !action || action === "#" || /^javascript:/i.test(action);
    form.setAttribute("novalidate", "");
    form.addEventListener("submit", function (e) {
      var fields = [].slice.call(form.elements).filter(function (f) { return f.willValidate; }), first = null;
      fields.forEach(function (f) {
        var id = (f.id || f.name || "f") + "-am-error", old = document.getElementById(id);
        if (old) old.remove();
        f.removeAttribute("aria-invalid");
        if (f.checkValidity()) return;
        var label = (f.labels && f.labels[0] ? f.labels[0].textContent : f.name || "This field").replace(/[*:]/g, "").trim();
        var msg = f.validity.valueMissing ? label + " is needed." : f.type === "email" ? "Enter an email address like name@example.com." : f.type === "tel" ? "Enter a phone number." : f.validationMessage || "Check " + label + ".";
        var err = el("span", { id: id, "class": "am-error" }, msg);
        f.insertAdjacentElement("afterend", err);
        f.setAttribute("aria-invalid", "true");
        f.setAttribute("aria-describedby", ((f.getAttribute("aria-describedby") || "").replace(id, "") + " " + id).trim());
        if (!first) first = f;
      });
      if (first) { e.preventDefault(); first.focus(); return; }
      if (!noServer) return;
      e.preventDefault();
      if (!D.email) return;
      var body = fields.filter(function (f) { return f.type !== "checkbox" || f.checked; }).map(function (f) {
        var label = (f.labels && f.labels[0] ? f.labels[0].textContent : f.name || f.id).replace(/[*:]/g, "").trim();
        return label + ": " + f.value;
      }).join(String.fromCharCode(10));
      location.href = "mailto:" + D.email + "?subject=" + encodeURIComponent("Message from the website") + "&body=" + encodeURIComponent(body);
      var done = form.querySelector(".am-sent") || el("p", { "class": "am-sent", role: "status" });
      done.textContent = "Your email app has opened with your message. Press Send there to send it to " + D.name + ". If nothing opened, email " + D.email + ".";
      form.appendChild(done);
    });
  });

  /* 7. Offline and install. */
  if (!preview && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    try { navigator.serviceWorker.register(base + "sw.js").catch(function () {}); } catch (e) {}
  }
})();
`;
