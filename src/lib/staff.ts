/**
 * Staff mode: src/staff.js, a screen Appmaker adds to every app with app data
 * (see src/lib/app-data.ts). Staff enter the PIN the business set on its owner
 * page; the phone then gets the owner key, shows new orders and requests with
 * buttons to move them on, lets staff edit what the app shows (the menu,
 * offers) and gets a push alert for every new order.
 */

export const STAFF_FILE = "src/staff.js";

/** apiUrl is the app data address (…/api/appdata/{id}), or null while the data stays on the phone. */
export function staffModule(apiUrl: string | null): string {
  return `// Staff mode: written by Appmaker — don't change this file.
// Screens show it with: <StaffScreen onClose={() => …} />
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Bell, ChevronLeft, KeyRound, LogOut, Plus, Trash2 } from 'lucide-react-native';
import { colors, radius, font, card } from './theme';

const API = ${JSON.stringify(apiUrl)};
const KEY = 'appdata:staff-key';
const label = (f) => String(f).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const show = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const when = (ms) => new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

async function owner(method, body, key) {
  const res = await fetch(API + '/owner', {
    method,
    headers: { 'content-type': 'application/json', 'x-owner-key': key },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Couldn't reach the server. Check your connection.");
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Push alerts for new orders on this phone (asked once, when staff sign in). */
async function registerAlerts(key) {
  try {
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await owner('POST', { action: 'alerts-expo', token }, key);
    await AsyncStorage.setItem('appdata:staff-token', token);
    return true;
  } catch (e) {
    return false;
  }
}

function Header({ title, onClose, right }) {
  return (
    <View style={styles.header}>
      {onClose ? (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <ChevronLeft size={22} color={colors.text} accessible={false} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      ) : null}
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {right}
    </View>
  );
}

function SignIn({ onKey, onClose }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(API + '/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That PIN isn\\'t right.');
      await AsyncStorage.setItem(KEY, data.ownerKey);
      onKey(data.ownerKey);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Header title="Staff" onClose={onClose} />
      <View style={[card, styles.box]}>
        <View style={styles.iconTile}><KeyRound size={24} color={colors.primary} accessible={false} /></View>
        <Text style={styles.h2}>Staff sign in</Text>
        <Text style={styles.muted}>Enter the staff PIN from the owner page to see new orders and requests, update them and get alerts on this phone.</Text>
        <TextInput
          value={pin}
          onChangeText={(t) => setPin(t.replace(/[^0-9]/g, '').slice(0, 8))}
          keyboardType="number-pad"
          secureTextEntry
          placeholder="Staff PIN"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Staff PIN"
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Pressable onPress={submit} disabled={busy || pin.length < 6} accessibilityRole="button" style={({ pressed }) => [styles.primary, (busy || pin.length < 6) && styles.disabled, pressed && styles.pressed]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryText}>Sign in</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Editor({ collection, item, onDone }) {
  const [data, setData] = useState(() => Object.fromEntries(collection.fields.map((f) => [f, item ? show(item[f]) : ''])));
  return (
    <View style={[card, styles.box]}>
      <Text style={styles.h2}>{item ? 'Edit' : 'Add to'} {label(collection.name)}</Text>
      {collection.fields.map((f) => (
        <View key={f} style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>{label(f)}</Text>
          <TextInput value={data[f]} onChangeText={(t) => setData({ ...data, [f]: t })} style={styles.input} accessibilityLabel={label(f)} placeholderTextColor={colors.muted} />
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => onDone(Object.fromEntries(Object.entries(data).filter(([, v]) => v.trim() !== '')))} accessibilityRole="button" style={({ pressed }) => [styles.primary, { flex: 1 }, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Save</Text>
        </Pressable>
        <Pressable onPress={() => onDone(null)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, { flex: 1 }, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Staff mode: new orders and requests first, then what the app shows. */
export default function StaffScreen({ onClose }) {
  const [key, setKey] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('');
  const [editing, setEditing] = useState(null);
  const [alerts, setAlerts] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((k) => setKey(k || ''));
  }, []);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const v = await owner('GET', null, key);
      setView(v);
      setTab((t) => t || (v.collections.find((c) => c.access === 'inbox') || v.collections[0] || {}).name || '');
      setError('');
    } catch (e) {
      if (e.status === 404) {
        // The owner link was replaced or staff mode closed: sign in again.
        await AsyncStorage.removeItem(KEY);
        setKey('');
      }
      setError(e.message);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    load();
    registerAlerts(key).then(setAlerts);
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [key, load]);

  const act = async (body) => {
    setBusy(true);
    try {
      setView({ ...(await owner('POST', body, key)), vapidKey: view && view.vapidKey });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const token = await AsyncStorage.getItem('appdata:staff-token');
    if (token) owner('POST', { action: 'alerts-off', token }, key).catch(() => {});
    await AsyncStorage.multiRemove([KEY, 'appdata:staff-token']);
    setKey('');
    setView(null);
  };

  if (!API) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Header title="Staff" onClose={onClose} />
        <View style={[card, styles.box]}>
          <Text style={styles.h2}>Staff mode isn't on yet</Text>
          <Text style={styles.muted}>Turn on the app database in Appmaker (Publish), then set a staff PIN on the owner page. Staff can then manage orders and requests here.</Text>
        </View>
      </ScrollView>
    );
  }
  if (key === null) return <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />;
  if (!key) return <SignIn onKey={setKey} onClose={onClose} />;

  const current = view && (view.collections.find((c) => c.name === tab) || view.collections[0]);
  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />} keyboardShouldPersistTaps="handled">
      <Header
        title="Staff"
        onClose={onClose}
        right={
          <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out of staff mode" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <LogOut size={20} color={colors.muted} accessible={false} />
          </Pressable>
        }
      />
      <View style={styles.note}>
        <Bell size={16} color={alerts ? colors.primary : colors.muted} accessible={false} />
        <Text style={styles.noteText}>{alerts ? 'Alerts are on: this phone hears about every new order.' : 'Allow notifications to hear about new orders.'}</Text>
      </View>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      {!view ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
            {view.collections.filter((c) => c.access !== 'private').map((c) => {
              const selected = current && c.name === current.name;
              const waiting = c.statuses ? c.items.filter((i) => i.status === c.statuses[0]).length : 0;
              return (
                <Pressable key={c.name} onPress={() => setTab(c.name)} accessibilityRole="tab" accessibilityState={{ selected }} style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label(c.name)}{waiting ? ' · ' + waiting + ' new' : ''}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {editing ? (
            <Editor
              collection={editing.collection}
              item={editing.item}
              onDone={(data) => {
                const e = editing;
                setEditing(null);
                if (data) act(e.item ? { action: 'update', collection: e.collection.name, id: e.item.id, data } : { action: 'add', collection: e.collection.name, data });
              }}
            />
          ) : current ? (
            <View style={{ gap: 12 }}>
              {current.access === 'public' ? (
                <Pressable onPress={() => setEditing({ collection: current, item: null })} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Plus size={18} color={colors.text} accessible={false} />
                  <Text style={styles.secondaryText}>Add to {label(current.name)}</Text>
                </Pressable>
              ) : null}
              {current.items.length === 0 ? <Text style={styles.muted}>Nothing here yet.</Text> : null}
              {current.items.map((item) => (
                <View key={item.id} style={[card, styles.box]}>
                  <Pressable disabled={current.access !== 'public'} onPress={() => setEditing({ collection: current, item })} accessibilityRole={current.access === 'public' ? 'button' : undefined} accessibilityHint={current.access === 'public' ? 'Edit' : undefined}>
                    {current.fields.filter((f) => show(item[f])).map((f, i) => (
                      <Text key={f} style={i === 0 ? styles.itemTitle : styles.muted}>{i ? label(f) + ': ' : ''}{show(item[f])}</Text>
                    ))}
                    <Text style={styles.small}>{item.ref ? '#' + item.ref + ' · ' : ''}{when(item.createdAt)}</Text>
                  </Pressable>
                  {current.statuses ? (
                    <View style={styles.statuses}>
                      {current.statuses.map((s) => (
                        <Pressable key={s} disabled={busy} onPress={() => act({ action: 'status', collection: current.name, id: item.id, status: s })} accessibilityRole="button" accessibilityState={{ selected: item.status === s }} accessibilityLabel={'Mark as ' + s} style={({ pressed }) => [styles.status, item.status === s && styles.statusOn, pressed && styles.pressed]}>
                          <Text style={[styles.statusText, item.status === s && styles.statusTextOn]}>{label(s)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => Alert.alert('Delete this?', "It's removed from the app for everyone.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => act({ action: 'delete', collection: current.name, id: item.id }) }])}
                    accessibilityRole="button"
                    accessibilityLabel="Delete"
                    style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
                  >
                    <Trash2 size={18} color={colors.danger} accessible={false} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 120, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingRight: 8 },
  backText: { fontSize: 17, color: colors.text },
  title: { flex: 1, fontSize: 28, fontWeight: font.heading, color: colors.text, letterSpacing: -0.5 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { padding: 16, gap: 12 },
  iconTile: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  h2: { fontSize: 20, fontWeight: font.heading, color: colors.text },
  muted: { fontSize: 15, color: colors.muted },
  small: { fontSize: 13, color: colors.muted, marginTop: 4 },
  itemTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  fieldLabel: { fontSize: 13, color: colors.muted },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.outline, borderRadius: radius.md, paddingHorizontal: 12, fontSize: 17, color: colors.text, backgroundColor: colors.surface },
  error: { fontSize: 15, color: colors.danger },
  primary: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 17, fontWeight: font.heading, color: colors.onPrimary },
  secondary: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '600', color: colors.text },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noteText: { flex: 1, fontSize: 13, color: colors.muted },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.text },
  chipTextOn: { color: colors.onPrimary },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  status: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.outline, justifyContent: 'center' },
  statusOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusText: { fontSize: 15, color: colors.text },
  statusTextOn: { color: colors.onPrimary, fontWeight: '600' },
  delete: { position: 'absolute', top: 8, right: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
`;
}

export const STAFF_PROMPT = `Staff mode: every app with app data also gets src/staff.js from Appmaker (never write, change or delete it). Add a "Staff" row at the bottom of the Settings or More screen (a KeyRound icon, muted, so customers aren't drawn to it) that opens it as a full screen: \`import StaffScreen from '../staff';\` (relative path) and \`<StaffScreen onClose={() => …} />\`. It handles the PIN, new orders and requests, status changes, editing public items and alerts by itself, so don't build any of that.`;
