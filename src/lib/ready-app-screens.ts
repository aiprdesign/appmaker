/**
 * The screens of Appmaker's ready-made business apps (see ready-app.ts), as the
 * app's own source files. They follow what the best apps in each field do:
 * a big live tracker for orders and jobs (Domino's, Uber Eats, Starbucks), a
 * floating "View order" bar and quantity steppers (food apps), booking cards
 * with a clear timeline (Fresha, OpenTable), and small, quick animations that
 * confirm every tap. Colors, corners and type come from src/theme.js.
 */

/** src/ui.js: shared pieces: press feedback, entrance animations, skeletons, the live tracker and the success check. */
export const UI = `import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Icons from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { card, colors, gradient, heading, label, radius } from './theme';
import { kind, stages } from './business';

export function Icon({ name, ...props }) {
  const C = Icons[name] || Icons.Circle;
  return <C {...props} />;
}

/** A light tap on the phone (a stronger one for good news). Silent where it isn't supported. */
export function buzz(type) {
  try {
    if (Platform.OS === 'web') return;
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {}
}

const PressableBox = Animated.createAnimatedComponent(Pressable);

// The phone's "Reduce motion" setting: bounces, shakes and slide-ins stay still when it's on.
let reduced = false;
try {
  AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduced = !!v)).catch(() => {});
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => (reduced = !!v));
} catch (e) {}

/** A quick bounce whenever its value changes: counts, quantities and totals. */
export function Pop({ value, style, children }) {
  const s = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    s.setValue(1.3);
    Animated.spring(s, { toValue: 1, friction: 4, tension: 180, useNativeDriver: true }).start();
  }, [value]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

/** A short side-to-side shake for "this needs fixing": [style, shake]. */
export function useShake() {
  const x = useRef(new Animated.Value(0)).current;
  const shake = () => {
    if (reduced) return;
    x.setValue(0);
    Animated.sequence([10, -10, 6, -6, 0].map((v) => Animated.timing(x, { toValue: v, duration: 45, useNativeDriver: true }))).start();
  };
  return [{ transform: [{ translateX: x }] }, shake];
}

/** A button or card that gives a little when pressed. */
export function Tap({ style, onPress, children, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => Animated.spring(scale, { toValue: v, speed: 40, bounciness: 8, useNativeDriver: true }).start();
  return (
    <PressableBox {...rest} onPress={onPress} onPressIn={() => to(0.96)} onPressOut={() => to(1)} style={[style, { transform: [{ scale }] }]}>
      {children}
    </PressableBox>
  );
}

/** Fades and slides in when it first appears; several with growing delays arrive one after another. */
export function Rise({ delay = 0, style, children }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return t.setValue(1);
    Animated.timing(t, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return <Animated.View style={[style, { opacity: t, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/**
 * An item's photo, or its icon until it has one. In Appmaker's builder (never on customers' phones)
 * it carries a small camera badge: tapping it opens this item's photo picker next to the phone.
 */
const EDIT = typeof global !== 'undefined' ? global.__APPMAKER_EDIT__ : null;
export function PhotoSlot({ item, style, iconName, iconSize = 24 }) {
  const box = [style, { borderRadius: radius.md, backgroundColor: colors.primarySoft }];
  const photo = item.image ? (
    <Image source={{ uri: item.image }} style={box} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[box, { alignItems: 'center', justifyContent: 'center' }]}>
      <Icon name={iconName} size={iconSize} color={colors.primary} />
    </View>
  );
  if (!EDIT) return photo;
  return (
    <Tap onPress={() => EDIT({ kind: 'photo', item: item.name })} accessibilityRole="button" accessibilityLabel={(item.image ? 'Change the photo of ' : 'Add a photo of ') + item.name}>
      {photo}
      <View style={[styles.editBadge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
        <Icons.Camera size={12} color={colors.onPrimary} />
      </View>
    </Tap>
  );
}

/** A soft placeholder while something loads. */
export function Skeleton({ height = 72 }) {
  const t = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ height, opacity: t, borderRadius: radius.lg, backgroundColor: colors.border }} />;
}

/** A small pulsing dot: this is live. */
export function LiveDot() {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.liveWrap} accessibilityLabel="Live">
      <Animated.View style={[styles.liveRing, { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }] }]} />
      <View style={styles.liveDot} />
    </View>
  );
}

/** "$11" → 11; prices like "from 45" or "Quote" → null. */
export const amount = (price) => {
  const m = /^\\s*([$£€])?\\s?(\\d+(?:[.,]\\d{1,2})?)\\s*$/.exec(String(price || ''));
  return m ? Number(m[2].replace(',', '.')) : null;
};
// A plain number gets the dollar sign ("11" → "$11", "from 59" → "from $59"); prices with their own sign stay as they are.
export const money = (price) => (/[$£€]/.test(String(price)) ? price : String(price).replace(/\\d[\\d.,]*/, (n) => '$' + n));
const sign = (picked) => ((picked.map((p) => /[$£€]/.exec(String(p.price || ''))).find(Boolean) || ['$'])[0]);

/** How many things are picked, and their total when every price is a plain amount. */
export function basket(picked) {
  const count = picked.reduce((n, p) => n + p.qty, 0);
  const sums = picked.map((p) => amount(p.price));
  const total = sums.every((x) => x != null) && picked.length ? sign(picked) + sums.reduce((a, x, i) => a + x * picked[i].qty, 0).toFixed(2).replace(/\\.00$/, '') : null;
  return { count, total };
}

/** "2× Margherita, 1× Garlic bread ($27)" → [{ name: 'Margherita', qty: 2 }, …]: the basket an order was sent with. */
export function parseBasket(text) {
  return String(text || '')
    .replace(/\\s*\\([^)]*\\)\\s*$/, '')
    .split(/,\\s*/)
    .map((part) => {
      const m = /^(\\d+)×\\s*(.+)$/.exec(part.trim());
      return m ? { name: m[2].trim(), qty: Number(m[1]) } : { name: part.trim(), qty: 1 };
    })
    .filter((p) => p.name);
}

/** A past order as a new basket, at today's prices; what's no longer offered is left out (and named). */
export function again(order, menu) {
  const list = [];
  const missing = [];
  for (const p of parseBasket(order.items || order.service)) {
    const now = menu.find((m) => m.name === p.name);
    if (now) list.push({ name: now.name, price: now.price, qty: p.qty });
    else missing.push(p.name);
  }
  return { list, missing };
}

const celebrated = new Set();

/** A burst of confetti from the middle of its parent, each time "fire" goes up. */
function Confetti({ fire }) {
  const pieces = useRef(
    Array.from({ length: 18 }, (_, i) => ({
      t: new Animated.Value(0),
      angle: (i / 18) * Math.PI * 2 + (i % 3) * 0.2,
      dist: 70 + (i % 4) * 22,
      spin: (i % 2 ? 1 : -1) * (180 + (i % 5) * 90),
      round: i % 3 === 0,
    })),
  ).current;
  useEffect(() => {
    if (!fire) return;
    Animated.stagger(
      12,
      pieces.map((p) => {
        p.t.setValue(0);
        return Animated.timing(p.t, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true });
      }),
    ).start();
  }, [fire]);
  if (!fire) return null;
  const tones = [colors.primary, colors.success, gradient[gradient.length - 1], colors.primarySoft];
  return (
    <View pointerEvents="none" style={styles.confetti}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            p.round ? styles.dotPiece : styles.piece,
            {
              backgroundColor: tones[i % tones.length],
              opacity: p.t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: p.t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * p.dist] }) },
                // Up and out, then falling a little (gravity).
                { translateY: p.t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, Math.sin(p.angle) * p.dist * 0.9, Math.sin(p.angle) * p.dist + 36] }) },
                { rotate: p.t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.spin + 'deg'] }) },
                { scale: p.t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1, 0.8] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The live tracker, like the best ordering apps: the stage in big words with its own icon,
 * every step on a track that fills (with a light sweeping along it) as the business moves it on,
 * the current step pulsing, the icon gently bobbing while work goes on, a pop and buzz on each
 * step, and confetti when it's ready.
 */
export function Tracker({ item, info, title }) {
  const at = info.cancelled ? -1 : Math.max(0, stages.findIndex((s) => s.status === item.status));
  const stage = stages[Math.max(0, at)];
  const last = stages.length - 1;
  const fill = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const [track, setTrack] = useState(0);
  const [fire, setFire] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    Animated.timing(fill, { toValue: last > 0 ? Math.max(0, at) / last : 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const big = at > 0 && at >= last - 1;
    if (!first.current && at > 0) {
      buzz(big ? 'success' : 'light');
      pop.setValue(0.5);
      Animated.spring(pop, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }).start();
    }
    // Ready (or done): celebrate, once per order, the first time the customer sees it (even if it got ready while they were away).
    if (big && !celebrated.has(item.id + ':' + at)) {
      celebrated.add(item.id + ':' + at);
      setFire((f) => f + 1);
    }
    first.current = false;
  }, [at]);
  useEffect(() => {
    if (info.done) return undefined;
    const loops = [
      Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1300, easing: Easing.out(Easing.quad), useNativeDriver: true })),
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [info.done]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  if (info.cancelled) {
    return (
      <View style={[card, styles.tracker, { opacity: 0.7 }]}>
        <Text style={[label, { color: colors.muted }]}>{title}</Text>
        <Text style={[styles.stage, heading, { color: colors.text }]}>Cancelled</Text>
        <Text style={[styles.note, { color: colors.muted }]}>{item.items || item.service || item.details}</Text>
      </View>
    );
  }
  return (
    <View style={[card, styles.tracker]} accessibilityLabel={title + ': ' + stage.label + '. Step ' + (at + 1) + ' of ' + stages.length + '.'}>
      <View style={styles.row}>
        <Text style={[label, styles.flex, { color: colors.muted }]}>{title}{item.ref ? ' · #' + item.ref : ''}</Text>
        {!info.done && <LiveDot />}
      </View>
      <View style={styles.row}>
        <View>
          <Animated.View
            style={[
              styles.bigIcon,
              { borderRadius: radius.lg, overflow: 'hidden', transform: [{ scale: pop }, { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
            ]}
          >
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bigIconFill}>
              <Icon name={stage.icon} size={28} color={colors.onPrimary} />
            </LinearGradient>
          </Animated.View>
          <Confetti fire={fire} />
        </View>
        <Rise key={stage.status} style={styles.flex}>
          <Text style={[styles.stage, heading, { color: colors.text }]}>{stage.label}</Text>
          <Text style={[styles.note, { color: colors.muted }]}>{stage.note}</Text>
        </Rise>
      </View>
      <View style={styles.steps}>
        <View style={[styles.track, { backgroundColor: colors.border }]} onLayout={(e) => setTrack(e.nativeEvent.layout.width)}>
          <Animated.View style={[styles.trackFill, { width }]}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            {!info.done && track > 0 && (
              <Animated.View style={[styles.sweep, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-64, track] }) }] }]}>
                <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              </Animated.View>
            )}
          </Animated.View>
        </View>
        {stages.map((s, i) => {
          const done = i < at || (info.done && i === at);
          const now = i === at && !info.done;
          return (
            <View key={s.status} style={styles.step}>
              <View style={styles.dotWrap}>
                {now && (
                  <Animated.View
                    style={[
                      styles.ring,
                      { borderColor: colors.primary, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.1] }) }] },
                    ]}
                  />
                )}
                <View style={[styles.dot, { backgroundColor: done || now ? colors.primary : colors.surface, borderColor: done || now ? colors.primary : colors.border }]}>
                  {done ? <Icons.Check size={16} color={colors.onPrimary} strokeWidth={3} /> : <Icon name={s.icon} size={16} color={now ? colors.onPrimary : colors.muted} />}
                </View>
              </View>
              <Text numberOfLines={2} style={[styles.stepText, { color: i <= at ? colors.text : colors.muted, fontWeight: now ? '700' : '500' }]}>{s.label}</Text>
            </View>
          );
        })}
      </View>
      {!!(item.items || item.service || item.details) && (
        <Text numberOfLines={2} style={[styles.note, { color: colors.text }]}>{item.items || item.service || item.details}{item.pickupTime ? ' · ' + item.pickupTime : item.preferredTime ? ' · ' + item.preferredTime : ''}</Text>
      )}
    </View>
  );
}

/** A big check that springs in, with a ring that spreads: it's sent. */
export function SuccessCheck() {
  const t = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    buzz('success');
    Animated.parallel([
      Animated.spring(t, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <View style={styles.checkWrap}>
      <Animated.View style={[styles.checkRing, { borderColor: colors.success, opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 2] }) }] }]} />
      <Animated.View style={[styles.check, { backgroundColor: colors.success, transform: [{ scale: t }] }]}>
        <Icons.Check size={40} color={colors.onPrimary} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tracker: { padding: 20, gap: 16 },
  bigIcon: { width: 56, height: 56 },
  bigIconFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  confetti: { position: 'absolute', left: 28, top: 28, width: 0, height: 0 },
  piece: { position: 'absolute', width: 6, height: 12, borderRadius: 2 },
  dotPiece: { position: 'absolute', width: 8, height: 8, borderRadius: 999 },
  sweep: { position: 'absolute', top: 0, bottom: 0, width: 64 },
  stage: { fontSize: 22 },
  note: { fontSize: 13, marginTop: 4 },
  steps: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { position: 'absolute', left: 32, right: 32, top: 13, height: 8, borderRadius: 999, overflow: 'hidden' },
  trackFill: { height: 8, overflow: 'hidden' },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  dotWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 32, height: 32, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 32, height: 32, borderRadius: 999, borderWidth: 2 },
  stepText: { fontSize: 12, textAlign: 'center', paddingHorizontal: 4 },
  liveWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 999, backgroundColor: colors.success },
  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.success },
  editBadge: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkWrap: { alignSelf: 'center', width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  checkRing: { position: 'absolute', width: 96, height: 96, borderRadius: 999, borderWidth: 4 },
  check: { width: 80, height: 80, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
`;

