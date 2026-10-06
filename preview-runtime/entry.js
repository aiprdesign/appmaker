// Bundled into public/preview/runtime.js. Exposes the modules a generated app
// may import, so the preview iframe needs no third-party CDN.
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import * as RNW from "react-native-web";
import * as lucide from "lucide";
import { toPng } from "html-to-image";

const memory = {};
const safeStorage = {
  get(k) {
    try { return window.localStorage.getItem(k); } catch { return k in memory ? memory[k] : null; }
  },
  set(k, v) {
    try { window.localStorage.setItem(k, v); } catch { memory[k] = v; }
  },
  remove(k) {
    try { window.localStorage.removeItem(k); } catch { delete memory[k]; }
  },
};

const AsyncStorage = {
  getItem: async (k) => safeStorage.get("app:" + k),
  setItem: async (k, v) => safeStorage.set("app:" + k, String(v)),
  removeItem: async (k) => safeStorage.remove("app:" + k),
  clear: async () => {},
  getAllKeys: async () => [],
  multiGet: async (keys) => Promise.all(keys.map(async (k) => [k, await AsyncStorage.getItem(k)])),
  multiSet: async (pairs) => { for (const [k, v] of pairs) await AsyncStorage.setItem(k, v); },
};

function StatusBar() { return null; }

// Safe areas like a real phone: the iPhone notch and home indicator, or the
// Android status bar. SafeAreaView pads only the edges it's asked for.
const insets = () =>
  window.__APPMAKER_DEVICE__ === "ipad"
    ? { top: 24, bottom: 20, left: 0, right: 0 }
    : RNW.Platform.OS === "android"
      ? { top: 24, bottom: 0, left: 0, right: 0 }
      : { top: 44, bottom: 24, left: 0, right: 0 };
const SafeAreaView = React.forwardRef(function SafeAreaView({ edges, mode, ...props }, ref) {
  const i = insets();
  const list = Array.isArray(edges) ? edges : edges && typeof edges === "object" ? Object.keys(edges).filter((k) => edges[k] !== "off") : ["top", "right", "bottom", "left"];
  const key = mode === "margin" ? "margin" : "padding";
  const pad = {};
  for (const edge of list) pad[key + edge[0].toUpperCase() + edge.slice(1)] = i[edge] || 0;
  return React.createElement(RNW.View, { ...props, ref, style: [{ flex: 1 }, pad, props.style] });
});

const safeArea = {
  SafeAreaView,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: insets,
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }),
  initialWindowMetrics: null,
};

const Haptics = {
  impactAsync: async () => {},
  notificationAsync: async () => {},
  selectionAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
};

// ---------------------------------------------------------------------------
// expo-notifications (preview): scheduling is simulated. Reminders due within
// the preview session appear as banners on the phone screen; longer schedules
// (daily, weekly…) show a confirmation so the user can see they were set.
// ---------------------------------------------------------------------------
const TRIGGER = { CALENDAR: "calendar", DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly", DATE: "date", TIME_INTERVAL: "timeInterval" };
const scheduled = new Map();
const timers = new Map();
const receivedListeners = new Set();
let nextId = 1;

function banner(title, body, kind) {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  if (kind === "link") el.setAttribute("data-link-note", "");
  el.style.cssText =
    "position:fixed;left:10px;right:10px;" +
    (kind === "link" ? "bottom:28px;" : "top:52px;") +
    "z-index:99999;border-radius:18px;padding:10px 14px;" +
    "font:13px -apple-system,BlinkMacSystemFont,Roboto,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25);" +
    "backdrop-filter:blur(12px);transition:opacity .3s,transform .3s;cursor:pointer;" +
    (kind === "scheduled" ? "background:rgba(30,30,40,.92);color:#fff;" : "background:rgba(250,250,252,.96);color:#111;");
  const t = document.createElement("div");
  t.style.cssText = "font-weight:700;margin-bottom:2px";
  t.textContent = title;
  const b = document.createElement("div");
  b.style.cssText = "opacity:.85";
  b.textContent = body;
  el.append(t, b);
  el.onclick = () => el.remove();
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-10px)";
    setTimeout(() => el.remove(), 300);
  }, 4500);
}

