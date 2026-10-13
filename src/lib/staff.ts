/** Statuses that mean finished (same as DONE_STATUS in app-data.ts, which imports this file). */
const DONE_STATUS = /^(done|complete|completed|collected|delivered|closed|picked ?up|served|finished|archived|cancel+ed|declined|rejected)$/i;

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
  const done = DONE_STATUS.toString();
  return `// Staff mode: written by Appmaker — don't change this file.
// Screens show it with: <StaffScreen onClose={() => …} />
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ArrowRight, Bell, ChevronDown, ChevronLeft, Inbox, KeyRound, LogOut, Phone, Plus, Trash2 } from 'lucide-react-native';
import { colors, radius, font, card } from './theme';

const API = ${JSON.stringify(apiUrl)};
const KEY = 'appdata:staff-key';
const DONE = ${done};
const label = (f) => String(f).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const show = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const isPhone = (f) => /phone|tel|mobile|whatsapp/i.test(f);
const STOPPED = /^(cancel|declin|reject)/i;
const isDone = (status, statuses) => {
  const steps = statuses.filter((x) => !STOPPED.test(x));
  return DONE.test(String(status || '')) || STOPPED.test(String(status || '')) || status === steps[steps.length - 1];
};
/** "Just now", "4 min ago", "2 h ago", then the day and time. */
function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return min + ' min ago';
  if (min < 12 * 60) return Math.round(min / 60) + ' h ago';
  return new Date(ms).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

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
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain !== false) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return perm.canAskAgain === false ? 'blocked' : 'off';
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await owner('POST', { action: 'alerts-expo', token }, key);
    await AsyncStorage.setItem('appdata:staff-token', token);
    return 'on';
  } catch (e) {
    return 'off';
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

/** One order or request: who, what, how long ago, and one big button for the next step. */
function Order({ collection, item, busy, act, fresh }) {
  const statuses = collection.statuses;
  const at = Math.max(0, statuses.indexOf(item.status));
  const finished = isDone(item.status, statuses);
  const next = finished ? null : statuses.slice(at + 1).find((x) => !/^(cancel|declin|reject)/i.test(x));
  const [more, setMore] = useState(false);
  const fields = collection.fields.filter((f) => show(item[f]));
  return (
    <View style={[card, styles.box, item.status === statuses[0] && styles.boxNew, finished && styles.boxDone]}>
      <View style={styles.row}>
        <Text style={[styles.itemTitle, { flex: 1 }]}>{fields.length ? show(item[fields[0]]) : label(collection.name)}</Text>
        {item.status === statuses[0] ? <Text style={styles.badge}>{fresh ? 'NEW' : 'Waiting'}</Text> : <Text style={styles.small}>{label(item.status)}</Text>}
      </View>
      <View style={{ gap: 2 }}>
      {fields.slice(1).map((f) =>
        isPhone(f) ? (
          <Pressable key={f} hitSlop={8} onPress={() => Linking.openURL('tel:' + show(item[f]).replace(/[^0-9+]/g, '')).catch(() => {})} accessibilityRole="link" accessibilityLabel={'Call ' + show(item[f])} style={({ pressed }) => [styles.phone, pressed && styles.pressed]}>
            <Phone size={16} color={colors.primary} accessible={false} />
            <Text style={styles.phoneText}>{show(item[f])}</Text>
          </Pressable>
        ) : (
          <Text key={f} style={styles.detail}><Text style={styles.detailLabel}>{label(f)}: </Text>{show(item[f])}</Text>
        ),
      )}
      <Text style={styles.small}>{item.ref ? '#' + item.ref + ' · ' : ''}{ago(item.createdAt)}</Text>
      </View>
      {next ? (
        <Pressable disabled={busy} onPress={() => act({ action: 'status', collection: collection.name, id: item.id, status: next })} accessibilityRole="button" style={({ pressed }) => [styles.primary, styles.nextButton, busy && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>Mark as {label(next).toLowerCase()}</Text>
          <ArrowRight size={18} color={colors.onPrimary} accessible={false} />
        </Pressable>
      ) : null}
      <Pressable onPress={() => setMore(!more)} accessibilityRole="button" accessibilityState={{ expanded: more }} style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}>
        <Text style={styles.moreText}>Other status</Text>
        <ChevronDown size={16} color={colors.muted} style={more ? { transform: [{ rotate: '180deg' }] } : null} accessible={false} />
      </Pressable>
      {more ? (
        <View style={styles.statuses}>
          {statuses.map((x) => (
            <Pressable key={x} disabled={busy || x === item.status} onPress={() => act({ action: 'status', collection: collection.name, id: item.id, status: x })} accessibilityRole="button" accessibilityState={{ selected: item.status === x }} style={({ pressed }) => [styles.status, item.status === x && styles.statusOn, pressed && styles.pressed]}>
              <Text style={[styles.statusText, item.status === x && styles.statusTextOn]}>{label(x)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Staff mode: orders and requests waiting on staff first (oldest first), then what the app shows. */
export default function StaffScreen({ onClose }) {
  const [key, setKey] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('');
  const [editing, setEditing] = useState(null);
  const [alerts, setAlerts] = useState('off');
  const [showDone, setShowDone] = useState(false);
  const [fresh, setFresh] = useState({});
  const seen = React.useRef(null);
  const lastSig = React.useRef('');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((k) => setKey(k || ''));
  }, []);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const v = await owner('GET', null, key);
      // New orders while this screen is open: a buzz, and they're marked NEW.
      const ids = v.collections.filter((c) => c.access === 'inbox').flatMap((c) => c.items.map((i) => i.id));
      if (seen.current) {
        const added = ids.filter((i) => !seen.current.has(i));
        if (added.length) {
          Vibration.vibrate([0, 250, 120, 250]);
          setFresh((f) => ({ ...f, ...Object.fromEntries(added.map((i) => [i, true])) }));
        }
      }
      seen.current = new Set(ids);
      const order = { inbox: 0, shared: 1, public: 2, private: 3 };
      v.collections = v.collections.filter((c) => c.access !== 'private').sort((a, b) => order[a.access] - order[b.access]);
      setView(v);
      setTab((t) => t || (v.collections[0] || {}).name || '');
      setError('');
      // Whether anything changed since the last look (so checking can slow down when it's quiet).
      const sig = v.collections.map((c) => c.items.map((i) => i.id + ':' + (i.status || '') + ':' + i.updatedAt).join(',')).join('|');
      const changed = sig !== lastSig.current;
      lastSig.current = sig;
      return changed;
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
    // Checking only when needed: at once when an order alert arrives or the app comes back; otherwise
    // from every 20 seconds (2 minutes when alerts are on, since they bring the news), slowing down each
    // time nothing changed, up to 2 minutes (10 with alerts). Nothing in the background.
    let t = null;
    let quiet = 0;
    let alertsOn = false;
    const delay = () => Math.min((alertsOn ? 120000 : 20000) * Math.pow(2, quiet), alertsOn ? 600000 : 120000);
    const schedule = () => {
      clearTimeout(t);
      if (AppState.currentState === 'background') return;
      t = setTimeout(async () => {
        quiet = (await load()) ? 0 : quiet + 1;
        schedule();
      }, delay());
    };
    const now = async () => {
      quiet = 0;
      await load();
      schedule();
    };
    now();
    registerAlerts(key).then((state) => {
      setAlerts(state);
      alertsOn = state === 'on';
      schedule();
    });
    const subs = [];
    try {
      const onPush = (n) => {
        const data = n && n.request && n.request.content && n.request.content.data;
        // (The refresh buzzes for the new order itself.)
        if (data && data.appmaker === 'owner') now();
      };
      subs.push(Notifications.addNotificationReceivedListener(onPush));
    } catch (e) {}
    subs.push(
      AppState.addEventListener('change', (state) => {
        clearTimeout(t);
        if (state === 'active') now();
      }),
    );
    return () => {
      clearTimeout(t);
      subs.forEach((x) => x && x.remove && x.remove());
    };
  }, [key, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const act = async (body) => {
    setBusy(true);
    try {
      const v = await owner('POST', body, key);
      const order = { inbox: 0, shared: 1, public: 2, private: 3 };
      v.collections = v.collections.filter((c) => c.access !== 'private').sort((a, b) => order[a.access] - order[b.access]);
      setView(v);
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
          <Text style={styles.h2}>Staff mode isn't available yet</Text>
          <Text style={styles.muted}>Online orders and requests aren't switched on for this app yet. Once they are, staff sign in here with the staff PIN to manage them.</Text>
        </View>
      </ScrollView>
    );
  }
  if (key === null) return <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} />;
  if (!key) return <SignIn onKey={setKey} onClose={onClose} />;

  const current = view && (view.collections.find((c) => c.name === tab) || view.collections[0]);
  const inbox = current && current.access === 'inbox';
  const active = inbox ? current.items.filter((i) => !isDone(i.status, current.statuses)).sort((a, b) => a.createdAt - b.createdAt) : [];
  const finished = inbox ? current.items.filter((i) => isDone(i.status, current.statuses)) : [];
  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />} keyboardShouldPersistTaps="handled">
      <Header
        title="Staff"
        onClose={onClose}
        right={
          <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="Sign out of staff mode" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <LogOut size={20} color={colors.muted} accessible={false} />
          </Pressable>
        }
      />
      {alerts === 'on' ? (
        <View style={styles.note}>
          <Bell size={16} color={colors.primary} accessible={false} />
          <Text style={styles.noteText}>Alerts are on: this phone hears about every new order.</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => (alerts === 'blocked' ? Linking.openSettings().catch(() => {}) : registerAlerts(key).then(setAlerts))}
          accessibilityRole="button"
          style={({ pressed }) => [styles.alertButton, pressed && styles.pressed]}
        >
          <Bell size={18} color={colors.primary} accessible={false} />
          <Text style={styles.alertText}>{alerts === 'blocked' ? 'Notifications are off for this app. Open Settings to allow them' : 'Turn on alerts for new orders'}</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      {!view ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityRole="tablist">
            {view.collections.map((c) => {
              const selected = current && c.name === current.name;
              const waiting = c.statuses ? c.items.filter((i) => i.status === c.statuses[0]).length : 0;
              return (
                <Pressable key={c.name} onPress={() => setTab(c.name)} accessibilityRole="tab" accessibilityState={{ selected }} style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}>
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label(c.name)}{waiting ? ' · ' + waiting + ' waiting' : ''}</Text>
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
          ) : inbox ? (
            <View style={{ gap: 12 }}>
              {active.length === 0 ? (
                <View style={styles.empty}>
                  <View style={styles.iconTile}><Inbox size={24} color={colors.primary} accessible={false} /></View>
                  <Text style={styles.h2}>All caught up</Text>
                  <Text style={styles.muted}>New {label(current.name).toLowerCase()} appear here{alerts === 'on' ? ', and this phone buzzes' : ''}.</Text>
                </View>
              ) : (
                active.map((item) => <Order key={item.id} collection={current} item={item} busy={busy} act={act} fresh={fresh[item.id]} />)
              )}
              {finished.length ? (
                <Pressable onPress={() => setShowDone(!showDone)} accessibilityRole="button" accessibilityState={{ expanded: showDone }} style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}>
                  <Text style={styles.moreText}>Done ({finished.length})</Text>
                  <ChevronDown size={16} color={colors.muted} style={showDone ? { transform: [{ rotate: '180deg' }] } : null} accessible={false} />
                </Pressable>
              ) : null}
              {showDone ? finished.map((item) => <Order key={item.id} collection={current} item={item} busy={busy} act={act} />) : null}
            </View>
          ) : current ? (
            <View style={{ gap: 12 }}>
              {current.access === 'public' ? (
                <Pressable onPress={() => setEditing({ collection: current, item: null })} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Plus size={18} color={colors.text} accessible={false} />
                  <Text style={styles.secondaryText}>Add to {label(current.name).toLowerCase()}</Text>
                </Pressable>
              ) : null}
              {current.items.length === 0 ? <Text style={styles.muted}>Nothing here yet.</Text> : null}
              {current.items.map((item) => (
                <View key={item.id} style={[card, styles.box]}>
                  <Pressable disabled={current.access !== 'public'} onPress={() => setEditing({ collection: current, item })} accessibilityRole={current.access === 'public' ? 'button' : undefined} accessibilityHint={current.access === 'public' ? 'Edit' : undefined}>
                    {current.fields.filter((f) => show(item[f])).map((f, i) => (
                      <Text key={f} style={i === 0 ? styles.itemTitle : styles.detail}>{i ? label(f) + ': ' : ''}{show(item[f])}</Text>
                    ))}
                    <Text style={styles.small}>{ago(item.createdAt)}{current.access === 'public' ? ' · Tap to edit' : ''}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Alert.alert('Delete this?', "It's removed from the app for everyone.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => act({ action: 'delete', collection: current.name, id: item.id }) }])}
                    accessibilityRole="button"
                    accessibilityLabel="Delete"
                    style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
                  >
                    <Trash2 size={18} color={colors.muted} accessible={false} />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  boxNew: { borderLeftWidth: 4, borderLeftColor: colors.primary },
  boxDone: { opacity: 0.7 },
  badge: { fontSize: 12, fontWeight: '700', color: colors.onPrimary, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  detail: { fontSize: 15, color: colors.text },
  detailLabel: { color: colors.muted },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, alignSelf: 'flex-start' },
  phoneText: { fontSize: 15, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
  nextButton: { flexDirection: 'row', gap: 8 },
  moreToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  moreText: { fontSize: 15, color: colors.muted, fontWeight: '600' },
  alertButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  alertText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
});
`;
}

export const STAFF_PROMPT = `Staff mode: every app with app data also gets src/staff.js from Appmaker (never write, change or delete it). Add a "Staff" row at the bottom of the Settings or More screen (a KeyRound icon, muted, so customers aren't drawn to it) that opens it as a full screen: \`import StaffScreen from '../staff';\` (relative path) and \`<StaffScreen onClose={() => …} />\`. It handles the PIN, new orders and requests, status changes, editing public items and alerts by itself, so don't build any of that.`;