/** App.js: the tabs, the basket shared by the screens, and the floating "View order" bar. */
export const APP = `import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Icons from 'lucide-react-native';
import { colors, mode, radius } from './src/theme';
import { icons, kind, words } from './src/business';
import { basket, buzz, Icon, Pop, Tap } from './src/ui';
import HomeScreen from './src/screens/HomeScreen';
import ItemsScreen from './src/screens/ItemsScreen';
import RequestScreen from './src/screens/RequestScreen';
import InfoScreen from './src/screens/InfoScreen';

const TABS = [
  { key: 'home', label: 'Home', icon: 'House' },
  { key: 'items', label: words.items, icon: icons.items },
  { key: 'request', label: words.tab, icon: icons.request },
  { key: 'info', label: 'Info', icon: 'Info' },
];

/** A tab's icon gives a little hop when it's chosen. */
function TabIcon({ name, on, badge }) {
  const hop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on) return;
    hop.setValue(0.8);
    Animated.spring(hop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [on]);
  return (
    <Animated.View style={[styles.tabIcon, { borderRadius: radius.pill, backgroundColor: on ? colors.primarySoft : 'transparent', transform: [{ scale: hop }] }]}>
      <Icon name={name} size={24} color={on ? colors.primary : colors.muted} strokeWidth={on ? 2.4 : 2} />
      {badge > 0 && (
        <Pop value={badge} style={[styles.badge, { backgroundColor: colors.primary, borderColor: colors.surface }]}>
          <Text style={[styles.badgeText, { color: colors.onPrimary }]}>{badge}</Text>
        </Pop>
      )}
    </Animated.View>
  );
}

/** "View order · 3 items · $27": rises above the tabs once something is picked (like the big food apps). */
function BasketBar({ count, total, onPress }) {
  const y = useRef(new Animated.Value(120)).current;
  useEffect(() => {
    Animated.spring(y, { toValue: count > 0 ? 0 : 120, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [count > 0]);
  return (
    <Animated.View pointerEvents={count > 0 ? 'auto' : 'none'} style={[styles.barWrap, { transform: [{ translateY: y }] }]}>
      <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={(kind === 'order' ? 'View order, ' : 'Continue, ') + count + ' picked'} style={[styles.bar, { backgroundColor: colors.primary, borderRadius: radius.lg }]}>
        <Pop value={count} style={[styles.count, { backgroundColor: colors.onPrimary, borderRadius: radius.pill }]}>
          <Text style={[styles.countText, { color: colors.primary }]}>{count}</Text>
        </Pop>
        <Text style={[styles.barText, { color: colors.onPrimary }]}>{kind === 'order' ? 'View order' : words.cta}</Text>
        <Pop value={total}>
          <Text style={[styles.barText, { color: colors.onPrimary }]}>{total || ''}</Text>
        </Pop>
        <Icons.ChevronRight size={20} color={colors.onPrimary} />
      </Tap>
    </Animated.View>
  );
}

function Shell() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('home');
  // What the customer picked: [{ name, price, qty }], carried into the order or request.
  const [picked, setPicked] = useState([]);
  const pick = (item) => {
    buzz();
    setPicked((now) => {
      const found = now.find((p) => p.name === item.name);
      if (found) return kind === 'order' ? now.map((p) => (p.name === item.name ? { ...p, qty: p.qty + 1 } : p)) : now;
      return [...now, { name: item.name, price: item.price, qty: 1 }];
    });
    // Orders keep browsing (the bar shows the basket); bookings and requests go straight to the form.
    if (kind !== 'order') setTab('request');
  };
  // "Order again": a past order's basket, straight into the order screen.
  const reorder = (list) => {
    buzz();
    setPicked(list);
    setTab('request');
  };
  const setQty = (name, qty) => setPicked((now) => (qty <= 0 ? now.filter((p) => p.name !== name) : now.map((p) => (p.name === name ? { ...p, qty } : p))));
  const { count, total } = basket(picked);
  const screens = {
    home: <HomeScreen go={setTab} pick={pick} reorder={reorder} />,
    items: <ItemsScreen pick={pick} picked={picked} setQty={setQty} />,
    request: <RequestScreen picked={picked} setQty={setQty} clear={() => setPicked([])} go={setTab} reorder={reorder} />,
    info: <InfoScreen />,
  };
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.body}>
        {screens[tab]}
        {kind === 'order' && tab !== 'request' && <BasketBar count={count} total={total} onPress={() => setTab('request')} />}
      </View>
      <View style={[styles.tabs, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} style={styles.tab}>
              <TabIcon name={t.icon} on={on} badge={t.key === 'request' ? count : 0} />
              <Text style={[styles.tabText, { color: on ? colors.primary : colors.muted }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 48 },
  tabIcon: { paddingHorizontal: 16, paddingVertical: 4 },
  tabText: { fontSize: 12, fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: 4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  barWrap: { position: 'absolute', left: 16, right: 16, bottom: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  count: { minWidth: 28, height: 28, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 15, fontWeight: '700' },
  barText: { flex: 1, fontSize: 17, fontWeight: '700' },
});
`;