const pad = (n) => String(n).padStart(2, "0");
const clock = (h, m) => `${((h + 11) % 12) + 1}:${pad(m || 0)} ${h < 12 ? "AM" : "PM"}`;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeTrigger(trigger) {
  if (!trigger) return "now";
  switch (trigger.type) {
    case TRIGGER.DAILY: return `Every day at ${clock(trigger.hour, trigger.minute)}`;
    case TRIGGER.WEEKLY: return `Every ${DAYS[(trigger.weekday || 1) - 1]} at ${clock(trigger.hour, trigger.minute)}`;
    case TRIGGER.MONTHLY: return `Monthly on day ${trigger.day} at ${clock(trigger.hour, trigger.minute)}`;
    case TRIGGER.YEARLY: return `Yearly on ${trigger.month + 1}/${trigger.day} at ${clock(trigger.hour, trigger.minute)}`;
    case TRIGGER.DATE: return `On ${new Date(trigger.date).toLocaleString()}`;
    case TRIGGER.TIME_INTERVAL: return `${trigger.repeats ? "Every" : "In"} ${trigger.seconds} seconds`;
    default: return "Scheduled";
  }
}

function deliver(id) {
  const n = scheduled.get(id);
  if (!n) return;
  banner(n.content.title || "Reminder", n.content.body || "", "notification");
  receivedListeners.forEach((l) => {
    try { l({ date: Date.now(), request: { identifier: id, content: n.content, trigger: n.trigger } }); } catch {
      // A listener error must not break delivery to the others.
    }
  });
}

const PREVIEW_WINDOW_MS = 60 * 60 * 1000;
const granted = { status: "granted", granted: true, canAskAgain: true, expires: "never", ios: { status: 2 } };

const Notifications = {
  SchedulableTriggerInputTypes: TRIGGER,
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
  IosAuthorizationStatus: { NOT_DETERMINED: 0, DENIED: 1, AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  requestPermissionsAsync: async () => granted,
  getPermissionsAsync: async () => granted,
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => null,
  setBadgeCountAsync: async () => true,
  getBadgeCountAsync: async () => 0,
  dismissAllNotificationsAsync: async () => {},
  addNotificationReceivedListener: (fn) => { receivedListeners.add(fn); return { remove: () => receivedListeners.delete(fn) }; },
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  useLastNotificationResponse: () => null,
  getNextTriggerDateAsync: async () => null,
  scheduleNotificationAsync: async ({ content = {}, trigger = null } = {}) => {
    const id = `preview-${nextId++}`;
    scheduled.set(id, { content, trigger });
    if (!trigger) {
      deliver(id);
      return id;
    }
    let delay = null;
    if (trigger.type === TRIGGER.TIME_INTERVAL) delay = (trigger.seconds || 0) * 1000;
    if (trigger.type === TRIGGER.DATE) delay = new Date(trigger.date).getTime() - Date.now();
    if (delay != null && delay >= 0 && delay <= PREVIEW_WINDOW_MS) {
      const timer = trigger.repeats ? setInterval(() => deliver(id), Math.max(delay, 1000)) : setTimeout(() => deliver(id), delay);
      timers.set(id, timer);
      if (delay > 3000) banner("🔔 Reminder scheduled", `${describeTrigger(trigger)} — “${content.title || "Reminder"}”`, "scheduled");
    } else {
      banner("🔔 Reminder scheduled", `${describeTrigger(trigger)} — “${content.title || "Reminder"}”`, "scheduled");
    }
    return id;
  },
  cancelScheduledNotificationAsync: async (id) => {
    clearTimeout(timers.get(id));
    clearInterval(timers.get(id));
    timers.delete(id);
    scheduled.delete(id);
  },
  cancelAllScheduledNotificationsAsync: async () => {
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers.clear();
    scheduled.clear();
  },
  getAllScheduledNotificationsAsync: async () =>
    Array.from(scheduled, ([identifier, n]) => ({ identifier, content: n.content, trigger: n.trigger })),
};

// ---------------------------------------------------------------------------
// expo-image-picker (preview): opens the computer's file picker. Photos are
// downscaled so they don't fill up storage when the app saves them.
// ---------------------------------------------------------------------------
const MAX_SIDE = 1280;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that image."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't an image."));
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        let uri = reader.result;
        if (scale < 1 || file.size > 600000) {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          uri = canvas.toDataURL("image/jpeg", 0.8);
        }
        resolve({ uri, width: w, height: h, type: "image", mimeType: "image/jpeg", fileName: file.name, fileSize: file.size, assetId: null, base64: null, exif: null });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function pickImages(options, capture) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    if (options && options.allowsMultipleSelection) input.multiple = true;
    input.style.display = "none";
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []).slice(0, (options && options.selectionLimit) || 10);
      if (!files.length) return finish({ canceled: true, assets: null });
      Promise.all(files.map(readImage)).then((assets) => finish({ canceled: false, assets }), (e) => { done = true; input.remove(); reject(e); });
    });
    input.addEventListener("cancel", () => finish({ canceled: true, assets: null }));
    document.body.appendChild(input);
    input.click();
  });
}

