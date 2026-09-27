import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCENT = '#D23C17';
const WORKOUTS = [
  { id: 'hiit', name: 'Morning HIIT', emoji: '⚡', minutes: 20, level: 'Intermediate', moves: ['Jumping jacks', 'Burpees', 'Mountain climbers', 'High knees', 'Squat jumps'] },
  { id: 'core', name: 'Core Crusher', emoji: '🔥', minutes: 15, level: 'Beginner', moves: ['Plank', 'Crunches', 'Leg raises', 'Russian twists'] },
  { id: 'legs', name: 'Leg Day', emoji: '🦵', minutes: 30, level: 'Advanced', moves: ['Squats', 'Lunges', 'Glute bridges', 'Calf raises', 'Wall sit'] },
  { id: 'yoga', name: 'Evening Stretch', emoji: '🧘', minutes: 12, level: 'All levels', moves: ["Child's pose", 'Cat-cow', 'Downward dog', 'Pigeon pose'] },
];
const MOVE_SECONDS = 40;

export default function App() {
  const [tab, setTab] = useState('workouts');
  const [active, setActive] = useState(null);
  const [moveIndex, setMoveIndex] = useState(0);
  const [seconds, setSeconds] = useState(MOVE_SECONDS);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('fitness.history').then((raw) => raw && setHistory(JSON.parse(raw)));
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    timer.current = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(timer.current);
  }, [running]);

  useEffect(() => {
    if (seconds > 0 || !active) return;
    if (moveIndex < active.moves.length - 1) {
      setMoveIndex((i) => i + 1);
      setSeconds(MOVE_SECONDS);
    } else {
      finish();
    }
  }, [seconds]);

  const start = (w) => {
    setActive(w);
    setMoveIndex(0);
    setSeconds(MOVE_SECONDS);
    setRunning(true);
  };

  const finish = () => {
    setRunning(false);
    const next = [{ id: String(Date.now()), name: active.name, emoji: active.emoji, minutes: active.minutes, date: Date.now() }, ...history];
    setHistory(next);
    AsyncStorage.setItem('fitness.history', JSON.stringify(next));
    setActive(null);
    setTab('progress');
  };

  if (active) {
    const pct = 1 - seconds / MOVE_SECONDS;
    return (
      <View style={[styles.root, { backgroundColor: '#111' }]}>
        <SafeAreaView style={styles.player}>
          <Text style={styles.playerKicker}>
            {active.name} · {moveIndex + 1}/{active.moves.length}
          </Text>
          <Text style={styles.playerMove}>{active.moves[moveIndex]}</Text>
          <View style={styles.ring}>
            <Text style={styles.ringText}>{seconds}</Text>
            <Text style={styles.ringSub}>seconds</Text>
          </View>
          <View style={styles.playerTrack}>
            <View style={[styles.playerFill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={styles.controls}>
            <TouchableOpacity style={styles.ghost} onPress={() => setActive(null)}>
              <Text style={styles.ghostText}>End</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={() => setRunning((r) => !r)}>
              <Text style={styles.primaryText}>{running ? 'Pause' : 'Resume'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={() => setSeconds(0)}>
              <Text style={styles.ghostText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const totalMinutes = history.reduce((s, h) => s + h.minutes, 0);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'workouts' ? (
            <>
              <Text style={styles.kicker}>Let&apos;s move</Text>
              <Text style={styles.title}>Workouts</Text>
              {WORKOUTS.map((w, i) => (
                <TouchableOpacity key={w.id} onPress={() => start(w)} style={[styles.card, i === 0 && { backgroundColor: ACCENT }]}>
                  <Text style={{ fontSize: 34 }}>{w.emoji}</Text>
                  <Text style={[styles.cardTitle, i === 0 && { color: '#fff' }]}>{w.name}</Text>
                  <Text style={[styles.cardMeta, i === 0 && { color: 'rgba(255,255,255,0.85)' }]}>
                    {w.minutes} min · {w.level} · {w.moves.length} moves
                  </Text>
                  <View style={[styles.startPill, i === 0 && { backgroundColor: '#fff' }]}>
                    <Text style={[styles.startText, i === 0 && { color: ACCENT }]}>Start ▶</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.title}>Progress</Text>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{history.length}</Text>
                  <Text style={styles.statLabel}>Workouts</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{totalMinutes}</Text>
                  <Text style={styles.statLabel}>Minutes</Text>
                </View>
              </View>
              {history.length === 0 && <Text style={styles.empty}>Finish a workout to see it here 💪</Text>}
              {history.map((h) => (
                <View key={h.id} style={styles.logRow}>
                  <Text style={{ fontSize: 22 }}>{h.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logTitle}>{h.name}</Text>
                    <Text style={styles.logMeta}>{new Date(h.date).toLocaleString()}</Text>
                  </View>
                  <Text style={styles.logMin}>{h.minutes}m</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
        <View style={styles.tabBar}>
          {[['workouts', '🏋️', 'Workouts'], ['progress', '🏆', 'Progress']].map(([k, icon, label]) => (
            <TouchableOpacity key={k} style={styles.tab} onPress={() => setTab(k)}>
              <Text style={{ fontSize: 20, opacity: tab === k ? 1 : 0.45 }}>{icon}</Text>
              <Text style={[styles.tabLabel, tab === k && { color: ACCENT }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF8F5' },
  content: { padding: 20, paddingBottom: 40 },
  kicker: { color: ACCENT, fontWeight: '700', textTransform: 'uppercase', fontSize: 13 },
  title: { fontSize: 34, fontWeight: '800', color: '#1A1110', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 12 },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#1A1110', marginTop: 8 },
  cardMeta: { color: '#7A6C68', marginTop: 4 },
  startPill: { alignSelf: 'flex-start', backgroundColor: '#FFE8E1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, marginTop: 14 },
  startText: { color: ACCENT, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  statValue: { fontSize: 30, fontWeight: '800', color: '#1A1110' },
  statLabel: { color: '#7A6C68' },
  empty: { color: '#7A6C68', textAlign: 'center', marginTop: 20 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 14, borderRadius: 16, marginBottom: 8 },
  logTitle: { fontWeight: '700', color: '#1A1110', fontSize: 16 },
  logMeta: { color: '#7A6C68', fontSize: 12, marginTop: 2 },
  logMin: { fontWeight: '800', color: ACCENT },
  player: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  playerKicker: { color: '#999', fontWeight: '600' },
  playerMove: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  ring: { width: 200, height: 200, borderRadius: 100, borderWidth: 10, borderColor: ACCENT, alignItems: 'center', justifyContent: 'center', marginVertical: 36 },
  ringText: { color: '#fff', fontSize: 64, fontWeight: '800' },
  ringSub: { color: '#999' },
  playerTrack: { width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3 },
  playerFill: { height: 6, backgroundColor: ACCENT, borderRadius: 3 },
  controls: { flexDirection: 'row', gap: 12, marginTop: 36 },
  primary: { backgroundColor: ACCENT, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 999 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  ghost: { borderWidth: 1, borderColor: '#444', paddingHorizontal: 20, paddingVertical: 16, borderRadius: 999 },
  ghostText: { color: '#ddd', fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#F1E4DF', paddingTop: 8, paddingBottom: 20 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 11, color: '#7A6C68', fontWeight: '600' },
});
