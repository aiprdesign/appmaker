// Bundled into public/preview/runtime.js. Exposes the modules a generated app
// may import, so the preview iframe needs no third-party CDN.
import * as React from "react";
import * as ReactDOMClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import * as RNW from "react-native-web";

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

const SafeAreaView = React.forwardRef(function SafeAreaView(props, ref) {
  return React.createElement(RNW.View, { ...props, ref, style: [{ flex: 1, paddingTop: 44 }, props.style] });
});

const safeArea = {
  SafeAreaView,
  SafeAreaProvider: ({ children }) => children,
  useSafeAreaInsets: () => ({ top: 44, bottom: 24, left: 0, right: 0 }),
};

const Haptics = {
  impactAsync: async () => {},
  notificationAsync: async () => {},
  selectionAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
};

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
    "react-native": withDefault(RNW, RNW),
    "react-native-web": withDefault(RNW, RNW),
    "@react-native-async-storage/async-storage": withDefault({ AsyncStorage }, AsyncStorage),
    "expo-status-bar": { __esModule: true, StatusBar },
    "react-native-safe-area-context": { __esModule: true, ...safeArea },
    "expo-haptics": withDefault(Haptics, Haptics),
  },
};