/** The home screen: who they are, what's happening with your order, the main action, and favourites. */
export const HOME = `import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Icons from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { card, colors, gradient, heading, label, onGradient, radius } from '../theme';
import { business, icons, kind, words } from '../business';
import { useCollection } from '../appdata';
import { call, directions, whatsapp } from '../actions';
import { Icon, PhotoSlot, Rise, Tap, Tracker, again, money } from '../ui';

export default function HomeScreen({ go, pick, reorder }) {
  const { items } = useCollection('items');
  const requests = useCollection('requests');
  // The customer's latest order or booking still in progress, shown first (like a delivery tracker).
  const active = requests.items.find((x) => x.mine && !requests.statusInfo(x.status).done);
  // Their last few finished orders, to order the same again in one tap (like the big food apps).
  const recent = requests.items
    .filter((x) => x.mine && (x.items || x.service))
    .filter((x) => { const s = requests.statusInfo(x.status); return s.done && !s.cancelled; })
    .slice(0, 3);
  const actions = [
    business.phone ? { label: 'Call', icon: Icons.Phone, onPress: call } : null,
    business.whatsapp ? { label: 'WhatsApp', icon: Icons.MessageCircle, onPress: whatsapp } : null,
    business.address ? { label: 'Directions', icon: Icons.Navigation, onPress: directions } : null,
  ].filter(Boolean);
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Rise>
        <Text style={[styles.title, heading, { color: colors.text }]}>{business.name}</Text>
        {!!business.tagline && <Text style={[styles.body, { color: colors.muted }]}>{business.tagline}</Text>}
        {!!business.hours[0] && (
          <View style={styles.row}>
            <Icons.Clock size={16} color={colors.success} />
            <Text style={[styles.small, { color: colors.success }]}>{business.hours[0]}</Text>
          </View>
        )}
      </Rise>

      {active ? (
        <Rise delay={80}>
          <Tap onPress={() => go('request')} accessibilityRole="button" accessibilityHint="Opens your order">
            <Tracker item={active} info={requests.statusInfo(active.status)} title={kind === 'order' ? 'Your order' : kind === 'booking' ? 'Your booking' : 'Your request'} />
          </Tap>
        </Rise>
      ) : (
        <Rise delay={80}>
          <Tap onPress={() => go(kind === 'order' ? 'items' : 'request')} accessibilityRole="button" accessibilityLabel={words.cta}>
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { borderRadius: radius.lg }]}>
              <View style={[styles.heroIcon, { borderRadius: radius.lg }]}>
                <Icon name={icons.hero} size={32} color={onGradient} />
              </View>
              <Text style={[styles.heroTitle, heading, { color: onGradient }]}>{words.cta}</Text>
              <Text style={[styles.body, { color: onGradient, opacity: 0.9 }]}>
                {kind === 'order' ? 'Order ahead and watch it get made, step by step.' : kind === 'booking' ? 'Pick a time that suits you; we confirm it here.' : 'Tell us what you need and get a price, fast.'}
              </Text>
              <View style={[styles.heroButton, { backgroundColor: onGradient, borderRadius: radius.md }]}>
                <Text style={[styles.buttonText, { color: colors.primary }]}>{kind === 'order' ? 'Start your order' : words.cta}</Text>
                <Icons.ArrowRight size={20} color={colors.primary} />
              </View>
            </LinearGradient>
          </Tap>
        </Rise>
      )}

      {actions.length > 0 && (
        <Rise delay={160} style={styles.actions}>
          {actions.map((a) => (
            <Tap key={a.label} onPress={a.onPress} accessibilityRole="button" style={[styles.action, card]}>
              <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft, borderRadius: radius.pill }]}>
                <a.icon size={20} color={colors.primary} />
              </View>
              <Text style={[styles.small, { color: colors.text, fontWeight: '600' }]}>{a.label}</Text>
            </Tap>
          ))}
        </Rise>
      )}

      {recent.length > 0 && (
        <Rise delay={200}>
          <View style={styles.sectionHead}>
            <Text style={[label, { color: colors.muted }]}>{kind === 'order' ? 'Order again' : kind === 'booking' ? 'Book again' : 'Ask again'}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {recent.map((x) => {
              const { list } = again(x, items);
              return (
                <Tap
                  key={x.id}
                  onPress={() => (list.length ? reorder(list) : go('items'))}
                  accessibilityRole="button"
                  accessibilityLabel={(kind === 'order' ? 'Order again: ' : 'Again: ') + (x.items || x.service)}
                  style={[card, styles.againCard]}
                >
                  <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft, borderRadius: radius.pill }]}>
                    <Icons.RotateCcw size={20} color={colors.primary} />
                  </View>
                  <Text numberOfLines={2} style={[styles.itemName, { color: colors.text }]}>{x.items || x.service}</Text>
                  <Text style={[styles.small, { color: colors.muted }]}>{x.createdAt ? new Date(x.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}</Text>
                </Tap>
              );
            })}
          </ScrollView>
        </Rise>
      )}

      <Rise delay={240}>
        <View style={styles.sectionHead}>
          <Text style={[label, { color: colors.muted }]}>{kind === 'order' ? 'Favourites' : 'Popular'}</Text>
          <Tap onPress={() => go('items')} accessibilityRole="button" hitSlop={12}>
            <Text style={[styles.small, { color: colors.primary, fontWeight: '600' }]}>See all</Text>
          </Tap>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
          {items.slice(0, 6).map((it) => (
            <Tap
              key={it.id || it.name}
              onPress={() => pick(it)}
              accessibilityRole="button"
              accessibilityLabel={words.add + ' ' + it.name + (it.price ? ', ' + money(it.price) : '')}
              style={[card, styles.favourite]}
            >
              <PhotoSlot item={it} style={styles.photo} iconName={icons.items} iconSize={32} />
              <Text numberOfLines={1} style={[styles.itemName, { color: colors.text }]}>{it.name}</Text>
              <View style={styles.row}>
                <Text style={[styles.small, styles.flex, { color: colors.muted }]}>{it.price ? money(it.price) : ' '}</Text>
                <View style={[styles.plus, { backgroundColor: colors.primary, borderRadius: radius.pill }]}>
                  <Icons.Plus size={16} color={colors.onPrimary} strokeWidth={3} />
                </View>
              </View>
            </Tap>
          ))}
        </ScrollView>
      </Rise>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 96, gap: 16 },
  title: { fontSize: 28, marginTop: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  flex: { flex: 1 },
  hero: { padding: 20, gap: 8 },
  heroIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  heroTitle: { fontSize: 22, marginTop: 4 },
  heroButton: { marginTop: 8, minHeight: 48, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16 },
  actionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cards: { gap: 12, paddingRight: 20 },
  favourite: { width: 156, padding: 12, gap: 8 },
  againCard: { width: 220, padding: 12, gap: 8 },
  photo: { width: '100%', height: 96 },
  photoIcon: { alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 15, fontWeight: '600' },
  plus: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
`;

