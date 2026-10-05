import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Dumbbell, Trophy, Zap, Flame, Footprints, PersonStanding, Play, Pause, SkipForward, X, Timer, Clock } from 'lucide-react-native';
import { colors, radius, font, card, mode } from './src/theme';

const WORKOUTS = [
  { id: 'hiit', name: 'Morning HIIT', emoji: '⚡', minutes: 20, level: 'Intermediate', moves: ['Jumping jacks', 'Burpees', 'Mountain climbers', 'High knees', 'Squat jumps'] },
  { id: 'core', name: 'Core Crusher', emoji: '🔥', minutes: 15, level: 'Beginner', moves: ['Plank', 'Crunches', 'Leg raises', 'Russian twists'] },
  { id: 'legs', name: 'Leg Day', emoji: '🦵', minutes: 30, level: 'Advanced', moves: ['Squats', 'Lunges', 'Glute bridges', 'Calf raises', 'Wall sit'] },
  { id: 'yoga', name: 'Evening Stretch', emoji: '🧘', minutes: 12, level: 'All levels', moves: ["Child's pose", 'Cat-cow', 'Downward dog', 'Pigeon pose'] },
];
const ICONS = { hiit: Zap, core: Flame, legs: Footprints, yoga: PersonStanding };
const MOVE_SECONDS = 40;

const iconFor = (name) => {
  const w = WORKOUTS.find((x) => x.name === name);
  return (w && ICONS[w.id]) || Dumbbell;
};