const permissionHook = () => [granted, async () => granted, async () => granted];
const ImagePicker = {
  MediaTypeOptions: { All: "All", Images: "Images", Videos: "Videos" },
  launchImageLibraryAsync: (options) => pickImages(options, false),
  launchCameraAsync: (options) => pickImages(options, true),
  requestMediaLibraryPermissionsAsync: async () => granted,
  getMediaLibraryPermissionsAsync: async () => granted,
  requestCameraPermissionsAsync: async () => granted,
  getCameraPermissionsAsync: async () => granted,
  useMediaLibraryPermissions: permissionHook,
  useCameraPermissions: permissionHook,
  getPendingResultAsync: async () => null,
};

// ---------------------------------------------------------------------------
// lucide-react-native (preview): the same icons (ISC license) drawn as SVG,
// with the same props as the real library: color, size, strokeWidth,
// absoluteStrokeWidth and style. Every name the library exports works,
// including the Icon-suffixed and Lucide-prefixed forms.
// ---------------------------------------------------------------------------
const iconCache = new Map();
function lucideIcon(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const node = lucide[name];
  if (!Array.isArray(node)) return undefined;
  const Icon = React.forwardRef(function LucideIcon({ color = "currentColor", size = 24, strokeWidth = 2, absoluteStrokeWidth, style, ...rest }, ref) {
    const px = Number(size) || 24;
    return React.createElement(
      "svg",
      {
        ref,
        xmlns: "http://www.w3.org/2000/svg",
        width: px,
        height: px,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? (Number(strokeWidth) * 24) / px : strokeWidth,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { flexShrink: 0, ...(RNW.StyleSheet.flatten(style) || {}) },
        "aria-hidden": rest.accessibilityLabel ? undefined : true,
        "aria-label": rest.accessibilityLabel,
        "data-lucide": name,
      },
      node.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs })),
    );
  });
  Icon.displayName = name;
  iconCache.set(name, Icon);
  return Icon;
}
const LucideModule = { __esModule: true };
for (const name of Object.keys(lucide)) {
  if (!/^[A-Z]/.test(name) || !Array.isArray(lucide[name])) continue;
  for (const alias of [name, `${name}Icon`, `Lucide${name}`]) {
    Object.defineProperty(LucideModule, alias, { enumerable: true, get: () => lucideIcon(name) });
  }
}
Object.defineProperty(LucideModule, "createLucideIcon", { enumerable: true, get: () => () => () => null });

// Light or dark: the preview can show either (the sun/moon button), and
// otherwise follows the browser, like a phone follows its setting.
const colorScheme = () => window.__APPMAKER_SCHEME__ || RNW.Appearance.getColorScheme() || "light";
const Appearance = { ...RNW.Appearance, getColorScheme: colorScheme };
const useColorScheme = () => colorScheme();

function withDefault(mod, def) {
  return { __esModule: true, default: def, ...mod };
}

