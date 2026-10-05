import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, LayoutAnimation, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { BookOpen, Pencil, Search, Trash2, Check, Pin, Sparkles, Feather } from 'lucide-react-native';
import { colors, radius, font, card, mode } from './src/theme';

const APP_NAME = '__APP_NAME__';
const MOODS = ['😄', '🙂', '😐', '😔', '😤'];
const MOOD_NAMES = { '😄': 'Great', '🙂': 'Good', '😐': 'Okay', '😔': 'Low', '😤': 'Frustrated' };
const SEED = [
  { id: '1', text: 'Kicked off the project today. Feeling excited about where this is going.', mood: '😄', pinned: true, date: Date.now() - 3600000 },
  { id: '2', text: 'Ideas: invite friends, weekly recap, dark mode.', mood: '🙂', pinned: false, date: Date.now() - 86400000 },
];
const TABS = [
  { key: 'feed', label: 'Entries', Icon: BookOpen },
  { key: 'new', label: 'Write', Icon: Pencil },
];

const pressedStyle = ({ pressed }) => pressed && { opacity: 0.7 };

// "Today, 9:41 AM", "Yesterday, 8:02 PM", or "Mon 3 Oct, 7:15 AM": no seconds.
function when(date) {
  const d = new Date(date);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export default function App() {
  const [entries, setEntries] = useState(SEED);
  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState(MOODS[1]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('feed');
  const [toast, setToast] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('entries.v1').then((raw) => raw && setEntries(JSON.parse(raw)));
    AccessibilityInfo.isReduceMotionEnabled?.().then((on) => setReduceMotion(!!on)).catch(() => {});
    return () => clearTimeout(toastTimer.current);
  }, []);

  const animate = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  };

  const save = (next) => {
    setEntries(next);
    AsyncStorage.setItem('entries.v1', JSON.stringify(next));
  };

  const add = () => {
    if (!draft.trim()) return;
    animate();
    save([{ id: String(Date.now()), text: draft.trim(), mood, pinned: false, date: Date.now() }, ...entries]);
    setDraft('');
    setTab('feed');
    showToast('Entry saved');
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch?.(() => {});
    } catch (e) {}
  };

  const togglePin = (id) => save(entries.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e)));
  const remove = (id) => {
    animate();
    save(entries.filter((e) => e.id !== id));
  };
  const confirmRemove = (entry) =>
    Alert.alert('Delete this entry?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(entry.id) },
    ]);

  const visible = entries
    .filter((e) => e.text.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date - a.date);
  const pinnedCount = entries.filter((e) => e.pinned).length;

  return (
    <View style={styles.root}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {tab === 'feed' ? (
            <>
              <Text style={styles.title} accessibilityRole="header">{APP_NAME}</Text>

              <View style={[card, styles.hero]}>
                <View style={styles.heroIcon}>
                  <BookOpen size={32} color={colors.onPrimary} accessible={false} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroCount}>
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                  </Text>
                  <Text style={styles.heroSub}>{pinnedCount} pinned · newest first</Text>
                </View>
              </View>

              <View style={styles.search}>
                <Search size={20} color={colors.muted} accessible={false} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Search entries"
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>

              {visible.length === 0 && (
                <View style={styles.emptyWrap}>
                  <View style={styles.illustration}>
                    <BookOpen size={52} color={colors.primary} accessible={false} />
                    <View style={[styles.badge, styles.badgeTop]}>
                      <Sparkles size={18} color={colors.primary} accessible={false} />
                    </View>
                    <View style={[styles.badge, styles.badgeBottom]}>
                      <Feather size={18} color={colors.primary} accessible={false} />
                    </View>
                  </View>
                  <Text style={styles.empty}>Nothing here yet.</Text>
                  <Text style={styles.emptySub}>Your entries show up here. Try another search or write something.</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Write an entry"
                    onPress={() => setTab('new')}
                    style={({ pressed }) => [styles.button, styles.emptyButton, pressed && styles.buttonPressed]}
                  >
                    <Pencil size={20} color={colors.onPrimary} accessible={false} />
                    <Text style={styles.buttonText}>Write an entry</Text>
                  </Pressable>
                </View>
              )}

              {visible.map((e) => (
                <View key={e.id} style={[card, styles.card]}>
                  <Pressable
                    style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.7 }]}
                    onPress={() => togglePin(e.id)}
                    onLongPress={() => confirmRemove(e)}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.pinned ? 'Pinned. ' : ''}${MOOD_NAMES[e.mood] ?? ''} ${e.text}`}
                    accessibilityHint={e.pinned ? 'Tap to unpin, long-press to delete' : 'Tap to pin, long-press to delete'}
                  >
                    <View style={styles.cardHead}>
                      <View style={styles.moodBadge}>
                        <Text style={styles.moodBadgeText}>{e.mood}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.date}>{when(e.date)}</Text>
                        {e.pinned && (
                          <View style={styles.pinnedRow}>
                            <Pin size={14} color={colors.primary} accessible={false} />
                            <Text style={styles.pinnedText}>Pinned</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={styles.body}>{e.text}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete entry: ${e.text.slice(0, 40)}`}
                    onPress={() => confirmRemove(e)}
                    hitSlop={4}
                    style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}
                  >
                    <Trash2 size={20} color={colors.muted} accessible={false} />
                  </Pressable>
                </View>
              ))}
              <Text style={styles.hint}>Tap to pin · long-press to delete</Text>
            </>
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header">New entry</Text>
              <Text style={styles.label}>How are you feeling?</Text>
              <View style={styles.moods}>
                {MOODS.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setMood(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`Mood: ${MOOD_NAMES[m]}`}
                    accessibilityState={{ selected: mood === m }}
                    style={(state) => [styles.mood, mood === m && styles.moodActive, pressedStyle(state)]}
                  >
                    <Text style={{ fontSize: 28 }}>{m}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Your thoughts</Text>
              <TextInput
                style={styles.editor}
                value={draft}
                onChangeText={setDraft}
                placeholder="What's on your mind?"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Your thoughts"
                multiline
                autoCapitalize="sentences"
                keyboardType="default"
                returnKeyType="default"
              />
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                onPress={add}
                accessibilityRole="button"
                accessibilityLabel="Save"
              >
                <Check size={20} color={colors.onPrimary} accessible={false} />
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
            </>
          )}
        </ScrollView>

        {!!toast && (
          <View style={styles.toast} accessibilityLiveRegion="polite">
            <Check size={18} color={colors.onPrimary} accessible={false} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}

        <View style={styles.tabBar} accessibilityRole="tablist">
          {TABS.map(({ key, label, Icon }) => {
            const selected = tab === key;
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
              >
                <Icon size={24} color={selected ? colors.primary : colors.muted} accessible={false} />
                <Text style={[styles.tabLabel, selected && { color: colors.primary }]} maxFontSizeMultiplier={1.4}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 34, lineHeight: 42, letterSpacing: -0.5, fontWeight: font.heading, color: colors.text, marginBottom: 16 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.text, marginBottom: 8 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, marginBottom: 16, backgroundColor: colors.primary },
  heroIcon: { width: 56, height: 56, borderRadius: radius.md, borderWidth: 2, borderColor: colors.onPrimary, alignItems: 'center', justifyContent: 'center' },
  heroCount: { fontSize: 22, lineHeight: 28, fontWeight: font.heading, color: colors.onPrimary, fontVariant: ['tabular-nums'] },
  heroSub: { fontSize: 15, lineHeight: 20, color: colors.onPrimary, fontVariant: ['tabular-nums'] },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, paddingHorizontal: 12, minHeight: 48, marginBottom: 16 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  emptyWrap: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  illustration: { width: 104, height: 104, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  badge: { position: 'absolute', width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badgeTop: { top: -4, right: -4 },
  badgeBottom: { bottom: -4, left: -4 },
  empty: { fontSize: 20, lineHeight: 26, fontWeight: font.heading, color: colors.text, textAlign: 'center' },
  emptySub: { fontSize: 15, lineHeight: 20, color: colors.muted, textAlign: 'center', marginTop: 8 },
  emptyButton: { alignSelf: 'stretch', marginTop: 20 },
  card: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, paddingRight: 8, marginBottom: 12 },
  cardMain: { flex: 1, minHeight: 44 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  moodBadge: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  moodBadgeText: { fontSize: 24 },
  date: { color: colors.muted, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  pinnedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  pinnedText: { color: colors.primary, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, color: colors.text },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, marginLeft: 4 },
  hint: { color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 18, marginTop: 8 },
  moods: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  mood: { width: 58, height: 58, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  moodActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  editor: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outline, padding: 16, minHeight: 180, fontSize: 17, lineHeight: 24, textAlignVertical: 'top', color: colors.text },
  button: { flexDirection: 'row', gap: 8, marginTop: 20, backgroundColor: colors.primary, minHeight: 52, paddingHorizontal: 20, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  buttonText: { color: colors.onPrimary, fontWeight: font.heading, fontSize: 17 },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 96, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16 },
  toastText: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8, paddingBottom: 20 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
});