const tapLight = () => {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {
    // Haptics aren't available everywhere.
  }
};

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
    tapLight();
    setActive(w);
    setMoveIndex(0);
    setSeconds(MOVE_SECONDS);
    setRunning(true);
  };

  const finish = () => {
    setRunning(false);
    tapLight();
    const next = [{ id: String(Date.now()), name: active.name, emoji: active.emoji, minutes: active.minutes, date: Date.now() }, ...history];
    setHistory(next);
    AsyncStorage.setItem('fitness.history', JSON.stringify(next));
    setActive(null);
    setTab('progress');
  };

  if (active) {
    const pct = 1 - seconds / MOVE_SECONDS;
    const ActiveIcon = ICONS[active.id] || Dumbbell;
    return (
      <View style={styles.root}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <SafeAreaView style={styles.player}>
          <View style={styles.playerIcon} accessible={false}>
            <ActiveIcon size={32} color={colors.primary} accessible={false} />
          </View>
          <Text style={styles.playerKicker}>
            {active.name} · {moveIndex + 1}/{active.moves.length}
          </Text>
          <Text style={styles.playerMove} accessibilityRole="header">
            {active.moves[moveIndex]}
          </Text>
          <View style={styles.ring} accessibilityLabel={`${seconds} seconds left`}>
            <Text style={styles.ringText}>{seconds}</Text>
            <Text style={styles.ringSub}>seconds</Text>
          </View>
          <View style={styles.playerTrack}>
            <View style={[styles.playerFill, { width: `${pct * 100}%` }]} />
          </View>
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="End workout"
              style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              onPress={() => setActive(null)}
            >
              <X size={18} color={colors.text} accessible={false} />
              <Text style={styles.ghostText}>End</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={running ? 'Pause workout' : 'Resume workout'}
              style={({ pressed }) => [styles.primary, pressed && styles.pressedScale]}
              onPress={() => setRunning((r) => !r)}
            >
              {running ? <Pause size={20} color={colors.onPrimary} accessible={false} /> : <Play size={20} color={colors.onPrimary} accessible={false} />}
              <Text style={styles.primaryText}>{running ? 'Pause' : 'Resume'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip to next move"
              style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              onPress={() => setSeconds(0)}
            >
              <SkipForward size={18} color={colors.text} accessible={false} />
              <Text style={styles.ghostText}>Skip</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const totalMinutes = history.reduce((s, h) => s + h.minutes, 0);

  return (
    <View style={styles.root}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'workouts' ? (
            <>
              <Text style={styles.kicker}>Let&apos;s move</Text>
              <Text style={styles.title} accessibilityRole="header">
                Workouts
              </Text>
              {WORKOUTS.map((w, i) => {
                const hero = i === 0;
                const Icon = ICONS[w.id] || Dumbbell;
                return (
                  <Pressable
                    key={w.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Start ${w.name}, ${w.minutes} minutes, ${w.level}, ${w.moves.length} moves`}
                    onPress={() => start(w)}
                    style={({ pressed }) => [card, styles.card, hero && styles.heroCard, pressed && styles.pressedScale]}
                  >
                    <View style={hero ? styles.cardTop : styles.cardRow}>
                      <View style={hero ? styles.heroIcon : styles.iconBox} accessible={false}>
                        <Icon size={hero ? 56 : 30} color={hero ? colors.onPrimary : colors.primary} accessible={false} />
                      </View>
                      <View style={hero ? null : { flex: 1 }}>
                        <Text style={[styles.cardTitle, hero && styles.heroTitle]}>{w.name}</Text>
                        <View style={styles.metaRow}>
                          <Clock size={14} color={hero ? colors.onPrimary : colors.muted} accessible={false} />
                          <Text style={[styles.cardMeta, hero && { color: colors.onPrimary }]}>
                            {w.minutes} min · {w.level} · {w.moves.length} moves
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.startPill, hero && { backgroundColor: colors.surface }]}>
                      <Play size={16} color={colors.primary} fill={colors.primary} accessible={false} />
                      <Text style={styles.startText}>Start</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : (
            <>
              <Text style={styles.title} accessibilityRole="header">
                Progress
              </Text>
              <View style={styles.statRow}>
                <View style={[card, styles.stat, styles.statHero]}>
                  <Trophy size={24} color={colors.onPrimary} accessible={false} />
                  <Text style={[styles.statValue, { color: colors.onPrimary }]}>{history.length}</Text>
                  <Text style={[styles.statLabel, { color: colors.onPrimary }]}>Workouts</Text>
                </View>
                <View style={[card, styles.stat]}>
                  <Timer size={24} color={colors.primary} accessible={false} />
                  <Text style={styles.statValue}>{totalMinutes}</Text>
                  <Text style={styles.statLabel}>Minutes</Text>
                </View>
              </View>
              {history.length === 0 && (
                <View style={styles.emptyBox}>
                  <View style={styles.emptyCircle} accessible={false}>
                    <Trophy size={44} color={colors.primary} accessible={false} />
                  </View>
                  <Text style={styles.empty}>Finish a workout to see it here</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose a workout"
                    onPress={() => setTab('workouts')}
                    style={({ pressed }) => [styles.emptyButton, pressed && styles.pressedScale]}
                  >
                    <Dumbbell size={20} color={colors.onPrimary} accessible={false} />
                    <Text style={styles.primaryText}>Choose a workout</Text>
                  </Pressable>
                </View>
              )}
              {history.map((h) => {
                const Icon = iconFor(h.name);
                return (
                  <View key={h.id} style={[card, styles.logRow]}>
                    <View style={styles.logIcon} accessible={false}>
                      <Icon size={22} color={colors.primary} accessible={false} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.logTitle}>{h.name}</Text>
                      <Text style={styles.logMeta}>{new Date(h.date).toLocaleString()}</Text>
                    </View>
                    <Text style={styles.logMin}>{h.minutes}m</Text>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
        <View style={styles.tabBar}>
          {[
            ['workouts', Dumbbell, 'Workouts'],
            ['progress', Trophy, 'Progress'],
          ].map(([k, Icon, label]) => {
            const selected = tab === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
                onPress={() => setTab(k)}
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
  pressed: { opacity: 0.7 },
  pressedScale: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  kicker: { color: colors.primary, fontWeight: font.heading, textTransform: 'uppercase', fontSize: 13, letterSpacing: 0.5 },
  title: { fontSize: 34, fontWeight: font.heading, color: colors.text, letterSpacing: -0.5, marginBottom: 16 },
  card: { padding: 20, marginBottom: 12 },
  heroCard: { backgroundColor: colors.primary, padding: 24 },
  cardTop: { gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heroIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  iconBox: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 20, fontWeight: font.heading, color: colors.text },
  heroTitle: { fontSize: 24, color: colors.onPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardMeta: { color: colors.muted, fontSize: 14, fontVariant: ['tabular-nums'], flexShrink: 1 },
  startPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: radius.pill,
    marginTop: 16,
  },
  startText: { color: colors.primary, fontWeight: font.heading, fontSize: 15 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  stat: { flex: 1, padding: 20, gap: 4 },
  statHero: { backgroundColor: colors.primary },
  statValue: { fontSize: 32, fontWeight: font.heading, color: colors.text, fontVariant: ['tabular-nums'], marginTop: 8 },
  statLabel: { color: colors.muted, fontSize: 14 },
  emptyBox: { alignItems: 'center', paddingVertical: 24, gap: 16 },
  emptyCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.muted, textAlign: 'center', fontSize: 15 },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    height: 52,
    paddingHorizontal: 24,
    borderRadius: radius.md,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 56, marginBottom: 12 },
  logIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  logTitle: { fontWeight: font.heading, color: colors.text, fontSize: 16 },
  logMeta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  logMin: { fontWeight: font.heading, color: colors.primary, fontSize: 16, fontVariant: ['tabular-nums'] },
  player: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  playerIcon: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  playerKicker: { color: colors.muted, fontWeight: '600', fontSize: 15, fontVariant: ['tabular-nums'] },
  playerMove: { color: colors.text, fontSize: 32, fontWeight: font.heading, letterSpacing: -0.5, marginTop: 8, textAlign: 'center' },
  ring: { width: 200, height: 200, borderRadius: 100, borderWidth: 10, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginVertical: 32 },
  ringText: { color: colors.text, fontSize: 64, fontWeight: font.heading, fontVariant: ['tabular-nums'] },
  ringSub: { color: colors.muted, fontSize: 15 },
  playerTrack: { width: '100%', height: 6, backgroundColor: colors.border, borderRadius: 3 },
  playerFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 32 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    height: 52,
    borderRadius: radius.pill,
  },
  primaryText: { color: colors.onPrimary, fontWeight: font.heading, fontSize: 17 },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: 14,
    height: 52,
    borderRadius: radius.pill,
  },
  ghostText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8, paddingBottom: 20 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
});