// expo-linear-gradient and expo-blur, drawn with CSS so the preview looks
// like the phone: the gradient (or the frosted backdrop) is set on the
// View's own element, so children stay on top exactly as on a device.
function useDomStyle(css) {
  const ref = React.useRef(null);
  const key = JSON.stringify(css);
  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !node.style) return;
    for (const [k, v] of Object.entries(css)) if (v != null) node.style[k] = v;
  }, [key]);
  return ref;
}
const point = (p, fallback) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p && typeof p === "object" ? { x: p.x ?? fallback.x, y: p.y ?? fallback.y } : fallback);
function LinearGradient({ colors, start, end, locations, style, children, ...rest }) {
  const s = point(start, { x: 0.5, y: 0 });
  const e = point(end, { x: 0.5, y: 1 });
  // CSS angles: 0deg points up, clockwise; React Native's y grows downwards.
  const angle = (Math.atan2(e.x - s.x, -(e.y - s.y)) * 180) / Math.PI;
  const list = Array.isArray(colors) && colors.length ? colors : ["transparent", "transparent"];
  const stops = list.map((c, i) => (locations && locations[i] != null ? `${c} ${locations[i] * 100}%` : c)).join(", ");
  const ref = useDomStyle({ backgroundImage: `linear-gradient(${angle}deg, ${stops})` });
  return React.createElement(RNW.View, { ...rest, ref, style }, children);
}
function BlurView({ intensity = 50, tint = "default", style, children, ...rest }) {
  const scheme = window.__APPMAKER_SCHEME__ || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const dark = /dark/i.test(tint) || (!/light/i.test(tint) && scheme === "dark");
  const flat = RNW.StyleSheet.flatten(style) || {};
  const blur = `blur(${Math.max(0, Math.min(100, intensity)) / 4}px) saturate(1.5)`;
  const ref = useDomStyle({
    backdropFilter: blur,
    webkitBackdropFilter: blur,
    backgroundColor: flat.backgroundColor ? null : dark ? "rgba(22, 22, 31, 0.55)" : "rgba(255, 255, 255, 0.6)",
  });
  return React.createElement(RNW.View, { ...rest, ref, style }, children);
}

// React Native Web's Alert does nothing, so confirmations ("Delete this?")
// would never show and their buttons never run. Use the browser's dialogs:
// one button (or none) is a notice; with a Cancel button it's a yes/no
// question whose "yes" runs the other button (the destructive one if several).
const AlertShim = {
  alert(title, message, buttons) {
    const text = [title, message].filter(Boolean).join("\n\n");
    const list = Array.isArray(buttons) ? buttons.filter(Boolean) : [];
    const run = (b) => b && typeof b.onPress === "function" && setTimeout(() => b.onPress(), 0);
    if (list.length <= 1) {
      window.alert(text);
      return run(list[0]);
    }
    const cancel = list.find((b) => b.style === "cancel") || list[0];
    const actions = list.filter((b) => b !== cancel);
    const chosen = actions.find((b) => b.style === "destructive") || actions[actions.length - 1];
    run(window.confirm(`${text}${chosen && chosen.text ? `\n\n${chosen.text}?` : ""}`) ? chosen : cancel);
  },
  prompt(title, message, callbackOrButtons) {
    const value = window.prompt([title, message].filter(Boolean).join("\n\n"));
    if (typeof callbackOrButtons === "function" && value != null) setTimeout(() => callbackOrButtons(value), 0);
  },
};

// Android's back button: apps register handlers; in the preview, Escape is "back".
const backHandlers = [];
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (let i = backHandlers.length - 1; i >= 0; i--) if (backHandlers[i]()) break;
});
const BackHandlerShim = {
  addEventListener(_type, handler) {
    backHandlers.push(handler);
    return { remove: () => BackHandlerShim.removeEventListener(_type, handler) };
  },
  removeEventListener(_type, handler) {
    const i = backHandlers.indexOf(handler);
    if (i >= 0) backHandlers.splice(i, 1);
  },
  exitApp() {},
};

// Links. The preview is sandboxed, so calls, emails, maps, WhatsApp and
// websites can't open from it. Say what the link does, and that it works in
// the real app on a phone, instead of silently doing nothing.
function describeLink(raw) {
  const url = String(raw || "");
  const after = (prefix) => decodeURIComponent(url.slice(prefix.length).split("?")[0]);
  try {
    if (/^tel:/i.test(url)) return `📞 Calls ${after("tel:")}`;
    if (/^(sms|smsto):/i.test(url)) return `💬 Texts ${after(url.split(":")[0] + ":")}`;
    if (/^mailto:/i.test(url)) return `✉️ Emails ${after("mailto:") || "you"}`;
    if (/^(whatsapp:|https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\b)/i.test(url)) return "💬 Opens a WhatsApp chat";
    if (/^(geo:|maps:|comgooglemaps:|https?:\/\/(maps\.apple\.com|maps\.google\.|www\.google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl))/i.test(url)) return "🗺️ Opens directions in Maps";
    if (/^https?:\/\//i.test(url)) return `🌐 Opens ${new URL(url).hostname.replace(/^www\./, "")}`;
    if (/^app-settings:/i.test(url)) return "⚙️ Opens the phone's Settings";
  } catch {
    // An odd link: fall through to the general note.
  }
  return "🔗 Opens a link";
}
function linkNote(url) {
  for (const old of document.querySelectorAll("[data-link-note]")) old.remove();
  banner(describeLink(url), "Links work in the real app, not in this preview. Test it on your phone: Test on a device → Your phone (Expo Go).", "link");
}
const LinkingShim = {
  ...RNW.Linking,
  openURL: async (url) => {
    linkNote(url);
    return true;
  },
  canOpenURL: async () => true,
  openSettings: async () => linkNote("app-settings:"),
  getInitialURL: async () => null,
};
// Plain web links (an <a href> from Text with href) get the same note.
document.addEventListener(
  "click",
  (e) => {
    const a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a || a.getAttribute("href").startsWith("#")) return;
    e.preventDefault();
    linkNote(a.href);
  },
  false,
);

