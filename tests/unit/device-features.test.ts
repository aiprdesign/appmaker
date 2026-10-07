import { describe, expect, it } from "vitest";
import { appJson, EXPO_DEPS, usedDependencies } from "@/lib/expo-project";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { emptyListing } from "@/lib/storage";
import type { Project } from "@/lib/types";
import { validateApp } from "@/lib/validate";

const FEATURES = ["expo-location", "expo-sensors", "expo-camera", "expo-local-authentication", "expo-clipboard", "expo-speech"];

const app = `import React from 'react';
import { View } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer, Pedometer } from 'expo-sensors';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
export default function App() { return <View />; }
`;

const project = (code = app): Project => ({
  id: "p1",
  name: "Trail Mate",
  prompt: "",
  files: { "App.js": code },
  messages: [],
  listing: { ...emptyListing("Trail Mate"), bundleId: "com.acme.trailmate" },
  createdAt: 0,
  updatedAt: 0,
});

describe("device features", () => {
  it("lets apps use location, sensors, the camera, Face ID, the clipboard and speech", () => {
    expect(validateApp({ "App.js": app })).toEqual([]);
  });

  it("installs the SDK's versions only for the features an app uses", () => {
    const deps = usedDependencies(project());
    for (const f of FEATURES) expect(deps[f], f).toBe(EXPO_DEPS[f]);
    for (const f of FEATURES) expect(EXPO_DEPS[f], f).toMatch(/^~57\./);
    const plain = usedDependencies(project("import React from 'react';\nexport default () => null;\n"));
    for (const f of FEATURES) expect(plain[f], f).toBeUndefined();
  });

  it("writes the permission texts Apple requires into app.json", () => {
    const plugins = appJson(project()).expo.plugins as [string, Record<string, unknown>][];
    const config = (name: string) => plugins.find((p) => Array.isArray(p) && p[0] === name)?.[1];
    expect(config("expo-location")?.locationWhenInUsePermission).toMatch(/^Trail Mate uses your location/);
    expect(config("expo-camera")).toMatchObject({ cameraPermission: expect.stringMatching(/^Trail Mate uses the camera/), recordAudioAndroid: false });
    expect(config("expo-sensors")?.motionPermission).toMatch(/^Trail Mate uses motion data/);
    expect(config("expo-local-authentication")?.faceIDPermission).toMatch(/^Trail Mate uses Face ID/);
    expect(appJson(project("export default () => null;\n")).expo).not.toHaveProperty("plugins");
  });

  it("tells the AI how to use each feature kindly and safely", () => {
    for (const s of [
      "requestForegroundPermissionsAsync",
      "watchPositionAsync",
      "Pedometer.watchStepCount",
      "barcodeScannerSettings",
      "useCameraPermissions",
      "authenticateAsync",
      "Clipboard.setStringAsync",
      "Speech.speak",
      "the app must still work when they say no",
    ]) {
      expect(SYSTEM_PROMPT, s).toContain(s);
    }
  });
});
