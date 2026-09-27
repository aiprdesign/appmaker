import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCENT = '#047857';
const CATEGORIES = [
  { key: 'food', label: 'Food', emoji: '🍜', color: '#F59E0B' },
  { key: 'transport', label: 'Transport', emoji: '🚇', color: '#3B82F6' },
  { key: 'shopping', label: 'Shopping', emoji: '🛍️', color: '#EC4899' },
  { key: 'bills', label: 'Bills', emoji: '💡', color: '#8B5CF6' },
  { key: 'fun', label: 'Fun', emoji: '🎬', color: '#EF4444' },
];
const SEED = [
  { id: '1', title: 'Groceries', amount: 64.2, category: 'food', date: Date.now() - 86400000 },
  { id: '2', title: 'Metro card', amount: 30, category: 'transport', date: Date.now() - 2 * 86400000 },
  { id: '3', title: 'Electricity', amount: 82.5, category: 'bills', date: Date.now() - 3 * 86400000 },
  { id: '4', title: 'Cinema', amount: 18, category: 'fun', date: Date.now() - 4 * 86400000 },
];
const catOf = (key) => CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];
const money = (n) => '$' + n.toFixed(2);

export default function App() {
  const [items, setItems] = useState(SEED);
  const [budget, setBudget] = useState(1200);
  const [tab, setTab] = useState('home');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('food');

  useEffect(() => {
    AsyncStorage.getItem('budget.v1').then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw);
      setItems(saved.items);
      setBudget(saved.budget);
    });
  }, []);

  const persist = (nextItems, nextBudget = budget) => {
    setItems(nextItems);
    AsyncStorage.setItem('budget.v1', JSON.stringify({ items: nextItems, budget: nextBudget }));
  };

  const spent = items.reduce((s, i) => s + i.amount, 0);
  const left = budget - spent;
  const ratio = Math.min(spent / budget, 1);

  const add = () => {
    const value = parseFloat(amount);
    if (!title.trim() || !value) return;
    persist([{ id: String(Date.now()), title: title.trim(), amount: value, category, date: Date.now() }, ...items]);
    setTitle('');
    setAmount('');
    setTab('home');
  };

  const byCategory = CATEGORIES.map((c) => ({
    ...c,
    total: items.filter((i) => i.category === c.key).reduce((s, i) => s + i.amount, 0),
  })).sort((a, b) => b.total - a.total);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'home' && (
            <>
              <Text style={styles.kicker}>This month</Text>
              <Text style={styles.title}>Wallet</Text>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Left to spend</Text>
                <Text style={[styles.big, left < 0 && { color: '#FCA5A5' }]}>{money(left)}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
                </View>
                <Text style={styles.cardFoot}>
                  {money(spent)} of {money(budget)} budget
                </Text>
              </View>
              <Text style={styles.section}>Recent</Text>
              {items.map((i) => {
                const c = catOf(i.category);
                return (
                  <TouchableOpacity key={i.id} onLongPress={() => persist(items.filter((x) => x.id !== i.id))} style={styles.row}>
                    <View style={[styles.badge, { backgroundColor: c.color + '22' }]}>
                      <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{i.title}</Text>
                      <Text style={styles.rowMeta}>
                        {c.label} · {new Date(i.date).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.rowAmount}>-{money(i.amount)}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {tab === 'add' && (
            <>
              <Text style={styles.title}>Add expense</Text>
              <TextInput style={styles.amountInput} value={amount} onChangeText={setAmount} placeholder="$0.00" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />
              <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What was it for?" placeholderTextColor="#94A3B8" />
              <View style={styles.chips}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c.key} onPress={() => setCategory(c.key)} style={[styles.chip, category === c.key && { backgroundColor: c.color, borderColor: c.color }]}>
                    <Text style={[styles.chipText, category === c.key && { color: '#fff' }]}>
                      {c.emoji} {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.button} onPress={add}>
                <Text style={styles.buttonText}>Save expense</Text>
              </TouchableOpacity>
            </>
          )}

          {tab === 'insights' && (
            <>
              <Text style={styles.title}>Insights</Text>
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
              <Text style={styles.section}>Monthly budget</Text>
              <View style={styles.chips}>
                {[800, 1200, 2000, 3000].map((b) => (
                  <TouchableOpacity key={b} onPress={() => { setBudget(b); persist(items, b); }} style={[styles.chip, budget === b && { backgroundColor: ACCENT, borderColor: ACCENT }]}>
                    <Text style={[styles.chipText, budget === b && { color: '#fff' }]}>${b}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
        <View style={styles.tabBar}>
          {[['home', '🏠', 'Home'], ['add', '➕', 'Add'], ['insights', '📈', 'Insights']].map(([k, icon, label]) => (
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
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 40 },
  kicker: { color: '#64748B', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  title: { fontSize: 34, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  card: { backgroundColor: '#0F172A', borderRadius: 24, padding: 22 },
  cardLabel: { color: '#94A3B8', fontSize: 14 },
  big: { color: '#fff', fontSize: 40, fontWeight: '800', marginVertical: 6 },
  track: { height: 8, backgroundColor: '#1E293B', borderRadius: 4, marginTop: 8 },
  fill: { height: 8, backgroundColor: ACCENT, borderRadius: 4 },
  cardFoot: { color: '#94A3B8', marginTop: 10, fontSize: 13 },
  section: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 14, borderRadius: 18, marginBottom: 8 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
  rowMeta: { fontSize: 13, color: '#64748B', marginTop: 2 },
  rowAmount: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  amountInput: { fontSize: 48, fontWeight: '800', color: '#0F172A', marginBottom: 16 },
  input: { backgroundColor: '#fff', borderRadius: 16, padding: 16, fontSize: 17, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  chipText: { color: '#0F172A', fontWeight: '600' },
  button: { marginTop: 28, backgroundColor: ACCENT, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  barLabel: { width: 110, color: '#0F172A', fontWeight: '600' },
  barTrack: { flex: 1, height: 10, backgroundColor: '#E2E8F0', borderRadius: 5 },
  barFill: { height: 10, borderRadius: 5 },
  barValue: { width: 72, textAlign: 'right', color: '#0F172A', fontWeight: '700' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E2E8F0', paddingTop: 8, paddingBottom: 20 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
});