// Sliders. React Native Web never fires onMomentumScrollEnd, where slideshows
// update their dots, so it's called here once scrolling settles.
const ScrollViewShim = React.forwardRef(function ScrollView({ onMomentumScrollEnd, onScroll, scrollEventThrottle, ...rest }, ref) {
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const handleScroll = onMomentumScrollEnd
    ? (e) => {
        if (onScroll) onScroll(e);
        const nativeEvent = e.nativeEvent;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          // Only once it has really stopped: an arrow tap may have just started the next slide moving.
          const at = [nativeEvent.contentOffset.x, nativeEvent.contentOffset.y];
          const mine = timer.current;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              if (timer.current === mine && nativeEvent.contentOffset.x === at[0] && nativeEvent.contentOffset.y === at[1]) onMomentumScrollEnd({ nativeEvent });
            }),
          );
        }, 140);
      }
    : onScroll;
  return React.createElement(RNW.ScrollView, {
    ...rest,
    ref,
    onScroll: handleScroll,
    scrollEventThrottle: onMomentumScrollEnd ? (scrollEventThrottle ?? 16) : scrollEventThrottle,
  });
});

// On a phone people swipe slides with a finger; in the preview a mouse can drag them too.
let drag = null;
let swallowClickUntil = 0;
const sideScroller = (start) => {
  for (let el = start; el && el !== document.body; el = el.parentElement) {
    const s = getComputedStyle(el);
    if ((s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) return el;
  }
  return null;
};
window.addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = sideScroller(e.target);
    if (el) drag = { el, x: e.clientX, left: el.scrollLeft, moved: false, paging: /x|both|inline/.test(getComputedStyle(el).scrollSnapType) };
  },
  true,
);
window.addEventListener(
  "pointermove",
  (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      drag.el.style.scrollSnapType = "none";
      document.body.style.userSelect = "none";
    }
    drag.el.scrollLeft = drag.left - dx;
  },
  true,
);
const endDrag = (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) return;
  document.body.style.userSelect = "";
  swallowClickUntil = Date.now() + 100;
  const dx = e.clientX - d.x;
  if (d.paging) {
    // Like a swipe: a short drag is enough to move one slide.
    const w = d.el.clientWidth;
    const page = Math.round(d.left / w) + (Math.abs(dx) > w * 0.12 ? (dx < 0 ? 1 : -1) : 0);
    const left = Math.max(0, Math.min(page * w, d.el.scrollWidth - w));
    // The browser's own scrollTo: React Native Web puts its own, which takes { x }, on the element.
    Element.prototype.scrollTo.call(d.el, { left, behavior: "smooth" });
    // Snapping comes back once the slide has arrived; turned on mid-way, the browser snaps somewhere else.
    const settle = setInterval(() => {
      if (Math.abs(d.el.scrollLeft - left) < 1 || drag) {
        clearInterval(settle);
        if (!drag || drag.el !== d.el) d.el.style.scrollSnapType = "";
      }
    }, 50);
    setTimeout(() => clearInterval(settle), 3000);
  } else d.el.style.scrollSnapType = "";
};
window.addEventListener("pointerup", endDrag, true);
window.addEventListener("pointercancel", endDrag, true);
// A drag isn't a tap on the slide's button.
window.addEventListener(
  "click",
  (e) => {
    if (Date.now() < swallowClickUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  },
  true,
);

window.__APPMAKER_RUNTIME__ = {
  React,
  ReactDOMClient,
  modules: {
    react: withDefault(React, React),
    "react/jsx-runtime": JSXRuntime,
    "react/jsx-dev-runtime": JSXRuntime,
    "react-native": withDefault({ ...RNW, Appearance, useColorScheme, Alert: AlertShim, BackHandler: BackHandlerShim, ScrollView: ScrollViewShim, Linking: LinkingShim }, RNW),
    "react-native-web": withDefault(RNW, RNW),
    "@react-native-async-storage/async-storage": withDefault({ AsyncStorage }, AsyncStorage),
    "expo-status-bar": { __esModule: true, StatusBar },
    "react-native-safe-area-context": { __esModule: true, ...safeArea },
    "expo-haptics": withDefault(Haptics, Haptics),
    "expo-linear-gradient": withDefault({ LinearGradient }, LinearGradient),
    "expo-blur": withDefault({ BlurView }, BlurView),
    "expo-notifications": withDefault(Notifications, Notifications),
    "expo-image-picker": withDefault(ImagePicker, ImagePicker),
    "lucide-react-native": LucideModule,
  },
};

// Store screenshots: the Publish tab asks for a picture of the current
// screen ("capture"), or of each main screen ("tour": taps every tab in turn).
// Rendered here, inside the sandbox, and sent back as PNGs.
async function snap(scale) {
  const dataUrl = await toPng(document.body, {
    pixelRatio: scale,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
    cacheBust: false,
    // Photos from other websites may refuse to be copied; show a blank
    // (a valid 1×1 transparent GIF) instead of failing, and never let one
    // broken image stop the whole picture.
    imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    onImageErrorHandler: () => undefined,
  });
  return { dataUrl, text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 400), heading: screenHeading() };
}