/** The menu or services: categories, photos, and Add that turns into a quantity stepper. */
export const ITEMS = `import React, { useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Icons from 'lucide-react-native';
import { card, colors, heading, radius } from '../theme';
import { icons, kind, words } from '../business';
import { useCollection } from '../appdata';
import { Icon, PhotoSlot, Pop, Rise, Skeleton, Tap, money } from '../ui';

export default function ItemsScreen({ pick, picked, setQty }) {
  const { items, loading, error, refresh } = useCollection('items');
  const [category, setCategory] = useState('All');
  const categories = useMemo(() => ['All', ...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const shown = category === 'All' ? items : items.filter((i) => i.category === category);
  const qty = (name) => (picked.find((p) => p.name === name) || { qty: 0 }).qty;
  return (
    <ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.primary} />}>
      <Text style={[styles.title, heading, { color: colors.text }]}>{words.items}</Text>
      {categories.length > 2 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {categories.map((c) => {
            const on = c === category;
            return (
              <Tap
                key={c}
                onPress={() => setCategory(c)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { borderRadius: radius.pill, backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
              >
                <Text style={[styles.small, { color: on ? colors.onPrimary : colors.text, fontWeight: '600' }]}>{c}</Text>
              </Tap>
            );
          })}
        </ScrollView>
      )}
      {loading && !items.length ? [0, 1, 2].map((i) => <Skeleton key={i} height={96} />) : null}
      {error && !items.length ? (
        <Tap onPress={refresh} accessibilityRole="button" style={[card, styles.item]}>
          <Icons.RefreshCw size={20} color={colors.primary} />
          <Text style={[styles.body, { color: colors.text }]}>Couldn't load this. Tap to try again.</Text>
        </Tap>
      ) : null}
      {shown.map((it, i) => {
        const n = qty(it.name);
        return (
          <Rise key={it.id || it.name} delay={Math.min(i, 8) * 50}>
            <View style={[card, styles.item]}>
              <PhotoSlot item={it} style={styles.photo} iconName={icons.items} />
              <View style={styles.flex}>
                <Text style={[styles.name, { color: colors.text }]}>{it.name}</Text>
                {!!it.description && <Text numberOfLines={2} style={[styles.small, { color: colors.muted }]}>{it.description}</Text>}
                {!!it.price && <Text style={[styles.price, { color: colors.text }]}>{money(it.price)}</Text>}
              </View>
              {kind === 'order' && n > 0 ? (
                <View style={[styles.stepper, { backgroundColor: colors.primary, borderRadius: radius.pill }]}>
                  <Tap onPress={() => setQty(it.name, n - 1)} accessibilityRole="button" accessibilityLabel={'One less ' + it.name} style={styles.stepButton}>
                    {n === 1 ? <Icons.Trash2 size={16} color={colors.onPrimary} /> : <Icons.Minus size={16} color={colors.onPrimary} strokeWidth={3} />}
                  </Tap>
                  <Pop value={n}>
                    <Text style={[styles.qty, { color: colors.onPrimary }]} accessibilityLabel={n + ' in your order'}>{n}</Text>
                  </Pop>
                  <Tap onPress={() => pick(it)} accessibilityRole="button" accessibilityLabel={'One more ' + it.name} style={styles.stepButton}>
                    <Icons.Plus size={16} color={colors.onPrimary} strokeWidth={3} />
                  </Tap>
                </View>
              ) : (
                <Tap
                  onPress={() => pick(it)}
                  accessibilityRole="button"
                  accessibilityLabel={words.add + ' ' + it.name}
                  style={[styles.add, { backgroundColor: colors.primarySoft, borderRadius: radius.pill }]}
                >
                  <Icons.Plus size={16} color={colors.primary} strokeWidth={3} />
                  <Text style={[styles.small, { color: colors.primary, fontWeight: '700' }]}>{words.add}</Text>
                </Tap>
              )}
            </View>
          </Rise>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 96, gap: 12 },
  title: { fontSize: 28, marginTop: 8 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', borderWidth: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  photo: { width: 72, height: 72 },
  photoIcon: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 4 },
  name: { fontSize: 17, fontWeight: '600' },
  price: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 15, flex: 1 },
  small: { fontSize: 13 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 40 },
  stepper: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  stepButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  qty: { fontSize: 15, fontWeight: '700', minWidth: 16, textAlign: 'center' },
});
`;

