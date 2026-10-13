import { describe, expect, it } from "vitest";
import { designIssues } from "@/lib/app-design";
import { SYSTEM_PROMPT } from "@/lib/prompt";

const screen = (body: string, styles = "") => `import { Text, View, StyleSheet } from 'react-native';
export default function HomeScreen() { return (<View>${body}</View>); }
const styles = StyleSheet.create({ ${styles} });`;
const messages = (code: string) => designIssues({ "src/screens/Home.js": code }).map((i) => i.message).join("\n");

describe("modern app design check", () => {
  it("finds the tells of generic AI design", () => {
    expect(messages(screen("<Text>🔥</Text><Text>💧</Text><Text>⭐</Text>"))).toMatch(/emoji as icons \(🔥 💧 ⭐\)/);
    expect(messages(screen("<Text>Unlock your full potential today</Text>"))).toMatch(/generic AI copy/);
    expect(messages(screen("", "a: { color: '#111', backgroundColor: '#fafafa', borderColor: '#eee' }, b: { color: '#ff0000', tintColor: '#00ff00' }"))).toMatch(/hard-codes 5 colors/);
    expect(messages(screen("", [11, 12, 13, 15, 17, 20, 28, 34].map((n, i) => `s${i}: { fontSize: ${n} }`).join(", ")))).toMatch(/8 different font sizes/);
    expect(messages(screen("", "a: { fontSize: 19 }, b: { fontSize: 23 }"))).toMatch(/off the type scale \(19, 23\)/);
    expect(messages(screen("", "a: { padding: 7, margin: 13, gap: 9 }"))).toMatch(/off the 4-point grid \(7, 13, 9\)/);
    expect(messages(screen("", "a: { shadowOpacity: 0.4 }"))).toMatch(/heavy shadows/);
    expect(messages(screen("", [6, 10, 14, 18, 22].map((r, i) => `r${i}: { borderRadius: ${r} }`).join(", ")))).toMatch(/mixes 5 corner radii/);
    expect(messages(screen("", Array.from({ length: 6 }, (_, i) => `t${i}: { textAlign: 'center' }`).join(", ")))).toMatch(/centers text in 6 places/);
    expect(messages(screen("", Array.from({ length: 4 }, (_, i) => `w${i}: { fontWeight: '900' }`).join(", ")))).toMatch(/weight 800–900 in 4 places/);
    expect(messages(screen("<LinearGradient colors={['#f0f', '#0ff', '#ff0']} />"))).toMatch(/three or more hard-coded colors/);
  });

  it("leaves well-designed code, theme and data files alone", () => {
    const good = screen("<Text>3 bookings this week</Text><Text>🎉</Text>", "title: { fontSize: 34, fontWeight: '700', color: colors.text }, body: { fontSize: 17, padding: 20, marginTop: 32, borderRadius: radius.md }");
    expect(designIssues({ "src/screens/Home.js": good })).toEqual([]);
    expect(designIssues({ "src/theme.js": "export const colors = { a: '#111', b: '#222', c: '#333', d: '#444', e: '#555' };", "src/data/business.js": "export default { tagline: 'Unlock your potential' };" })).toEqual([]);
    expect(designIssues({ "src/data.js": "{ key: 'food', label: 'Food', color: '#F59E0B' },\n{ key: 'a', label: 'A', color: '#3B82F6' },\n{ key: 'b', label: 'B', color: '#EC4899' },\n{ key: 'c', label: 'C', color: '#8B5CF6' },\n{ key: 'd', label: 'D', color: '#10B981' }" })).toEqual([]);
  });

  it("is part of the app designer's instructions", () => {
    expect(SYSTEM_PROMPT).toContain("## Modern design, not generic AI design");
    expect(SYSTEM_PROMPT).toContain("Icons, not emoji");
  });
});
