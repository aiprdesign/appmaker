// Bundled into public/preview/runtime.js. Exposes the modules a generated app
// may import, so the preview iframe needs no third-party CDN.
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import * as RNW from "react-native-web";
import * as lucide from "lucide";

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
const insets = () => (RNW.Platform.OS === "android" ? { top: 24, bottom: 0, left: 0, right: 0 } : { top: 44, bottom: 24, left: 0, right: 0 });
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
  el.style.cssText =
    "position:fixed;left:10px;right:10px;top:52px;z-index:99999;border-radius:18px;padding:10px 14px;" +
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

window.__APPMAKER_RUNTIME__ = {
  React,
  ReactDOMClient,
  modules: {
    react: withDefault(React, React),
    "react/jsx-runtime": JSXRuntime,
    "react/jsx-dev-runtime": JSXRuntime,
    "react-native": withDefault({ ...RNW, Appearance, useColorScheme }, RNW),
    "react-native-web": withDefault(RNW, RNW),
    "@react-native-async-storage/async-storage": withDefault({ AsyncStorage }, AsyncStorage),
    "expo-status-bar": { __esModule: true, StatusBar },
    "react-native-safe-area-context": { __esModule: true, ...safeArea },
    "expo-haptics": withDefault(Haptics, Haptics),
    "expo-notifications": withDefault(Notifications, Notifications),
    "expo-image-picker": withDefault(ImagePicker, ImagePicker),
    "lucide-react-native": LucideModule,
  },
};
