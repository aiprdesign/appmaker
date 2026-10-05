import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, LayoutAnimation, AccessibilityInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { House, Plus, ChartBar, Wallet, Receipt, Utensils, TrainFront, ShoppingBag, Lightbulb, Clapperboard, Check } from 'lucide-react-native';
import { colors, radius, font, card, mode } from './src/theme';

// Category colors and emoji are content (chart series and tags), not UI colors.
const CATEGORIES = [
  { key: 'food', label: 'Food', emoji: '🍜', color: '#F59E0B', Icon: Utensils },
  { key: 'transport', label: 'Transport', emoji: '🚇', color: '#3B82F6', Icon: TrainFront },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#EC4899', Icon: ShoppingBag },
  { key: 'bills', label: 'Bills', emoji: '💡', color: '#8B5CF6', Icon: Lightbulb },
  { key: 'fun', label: 'Fun', emoji: '🎬', color: '#EF4444', Icon: Clapperboard },
];
const SEED = [
  { id: '1', title: 'Groceries', amount: 64.2, category: 'food', date: Date.now() - 86400000 },
  { id: '2', title: 'Metro card', amount: 30, category: 'transport', date: Date.now() - 2 * 86400000 },
  { id: '3', title: 'Electricity', amount: 82.5, category: 'bills', date: Date.now() - 3 * 86400000 },
  { id: '4', title: 'Cinema', amount: 18, category: 'fun', date: Date.now() - 4 * 86400000 },
];
const TABS = [
  { key: 'home', label: 'Home', Icon: House },
  { key: 'add', label: 'Add', Icon: Plus },
  { key: 'insights', label: 'Insights', Icon: ChartBar },
];
const catOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];
// Money in the phone's format, with thousands separators: $1,005.30.
const money = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pressed = ({ pressed: p }) => p && { opacity: 0.7 };