/** The screen's title: its first heading, or else its biggest text. */
function screenHeading() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.top < window.innerHeight * 0.6;
  };
  const clean = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const heading = [...document.querySelectorAll('[role="heading"], h1, h2')].find((el) => visible(el) && clean(el.innerText));
  if (heading) return clean(heading.innerText);
  let best = null;
  let size = 0;
  for (const el of document.querySelectorAll("div, span")) {
    if (el.children.length || !visible(el) || !clean(el.innerText) || /^\d/.test(clean(el.innerText))) continue;
    const s = parseFloat(getComputedStyle(el).fontSize) || 0;
    if (s > size) {
      size = s;
      best = el;
    }
  }
  return best ? clean(best.innerText) : "";
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** The app's main screens: its tabs, or failing that the buttons of a bottom bar. */
function tourTargets() {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  };
  const tabs = [...document.querySelectorAll('[role="tab"]')].filter(visible);
  if (tabs.length >= 2) return tabs.slice(0, 6);
  // Tappable things (buttons, or React Native touchables, which are focusable) along the bottom edge.
  const near = [...document.querySelectorAll('[role="button"], button, [tabindex="0"]')].filter(
    (el) => visible(el) && el.getBoundingClientRect().top > window.innerHeight - 120,
  );
  const bar = near.filter((el) => !near.some((other) => other !== el && el.contains(other)));
  return bar.length >= 2 && bar.length <= 6 ? bar : [];
}

window.addEventListener("message", async (e) => {
  const msg = e.data;
  if (e.source !== window.parent || !msg || msg.source !== "appmaker-parent" || (msg.type !== "capture" && msg.type !== "tour")) return;
  const reply = (body) => window.parent.postMessage({ source: "appmaker-preview", type: msg.type, id: msg.id, ...body }, "*");
  try {
    const scale = Math.min(4, Math.max(1, Number(msg.scale) || 3));
    // Wait for the app to show something (it may still be starting).
    for (let i = 0; i < 25 && !(document.body.innerText || "").trim(); i++) await pause(200);
    if (msg.type === "capture") return reply(await snap(scale));
    const targets = tourTargets();
    const shots = [];
    if (!targets.length) shots.push(await snap(scale));
    for (let i = 0; i < targets.length; i++) {
      // Find the tab again: the screen re-renders after each tap.
      const target = tourTargets()[i] || targets[i];
      target.click();
      await pause(700);
      shots.push(await snap(scale));
    }
    // Back to the first screen.
    if (targets.length) (tourTargets()[0] || targets[0]).click();
    reply({ shots });
  } catch (err) {
    // A failed image load rejects with a bare Event: say what it means.
    const message = err instanceof Event ? "the screen has an image the browser couldn't draw" : String((err && err.message) || err);
    reply({ error: message });
  }
});
