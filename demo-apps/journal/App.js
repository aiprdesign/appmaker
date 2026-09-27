import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_NAME = '__APP_NAME__';
const ACCENT = '#2563EB';
const MOODS = ['😄', '🙂', '😐', '😔', '😤'];
const SEED = [
  { id: '1', text: 'Kicked off the project today. Feeling excited about where this is going.', mood: '😄', pinned: true, date: Date.now() - 3600000 },
  { id: '2', text: 'Ideas: invite friends, weekly recap, dark mode.', mood: '🙂', pinned: false, date: Date.now() - 86400000 },
];

export default function App() {
  const [entries, setEntries] = useState(SEED);
  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState(MOODS[1]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('feed');

  useEffect(() => {
    AsyncStorage.getItem('entries.v1').then((raw) => raw && setEntries(JSON.parse(raw)));
  }, []);

  const save = (next) => {
    setEntries(next);
    AsyncStorage.setItem('entries.v1', JSON.stringify(next));
  };

  const add = () => {
    if (!draft.trim()) return;
    save([{ id: String(Date.now()), text: draft.trim(), mood, pinned: false, date: Date.now() }, ...entries]);
    setDraft('');
    setTab('feed');
  };

  const togglePin = (id) => save(entries.map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e)));
  const remove = (id) => save(entries.filter((e) => e.id !== id));

  const visible = entries
    .filter((e) => e.text.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date - a.date);

  return (
    <View style={styles.root}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          {tab === 'feed' ? (
            <>
              <Text style={styles.title}>{APP_NAME}</Text>
              <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="🔍  Search" placeholderTextColor="#94A3B8" />
              {visible.length === 0 && <Text style={styles.empty}>Nothing here yet.</Text>}
              {visible.map((e) => (
                <TouchableOpacity key={e.id} style={styles.card} onPress={() => togglePin(e.id)} onLongPress={() => remove(e.id)}>
                  <View style={styles.cardHead}>
                    <Text style={{ fontSize: 22 }}>{e.mood}</Text>
                    <Text style={styles.date}>{new Date(e.date).toLocaleString()}</Text>
                    {e.pinned && <Text style={styles.pin}>📌</Text>}
                  </View>
                  <Text style={styles.body}>{e.text}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.hint}>Tap to pin · long-press to delete</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>New entry</Text>
              <View style={styles.moods}>
                {MOODS.map((m) => (
                  <TouchableOpacity key={m} onPress={() => setMood(m)} style={[styles.mood, mood === m && styles.moodActive]}>
                    <Text style={{ fontSize: 28 }}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.editor} value={draft} onChangeText={setDraft} placeholder="What's on your mind?" placeholderTextColor="#94A3B8" multiline />
              <TouchableOpacity style={styles.button} onPress={add}>
                <Text style={styles.buttonText}>Save</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        <View style={styles.tabBar}>
          {[['feed', '🗂️', 'Entries'], ['new', '✏️', 'Write']].map(([k, icon, label]) => (
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
  root: { flex: 1, backgroundColor: '#F5F7FB' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 34, fontWeight: '800', color: '#0B1220', marginBottom: 14 },
  search: { backgroundColor: '#fff', borderRadius: 14, padding: 12, fontSize: 16, marginBottom: 16, color: '#0B1220' },
  empty: { color: '#64748B', textAlign: 'center', marginTop: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  date: { flex: 1, color: '#64748B', fontSize: 12 },
  pin: { fontSize: 14 },
  body: { fontSize: 16, lineHeight: 22, color: '#0B1220' },
  hint: { color: '#94A3B8', textAlign: 'center', fontSize: 12, marginTop: 8 },
  moods: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  mood: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  moodActive: { borderColor: ACCENT, backgroundColor: '#EAF1FF' },
  editor: { backgroundColor: '#fff', borderRadius: 18, padding: 16, minHeight: 180, fontSize: 17, textAlignVertical: 'top', color: '#0B1220' },
  button: { marginTop: 20, backgroundColor: ACCENT, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 17 },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E2E8F0', paddingTop: 8, paddingBottom: 20 },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
});