export default function App() {
  const [items, setItems] = useState(SEED);
  const [budget, setBudget] = useState(1200);
  const [tab, setTab] = useState('home');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');
  const [toast, setToast] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);
  const titleRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('budget.v1').then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      setItems(saved.items);
      setBudget(saved.budget);
    });
    try {
      Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
        .then((on) => setReduceMotion(!!on))
        .catch(() => {});
    } catch (e) {}
    return () => clearTimeout(toastTimer.current);
  }, []);

  const animate = () => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const persist = (nextItems, nextBudget = budget) => {
    setItems(nextItems);
    AsyncStorage.setItem('budget.v1', JSON.stringify({ items: nextItems, budget: nextBudget }));
  };

  const spent = items.reduce((s, i) => s + i.amount, 0);
  const left = budget - spent;
  const ratio = Math.min(spent / budget, 1);

  const canSave = !!title.trim() && !!parseFloat(amount);

  const add = () => {
    const value = parseFloat(amount);
    if (!title.trim() || !value) return;
    animate();
    persist([{ id: String(Date.now()), title: title.trim(), amount: value, category, date: Date.now() }, ...items]);
    setTitle('');
    setAmount('');
    setTab('home');
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch?.(() => {});
    } catch (e) {}
    setToast('Expense saved');
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2000);
  };

  const confirmDelete = (item) => {
    Alert.alert('Delete expense?', `"${item.title}" (${money(item.amount)}) will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          animate();
          persist(items.filter((x) => x.id !== item.id));
        },
      },
    ]);
  };

  const byCategory = CATEGORIES.map((c) => ({
    ...c,
    total: items.filter((i) => i.category === c.key).reduce((s, i) => s + i.amount, 0),
  })).sort((a, b) => b.total - a.total);

  return (
    <View style={styles.root}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {tab === 'home' && (
            <>
              <Text style={styles.kicker}>This month</Text>
              <Text style={styles.title} accessibilityRole="header">
                Wallet
              </Text>
              <View style={[card, styles.hero]}>
                <View style={styles.heroHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardLabel}>Left to spend</Text>
                    <Text style={styles.big}>{money(left)}</Text>
                    {left < 0 && <Text style={styles.over}>Over budget</Text>}
                  </View>
                  <View style={styles.heroIcon}>
                    <Wallet color={colors.onPrimary} size={48} strokeWidth={1.75} accessible={false} />
                  </View>
                </View>
                <View style={styles.track}>
                  <View style={styles.trackBg} />
                  <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
                </View>
                <Text style={styles.cardFoot}>
                  {money(spent)} of {money(budget)} budget
                </Text>
              </View>
              <Text style={styles.section} accessibilityRole="header">
                Recent
              </Text>
              {items.length === 0 && (
                <View style={styles.empty}>
                  <View style={styles.emptyCircle}>
                    <Receipt color={colors.primary} size={44} strokeWidth={1.75} accessible={false} />
                  </View>
                  <Text style={styles.emptyTitle}>No expenses yet</Text>
                  <Text style={styles.emptyText}>Log what you spend and see how much is left this month.</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add an expense"
                    onPress={() => setTab('add')}
                    style={(s) => [styles.button, styles.emptyButton, pressed(s)]}
                  >
                    <Plus color={colors.onPrimary} size={20} accessible={false} />
                    <Text style={styles.buttonText}>Add an expense</Text>
                  </Pressable>
                </View>
              )}
              {items.map((i) => {
                const c = catOf(i.category);
                return (
                  <Pressable
                    key={i.id}
                    onLongPress={() => confirmDelete(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`${i.title}, ${c.label}, ${money(i.amount)}`}
                    accessibilityHint="Long-press to delete"
                    accessibilityActions={[{ name: 'delete', label: 'Delete' }]}
                    onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && confirmDelete(i)}
                    style={(s) => [card, styles.row, pressed(s)]}
                  >
                    <View style={[styles.badge, { backgroundColor: c.color + '22' }]}>
                      <c.Icon color={c.color} size={28} strokeWidth={2} accessible={false} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{i.title}</Text>
                      <Text style={styles.rowMeta}>
                        {c.label} · {new Date(i.date).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.rowAmount}>-{money(i.amount)}</Text>
                  </Pressable>
                );
              })}
              {items.length > 0 && <Text style={styles.hint}>Long-press an expense to delete it</Text>}
            </>
          )}

          {tab === 'add' && (
            <>
              <Text style={styles.title} accessibilityRole="header">
                Add expense
              </Text>
              <Text style={styles.label}>Amount</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="$0.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                returnKeyType="next"
                autoCapitalize="none"
                autoComplete="off"
                autoFocus
                accessibilityLabel="Amount"
                onSubmitEditing={() => titleRef.current?.focus()}
                blurOnSubmit={false}
              />
              <Text style={styles.label}>Description</Text>
              <TextInput
                ref={titleRef}
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="What was it for?"
                placeholderTextColor={colors.muted}
                keyboardType="default"
                returnKeyType="done"
                autoCapitalize="sentences"
                autoComplete="off"
                accessibilityLabel="What was it for?"
                onSubmitEditing={add}
              />
              <Text style={[styles.label, { marginTop: 24 }]}>Category</Text>
              <View style={styles.chips}>
                {CATEGORIES.map((c) => {
                  const selected = category === c.key;
                  return (
                    <Pressable
                      key={c.key}
                      onPress={() => setCategory(c.key)}
                      accessibilityRole="button"
                      accessibilityLabel={c.label}
                      accessibilityState={{ selected }}
                      style={(s) => [styles.chip, selected && styles.chipActive, pressed(s)]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                        {c.emoji} {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                style={(s) => [styles.button, !canSave && styles.buttonDisabled, pressed(s)]}
                onPress={add}
                disabled={!canSave}
                accessibilityRole="button"
                accessibilityLabel="Save expense"
                accessibilityState={{ disabled: !canSave }}
              >
                <Check color={colors.onPrimary} size={20} strokeWidth={2.5} accessible={false} />
                <Text style={styles.buttonText}>Save expense</Text>
              </Pressable>
            </>
          )}

          {tab === 'insights' && (
            <>
              <Text style={styles.title} accessibilityRole="header">
                Insights
              </Text>
              <View style={[card, styles.summary]}>
                <View style={styles.summaryIcon}>
                  <ChartBar color={colors.primary} size={32} strokeWidth={2} accessible={false} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowMeta}>Spent this month</Text>
                  <Text style={styles.summaryValue}>{money(spent)}</Text>
                </View>
              </View>
              {byCategory.map((c) => (
                <View key={c.key} style={styles.barRow}>
                  <Text style={styles.barLabel}>
                    {c.emoji} {c.label}
                  </Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${spent ? (c.total / spent) * 100 : 0}%`, backgroundColor: c.color }]} />
                  </View>
                  <Text style={styles.barValue}>{money(c.total)}</Text>
                </View>
              ))}
              <Text style={styles.section} accessibilityRole="header">
                Monthly budget
              </Text>
              <View style={styles.chips}>
                {[800, 1200, 2000, 3000].map((b) => {
                  const selected = budget === b;
                  return (
                    <Pressable
                      key={b}
                      onPress={() => {
                        setBudget(b);
                        persist(items, b);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Set monthly budget to $${b}`}
                      accessibilityState={{ selected }}
                      style={(s) => [styles.chip, selected && styles.chipActive, pressed(s)]}
                    >
                      <Text style={[styles.chipText, styles.num, selected && styles.chipTextActive]}>${b}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
        {!!toast && (
          <View style={styles.toast} accessibilityLiveRegion="polite" pointerEvents="none">
            <Check color={colors.onPrimary} size={18} strokeWidth={2.5} accessible={false} />
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
        <View style={styles.tabBar}>
          {TABS.map(({ key, label, Icon }) => {
            const selected = tab === key;
            const tint = selected ? colors.primary : colors.muted;
            return (
              <Pressable
                key={key}
                style={(s) => [styles.tab, pressed(s)]}
                onPress={() => setTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={label}
              >
                <Icon color={tint} size={24} strokeWidth={selected ? 2.5 : 2} accessible={false} />
                <Text style={[styles.tabLabel, { color: tint }]} maxFontSizeMultiplier={1.4}>
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
  kicker: { color: colors.muted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 34, fontWeight: font.heading, color: colors.text, letterSpacing: -0.5, marginBottom: 16 },
  hero: { backgroundColor: colors.primary, padding: 24 },
  heroHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
  big: { color: colors.onPrimary, fontSize: 40, fontWeight: font.heading, marginVertical: 4, fontVariant: ['tabular-nums'] },
  over: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  track: { height: 8, borderRadius: radius.sm, marginTop: 12, overflow: 'hidden' },
  trackBg: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.onPrimary, opacity: 0.25 },
  fill: { height: 8, backgroundColor: colors.onPrimary, borderRadius: radius.sm },
  cardFoot: { color: colors.onPrimary, marginTop: 12, fontSize: 13, fontVariant: ['tabular-nums'] },
  section: { fontSize: 20, fontWeight: font.heading, color: colors.text, marginTop: 32, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 72, marginBottom: 8 },
  badge: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8 },
  empty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  emptyCircle: { width: 88, height: 88, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: font.heading, color: colors.text },
  emptyText: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 4, lineHeight: 20 },
  emptyButton: { alignSelf: 'stretch', marginTop: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.muted, marginBottom: 8 },
  amountInput: { fontSize: 48, fontWeight: font.heading, color: colors.text, marginBottom: 16, fontVariant: ['tabular-nums'] },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, fontSize: 17, borderWidth: 1, borderColor: colors.outline, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: colors.outline, backgroundColor: colors.surface, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderRadius: radius.pill },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  chipTextActive: { color: colors.onPrimary },
  num: { fontVariant: ['tabular-nums'] },
  button: { marginTop: 32, backgroundColor: colors.primary, minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onPrimary, fontWeight: font.heading, fontSize: 17 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, marginBottom: 24 },
  summaryIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontSize: 28, fontWeight: font.heading, color: colors.text, fontVariant: ['tabular-nums'] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  barLabel: { width: 110, color: colors.text, fontWeight: '600' },
  barTrack: { flex: 1, height: 10, backgroundColor: colors.border, borderRadius: radius.sm, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: radius.sm },
  barValue: { width: 76, textAlign: 'right', color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 100, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 16 },
  toastText: { color: colors.onPrimary, fontWeight: '600', fontSize: 15 },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 8, paddingBottom: 20 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
});
