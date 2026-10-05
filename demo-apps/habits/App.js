import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { CalendarCheck, Plus, ChartBar, Flame, Trophy, Target, Sprout } from 'lucide-react-native';
import HabitRow from './src/components/HabitRow';
import ReminderCard from './src/components/ReminderCard';
import { loadHabits, saveHabits, todayKey, streakFor } from './src/storage';
import { colors, radius, font, card, mode } from './src/theme';

const EMOJIS = ['💧', '📚', '🧘', '🏃', '🥗', '😴', '✍️', '🎸'];

const SEED = [
  { id: '1', name: 'Drink 8 glasses of water', emoji: '💧', days: {} },
  { id: '2', name: 'Read 20 pages', emoji: '📚', days: {} },
  { id: '3', name: 'Meditate 10 minutes', emoji: '🧘', days: {} },
];

const TABS = [
  ['today', CalendarCheck, 'Today'],
  ['add', Plus, 'Add'],
  ['stats', ChartBar, 'Stats'],
];

const tapHaptic = () => {
  try {
    const p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (p && p.catch) p.catch(() => {});
  } catch (e) {
    // Haptics aren't available everywhere.
  }
};

export default function App() {
  const [habits, setHabits] = useState(SEED);
  const [tab, setTab] = useState('today');
  const [draft, setDraft] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  useEffect(() => {
    loadHabits().then((stored) => stored && setHabits(stored));
  }, []);

  const update = (next) => {
    setHabits(next);
    saveHabits(next);
  };

  const today = todayKey();
  const doneCount = habits.filter((h) => h.days[today]).length;
  const progress = habits.length ? doneCount / habits.length : 0;

  const toggle = (id) => {
    tapHaptic();
    update(
      habits.map((h) =>
        h.id === id ? { ...h, days: { ...h.days, [today]: !h.days[today] } } : h,
      ),
    );
  };

  const add = () => {
    if (!draft.trim()) return;
    tapHaptic();
    update([...habits, { id: String(Date.now()), name: draft.trim(), emoji, days: {} }]);
    setDraft('');
    setTab('today');
  };

  const remove = (habit) =>
    Alert.alert(`Delete ${habit.name}?`, 'This habit and its streak history will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => update(habits.filter((h) => h.id !== habit.id)) },
    ]);

  const best = useMemo(
    () => habits.reduce((max, h) => Math.max(max, streakFor(h)), 0),
    [habits],
  );

  return (
    <View style={styles.root}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {tab === 'today' && (
            <>
              <Text style={styles.kicker}>{new Date().toDateString()}</Text>
              <Text style={styles.title} accessibilityRole="header">Today</Text>
              <View style={[card, styles.hero]}>
                <View style={styles.heroTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroNumber}>{Math.round(progress * 100)}%</Text>
                    <Text style={styles.heroLabel}>
                      {doneCount} of {habits.length} habits complete
                    </Text>
                  </View>
                  <CalendarCheck size={56} color={colors.onPrimary} accessible={false} />
                </View>
                <View style={styles.track}>
                  <View style={styles.trackBg} />
                  <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                </View>
              </View>
              {habits.length === 0 && (
                <View style={styles.emptyBox}>
                  <View style={styles.emptyCircle} accessible={false}>
                    <Sprout size={44} color={colors.primary} accessible={false} />
                  </View>
                  <Text style={styles.empty}>No habits yet — add your first one.</Text>
                  <Pressable
                    onPress={() => setTab('add')}
                    accessibilityRole="button"
                    accessibilityLabel="Add your first habit"
                    style={({ pressed }) => [styles.button, styles.emptyButton, pressed && styles.pressed]}
                  >
                    <Plus size={20} color={colors.onPrimary} accessible={false} />
                    <Text style={styles.buttonText}>Add your first habit</Text>
                  </Pressable>
                </View>
              )}
              {habits.map((h) => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  done={!!h.days[today]}
                  streak={streakFor(h)}
                  onToggle={() => toggle(h.id)}
                  onDelete={() => remove(h)}
                />
              ))}
            </>
          )}

          {tab === 'add' && (
            <>
              <Text style={styles.title} accessibilityRole="header">New habit</Text>
              <Text style={styles.label} nativeID="habitNameLabel">Habit name</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="e.g. Walk 5,000 steps"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Habit name"
                accessibilityLabelledBy="habitNameLabel"
                keyboardType="default"
                autoCapitalize="sentences"
                autoCorrect
                autoFocus
                returnKeyType="done"
                onSubmitEditing={add}
                style={styles.input}
              />
              <Text style={styles.section}>Pick an icon</Text>
              <View style={styles.emojiGrid}>
                {EMOJIS.map((e) => (
                  <Pressable
                    key={e}
                    onPress={() => setEmoji(e)}
                    accessibilityRole="button"
                    accessibilityLabel={`Icon ${e}`}
                    accessibilityState={{ selected: emoji === e }}
                    style={({ pressed }) => [
                      styles.emojiCell,
                      emoji === e && { borderColor: colors.primary, backgroundColor: colors.primarySoft },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={add}
                accessibilityRole="button"
                accessibilityLabel="Add habit"
                accessibilityState={{ disabled: !draft.trim() }}
                style={({ pressed }) => [styles.button, !draft.trim() && { opacity: 0.4 }, pressed && styles.pressed]}
              >
                <Plus size={20} color={colors.onPrimary} accessible={false} />
                <Text style={styles.buttonText}>Add habit</Text>
              </Pressable>
            </>
          )}

          {tab === 'stats' && (
            <>
              <Text style={styles.title} accessibilityRole="header">Stats</Text>
              <ReminderCard />
              <View style={styles.statRow}>
                <View style={[card, styles.stat]}>
                  <View style={styles.statIcon} accessible={false}>
                    <Trophy size={28} color={colors.primary} accessible={false} />
                  </View>
                  <View style={styles.statValueRow}>
                    <Text style={styles.statValue}>{best}</Text>
                    <Flame size={24} color={colors.primary} accessible={false} />
                  </View>
                  <Text style={styles.statLabel}>Longest streak</Text>
                </View>
                <View style={[card, styles.stat]}>
                  <View style={styles.statIcon} accessible={false}>
                    <Target size={28} color={colors.primary} accessible={false} />
                  </View>
                  <Text style={styles.statValue}>{habits.length}</Text>
                  <Text style={styles.statLabel}>Active habits</Text>
                </View>
              </View>
              {habits.map((h) => (
                <View key={h.id} style={[card, styles.statLine]}>
                  <Text style={styles.statLineText}>
                    {h.emoji} {h.name}
                  </Text>
                  <Text style={styles.statLineValue}>{Object.values(h.days).filter(Boolean).length} days</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        <View style={styles.tabBar} accessibilityRole="tablist">
          {TABS.map(([key, Icon, label]) => {
            const selected = tab === key;
            const color = selected ? colors.primary : colors.muted;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              >
                <Icon size={24} color={color} accessible={false} />
                <Text style={[styles.tabLabel, { color }]} maxFontSizeMultiplier={1.4}>{label}</Text>
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
  safe: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  pressed: { opacity: 0.7 },
  kicker: { color: colors.muted, fontSize: 13, lineHeight: 17, fontWeight: font.heading, textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 34, lineHeight: 41, letterSpacing: -0.5, fontWeight: font.heading, color: colors.text, marginBottom: 16 },
  hero: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 20, marginBottom: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  heroNumber: { color: colors.onPrimary, fontSize: 44, lineHeight: 52, fontWeight: font.heading, fontVariant: ['tabular-nums'] },
  heroLabel: { color: colors.onPrimary, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  trackBg: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.onPrimary, opacity: 0.25 },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.onPrimary },
  emptyBox: { alignItems: 'center', marginTop: 16, marginBottom: 24 },
  emptyCircle: { width: 88, height: 88, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  empty: { color: colors.muted, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  emptyButton: { alignSelf: 'stretch', marginTop: 20 },
  label: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: font.heading, marginBottom: 8 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, fontSize: 17, color: colors.text, borderWidth: 1, borderColor: colors.outline },
  section: { marginTop: 24, marginBottom: 12, fontWeight: font.heading, color: colors.text, fontSize: 15, lineHeight: 20 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  emojiCell: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border },
  emojiText: { fontSize: 26 },
  button: { marginTop: 32, minHeight: 52, backgroundColor: colors.primary, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  buttonText: { color: colors.onPrimary, fontSize: 17, fontWeight: font.heading },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  stat: { flex: 1, padding: 16 },
  statIcon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 28, lineHeight: 34, fontWeight: font.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.muted, fontSize: 14, lineHeight: 18, marginTop: 4 },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 16, marginBottom: 8, minHeight: 56 },
  statLineText: { color: colors.text, fontSize: 15, lineHeight: 20, flex: 1 },
  statLineValue: { color: colors.text, fontWeight: font.heading, fontSize: 15, fontVariant: ['tabular-nums'] },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, paddingBottom: 20, paddingTop: 8 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 12, fontWeight: font.heading },
});