/** The order or request: the basket with steppers, a short form, the animated "sent", and live trackers. */
export const REQUEST = `import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Icons from 'lucide-react-native';
import { card, colors, heading, label, radius } from '../theme';
import { business, kind, onSite, stages, words } from '../business';

/** The customer's own details, kept on this phone only so they don't type them again (Info → Your saved details clears them). */
export const SAVED_DETAILS = 'customer:details';
import { useCollection } from '../appdata';
import { Pop, Rise, SuccessCheck, Tap, Tracker, again, basket, money, useShake } from '../ui';

function Field({ title, value, onChange, hint, multiline, keyboardType, autoComplete }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.small, { color: colors.text, fontWeight: '600' }]}>{title}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={hint}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        accessibilityLabel={title}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={[styles.input, multiline && styles.multi, { color: colors.text, borderColor: focus ? colors.primary : colors.border, backgroundColor: colors.surface, borderRadius: radius.md }]}
      />
    </View>
  );
}

export default function RequestScreen({ picked, setQty, clear, go, reorder }) {
  const { items, add, cancel, statusInfo } = useCollection('requests');
  const menu = useCollection('items');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [when, setWhen] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [problem, setProblem] = useState('');
  const [shakeStyle, shake] = useShake();
  useEffect(() => {
    if (problem) shake();
  }, [problem]);
  const [another, setAnother] = useState(false);
  const scroll = useRef(null);
  const what = picked.map((p) => (kind === 'order' ? p.qty + '× ' : '') + p.name).join(', ');
  const { total } = basket(picked);
  const ready = name.trim() && phone.trim() && (kind === 'quote' ? what || details.trim() : what) && (!onSite || address.trim());
  const mine = items.filter((x) => x.mine);
  const active = mine.filter((x) => !statusInfo(x.status).done);
  const past = mine.filter((x) => statusInfo(x.status).done).slice(0, 8);
  const title = kind === 'order' ? 'Your order' : kind === 'booking' ? 'Your booking' : 'Your request';
  const againWord = kind === 'order' ? 'Order again' : kind === 'booking' ? 'Book again' : 'Ask again';

  // Returning customers don't type their details again: kept on this phone only, with a switch and a Clear.
  const [remember, setRemember] = useState(true);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(SAVED_DETAILS)
      .then((v) => {
        const d = v ? JSON.parse(v) : null;
        if (!d) return;
        setSaved(d);
        setName((n) => n || d.name || '');
        setPhone((p) => p || d.phone || '');
        if (onSite) setAddress((a) => a || d.address || '');
      })
      .catch(() => {});
  }, []);
  const keepDetails = async () => {
    try {
      if (remember) {
        const d = { name: name.trim(), phone: phone.trim(), ...(onSite ? { address: address.trim() } : {}) };
        await AsyncStorage.setItem(SAVED_DETAILS, JSON.stringify(d));
        setSaved(d);
      } else {
        await AsyncStorage.removeItem(SAVED_DETAILS);
        setSaved(null);
      }
    } catch (e) {}
  };
  const clearDetails = () => {
    AsyncStorage.removeItem(SAVED_DETAILS).catch(() => {});
    setSaved(null);
    setName('');
    setPhone('');
    setAddress('');
  };

  const orderAgain = (x) => {
    const { list, missing } = again(x, menu.items);
    if (!list.length) return Alert.alert('Not available right now', "Those aren't on the " + words.items.toLowerCase() + ' at the moment. Have a look at what is.', [{ text: 'See ' + words.items.toLowerCase(), onPress: () => go('items') }]);
    reorder(list);
    setSent(null);
    if (scroll.current) scroll.current.scrollTo({ y: 0, animated: true });
    if (missing.length) Alert.alert('Almost the same', missing.join(', ') + (missing.length === 1 ? " isn't" : " aren't") + ' available right now, so we left ' + (missing.length === 1 ? 'it' : 'them') + ' out.');
  };

  const send = async () => {
    setSending(true);
    setProblem('');
    try {
      const fields =
        kind === 'order'
          ? { name, phone, items: what + (total ? ' (' + total + ')' : ''), pickupTime: when, note: details }
          : kind === 'booking'
            ? { name, phone, service: what, preferredTime: when, note: details }
            : { name, phone, ...(onSite ? { address } : {}), service: what, details };
      setSent(await add(fields));
      keepDetails();
      clear();
      setAnother(false);
      // Up to the check and the live tracker.
      if (scroll.current) scroll.current.scrollTo({ y: 0, animated: true });
      setWhen('');
      setDetails('');
    } catch (e) {
      setProblem((e && e.message) || 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  const confirmCancel = (id) =>
    Alert.alert('Cancel this?', 'To change it instead, call ' + business.name + '.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel it', style: 'destructive', onPress: () => cancel(id).catch((e) => Alert.alert("Couldn't cancel", e.message)) },
    ]);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, heading, { color: colors.text }]}>{kind === 'order' ? 'Your order' : words.cta}</Text>

        {sent && (
          <Rise style={[card, styles.sent]}>
            <SuccessCheck />
            <Text style={[styles.sentTitle, heading, { color: colors.text }]}>{kind === 'order' ? 'Order sent' : 'Request sent'}{sent.ref ? ' · #' + sent.ref : ''}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>{business.name} has it now. Follow every step below; it updates by itself.</Text>
          </Rise>
        )}

        {active.map((x) => {
          const s = statusInfo(x.status);
          return (
            <Rise key={x.id}>
              <Tracker item={x} info={s} title={title} />
              {s.canCancel && (
                <Tap onPress={() => confirmCancel(x.id)} accessibilityRole="button" style={styles.cancel}>
                  <Text style={[styles.small, { color: colors.danger, fontWeight: '600' }]}>Cancel {kind === 'order' ? 'order' : 'request'}</Text>
                </Tap>
              )}
            </Rise>
          );
        })}

        {active.length > 0 && !picked.length && !another ? (
          <Tap onPress={() => setAnother(true)} accessibilityRole="button" style={[styles.button, styles.row, { borderColor: colors.primary, borderWidth: 1.5, borderRadius: radius.md }]}>
            <Icons.Plus size={20} color={colors.primary} strokeWidth={3} />
            <Text style={[styles.buttonText, { color: colors.primary }]}>{kind === 'order' ? 'Start another order' : 'Send another request'}</Text>
          </Tap>
        ) : (
        <View style={[card, styles.form]}>
          <Text style={[label, { color: colors.muted }]}>{kind === 'order' ? 'Basket' : 'What you need'}</Text>
          {picked.map((p) => (
            <View key={p.name} style={styles.line}>
              {kind === 'order' ? (
                <View style={[styles.stepper, { borderColor: colors.border, borderRadius: radius.pill }]}>
                  <Tap onPress={() => setQty(p.name, p.qty - 1)} accessibilityRole="button" accessibilityLabel={'One less ' + p.name} style={styles.stepButton}>
                    <Icons.Minus size={16} color={colors.text} />
                  </Tap>
                  <Text style={[styles.body, { color: colors.text, fontWeight: '700' }]}>{p.qty}</Text>
                  <Tap onPress={() => setQty(p.name, p.qty + 1)} accessibilityRole="button" accessibilityLabel={'One more ' + p.name} style={styles.stepButton}>
                    <Icons.Plus size={16} color={colors.text} />
                  </Tap>
                </View>
              ) : null}
              <Text style={[styles.body, styles.flex, { color: colors.text }]}>{p.name}</Text>
              {!!p.price && <Text style={[styles.body, { color: colors.muted }]}>{money(p.price)}</Text>}
              {kind !== 'order' && (
                <Tap onPress={() => setQty(p.name, 0)} accessibilityRole="button" accessibilityLabel={'Remove ' + p.name} hitSlop={8}>
                  <Icons.X size={20} color={colors.muted} />
                </Tap>
              )}
            </View>
          ))}
          {total && (
            <View style={[styles.line, styles.totalLine, { borderTopColor: colors.border }]}>
              <Text style={[styles.body, styles.flex, { color: colors.text, fontWeight: '700' }]}>Total</Text>
              <Pop value={total}>
                <Text style={[styles.totalText, { color: colors.text }]}>{total}</Text>
              </Pop>
            </View>
          )}
          <Tap onPress={() => go('items')} accessibilityRole="button" style={styles.more}>
            <Icons.Plus size={16} color={colors.primary} strokeWidth={3} />
            <Text style={[styles.small, { color: colors.primary, fontWeight: '700' }]}>{picked.length ? 'Add more' : 'Choose from ' + words.items.toLowerCase()}</Text>
          </Tap>

          {saved && (
            <View style={[styles.savedRow, { backgroundColor: colors.primarySoft, borderRadius: radius.md }]}>
              <Icons.UserCheck size={16} color={colors.primary} />
              <Text style={[styles.small, styles.flex, { color: colors.text }]}>Using your saved details</Text>
              <Tap onPress={clearDetails} accessibilityRole="button" accessibilityLabel="Clear my saved details" hitSlop={8}>
                <Text style={[styles.small, { color: colors.primary, fontWeight: '700' }]}>Not you? Clear</Text>
              </Tap>
            </View>
          )}
          <Field title="Your first name" value={name} onChange={setName} autoComplete="given-name" />
          <Field title="Phone" value={phone} onChange={setPhone} keyboardType="phone-pad" autoComplete="tel" hint="So we can reach you about this" />
          {onSite && <Field title="Address" value={address} onChange={setAddress} autoComplete="street-address" hint="Where the work is" />}
          {!!words.when && <Field title={words.when} value={when} onChange={setWhen} hint={words.whenHint} />}
          <Field title={words.details} value={details} onChange={setDetails} hint={words.detailsHint} multiline />
          <View style={styles.rememberRow}>
            <Text style={[styles.small, styles.flex, { color: colors.text }]}>Remember my details on this phone</Text>
            <Switch value={remember} onValueChange={setRemember} accessibilityLabel="Remember my details on this phone" trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <View style={styles.privacy}>
            <Icons.ShieldCheck size={16} color={colors.muted} />
            <Text style={[styles.small, styles.flex, { color: colors.muted }]}>We use your name and phone only for this {kind === 'order' ? 'order' : 'request'}. Payment is in person.</Text>
          </View>
          {!!problem && (
            <Animated.View style={shakeStyle}>
              <Text style={[styles.small, { color: colors.danger }]}>{problem}</Text>
            </Animated.View>
          )}
          <Tap
            onPress={send}
            disabled={!ready || sending}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || sending }}
            style={[styles.button, { backgroundColor: colors.primary, borderRadius: radius.md, opacity: !ready || sending ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.buttonText, { color: colors.onPrimary }]}>{words.send}{kind === 'order' && total ? ' · ' + total : ''}</Text>}
          </Tap>
          <Text style={[styles.small, { color: colors.muted }]}>Then follow it live: {stages.map((s) => s.label).join(' → ')}.</Text>
        </View>
        )}

        {past.length > 0 && (
          <>
            <Text style={[label, { color: colors.muted }]}>{words.mine}</Text>
            {past.map((x) => {
              const s = statusInfo(x.status);
              return (
                <View key={x.id} style={[card, styles.past]}>
                  {s.cancelled ? <Icons.CircleX size={20} color={colors.muted} /> : <Icons.CircleCheck size={20} color={colors.success} />}
                  <View style={styles.flex}>
                    <Text numberOfLines={2} style={[styles.body, { color: colors.text, fontWeight: '600' }]}>{x.items || x.service || x.details}</Text>
                    <Text style={[styles.small, { color: colors.muted }]}>{s.cancelled ? 'Cancelled' : (stages.find((st) => st.status === x.status) || { label: s.label }).label}{x.ref ? ' · #' + x.ref : ''}{x.createdAt ? ' · ' + new Date(x.createdAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) : ''}</Text>
                  </View>
                  {!!(x.items || x.service) && (
                    <Tap onPress={() => orderAgain(x)} accessibilityRole="button" accessibilityLabel={againWord + ': ' + (x.items || x.service)} style={[styles.again, { backgroundColor: colors.primarySoft, borderRadius: radius.pill }]}>
                      <Icons.RotateCcw size={16} color={colors.primary} />
                      <Text style={[styles.small, { color: colors.primary, fontWeight: '700' }]}>{againWord}</Text>
                    </Tap>
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 20, paddingBottom: 32, gap: 16 },
  title: { fontSize: 28, marginTop: 8 },
  sent: { padding: 20, gap: 8, alignItems: 'center' },
  sentTitle: { fontSize: 22 },
  form: { padding: 16, gap: 12 },
  field: { gap: 8 },
  input: { borderWidth: 1.5, minHeight: 48, paddingHorizontal: 12, fontSize: 15 },
  multi: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  totalLine: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  totalText: { fontSize: 20, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  stepButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  privacy: { flexDirection: 'row', gap: 8 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  button: { minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  buttonText: { fontSize: 17, fontWeight: '700' },
  cancel: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  past: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  again: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, minHeight: 40 },
  body: { fontSize: 15 },
  small: { fontSize: 13 },
});
`;
