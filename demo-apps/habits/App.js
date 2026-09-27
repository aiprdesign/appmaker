import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import HabitRow from './src/components/HabitRow';
import { loadHabits, saveHabits, todayKey, streakFor } from './src/storage';

const ACCENT = '#6440F0';
const EMOJIS = ['💧', '📚', '🧘', '🏃', '🥗', '😴', '✍️', '🎸'];

const SEED = [
  { id: '1', name: 'Drink 8 glasses of water', emoji: '💧', days: {} },
  { id: '2', name: 'Read 20 pages', emoji: '📚', days: {} },
  { id: '3', name: 'Meditate 10 minutes', emoji: '🧘', days: {} },
];

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

  const toggle = (id) =>
    update(
      habits.map((h) =>
        h.id === id ? { ...h, days: { ...h.days, [today]: !h.days[today] } } : h,
      ),
    );

  const add = () => {
    if (!draft.trim()) return;
    update([...habits, { id: String(Date.now()), name: draft.trim(), emoji, days: {} }]);
    setDraft('');
    setTab('today');
  };

  const remove = (id) => update(habits.filter((h) => h.id !== id));

  const best = useMemo(
    () => habits.reduce((max, h) => Math.max(max, streakFor(h)), 0),
    [habits],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'today' && (
            <>
              <Text style={styles.kicker}>{new Date().toDateString()}</Text>
              <Text style={styles.title}>Today</Text>
              <View style={styles.hero}>
                <Text style={styles.heroNumber}>{Math.round(progress * 100)}%</Text>
                <Text style={styles.heroLabel}>
                  {doneCount} of {habits.length} habits complete
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${progress * 100}%` }]} />
                </View>
              </View>
              {habits.length === 0 && (
                <Text style={styles.empty}>No habits yet — add your first one.</Text>
              )}
              {habits.map((h) => (
                <HabitRow
                  key={h.id}
                  habit={h}
                  done={!!h.days[today]}
                  streak={streakFor(h)}
                  accent={ACCENT}
                  onToggle={() => toggle(h.id)}
                  onDelete={() => remove(h.id)}
                />
              ))}
            </>
          )}

          {tab === 'add' && (
            <>
              <Text style={styles.title}>New habit</Text>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="e.g. Walk 5,000 steps"
                placeholderTextColor="#9A98A6"
                style={styles.input}
              />
              <Text style={styles.section}>Pick an icon</Text>
              <View style={styles.emojiGrid}>
                {EMOJIS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    onPress={() => setEmoji(e)}
                    style={[styles.emojiCell, emoji === e && { borderColor: ACCENT, backgroundColor: '#F1EDFF' }]}
                  >
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.button, !draft.trim() && { opacity: 0.4 }]} onPress={add}>
                <Text style={styles.buttonText}>Add habit</Text>
              </TouchableOpacity>
            </>
          )}

          {tab === 'stats' && (
            <>
              <Text style={styles.title}>Stats</Text>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{best}🔥</Text>
                  <Text style={styles.statLabel}>Best streak</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{habits.length}</Text>
                  <Text style={styles.statLabel}>Active habits</Text>
                </View>
              </View>
              {habits.map((h) => (
                <View key={h.id} style={styles.statLine}>
                  <Text style={styles.statLineText}>
                    {h.emoji} {h.name}
                  </Text>
                  <Text style={styles.statLineValue}>{Object.values(h.days).filter(Boolean).length} days</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        <View style={styles.tabBar}>
          {[
            ['today', '✅', 'Today'],
            ['add', '➕', 'Add'],
            ['stats', '📊', 'Stats'],
          ].map(([key, icon, label]) => (
            <TouchableOpacity key={key} style={styles.tab} onPress={() => setTab(key)}>
              <Text style={{ fontSize: 20, opacity: tab === key ? 1 : 0.45 }}>{icon}</Text>
              <Text style={[styles.tabLabel, tab === key && { color: ACCENT }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F6FB' },
  safe: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  kicker: { color: '#625F73', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 34, fontWeight: '800', color: '#16141F', marginBottom: 16 },
  hero: { backgroundColor: ACCENT, borderRadius: 24, padding: 20, marginBottom: 20 },
  heroNumber: { color: '#fff', fontSize: 44, fontWeight: '800' },
  heroLabel: { color: '#FFFFFF', fontSize: 15, marginBottom: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#fff' },
  empty: { color: '#625F73', textAlign: 'center', marginTop: 24 },
  input: { backgroundColor: '#fff', borderRadius: 16, padding: 16, fontSize: 17, color: '#16141F', borderWidth: 1, borderColor: '#E6E3F0' },
  section: { marginTop: 24, marginBottom: 12, fontWeight: '700', color: '#16141F', fontSize: 15 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emojiCell: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  button: { marginTop: 28, backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  statValue: { fontSize: 28, fontWeight: '800', color: '#16141F' },
  statLabel: { color: '#625F73', marginTop: 4 },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8 },
  statLineText: { color: '#16141F', fontSize: 15, flex: 1 },
  statLineValue: { color: ACCENT, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#ECEAF3', backgroundColor: '#fff', paddingBottom: 20, paddingTop: 8 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 11, color: '#625F73', fontWeight: '600' },
});
