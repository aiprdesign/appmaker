import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Bell } from 'lucide-react-native';
import { colors, radius, font, card } from '../theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const KEY = 'reminder.v1';
const TIMES = [
  { hour: 8, label: '8:00 AM' },
  { hour: 12, label: '12:00 PM' },
  { hour: 20, label: '8:00 PM' },
];

export default function ReminderCard() {
  const [reminder, setReminder] = useState({ enabled: false, hour: 20, id: null });
  const [message, setMessage] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => raw && setReminder(JSON.parse(raw)));
  }, []);

  const apply = async (enabled, hour) => {
    if (reminder.id) await Notifications.cancelScheduledNotificationAsync(reminder.id);
    let id = null;
    if (enabled) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        setMessage('Turn on notifications in Settings to get reminders.');
        enabled = false;
      } else {
        id = await Notifications.scheduleNotificationAsync({
          content: { title: 'Time to check in ✅', body: 'Keep your streaks alive — tick off today’s habits.' },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
        });
        setMessage('');
      }
    }
    const next = { enabled, hour, id };
    setReminder(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next));
  };

  return (
    <View style={[card, styles.card]}>
      <View style={styles.header}>
        <View style={styles.iconBox} accessible={false}>
          <Bell size={24} color={colors.primary} accessible={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Daily reminder</Text>
          <Text style={styles.sub}>{reminder.enabled ? `Every day at ${TIMES.find((t) => t.hour === reminder.hour)?.label}` : 'Off'}</Text>
        </View>
        <Pressable
          onPress={() => apply(!reminder.enabled, reminder.hour)}
          style={({ pressed }) => [styles.toggle, reminder.enabled && { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
          accessibilityRole="switch"
          accessibilityLabel="Daily reminder"
          accessibilityState={{ checked: reminder.enabled }}
        >
          <View style={[styles.knob, reminder.enabled && { alignSelf: 'flex-end', backgroundColor: colors.onPrimary }]} />
        </Pressable>
      </View>
      {reminder.enabled && (
        <View style={styles.times}>
          {TIMES.map((t) => {
            const selected = reminder.hour === t.hour;
            return (
              <Pressable
                key={t.hour}
                onPress={() => apply(true, t.hour)}
                accessibilityRole="button"
                accessibilityLabel={`Remind me at ${t.label}`}
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.time,
                  selected && { backgroundColor: colors.primary, borderColor: colors.primary },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.timeText, selected && { color: colors.onPrimary }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 21, fontWeight: font.heading, color: colors.text },
  sub: { fontSize: 13, lineHeight: 17, color: colors.muted, marginTop: 2, fontVariant: ['tabular-nums'] },
  toggle: { width: 56, height: 44, borderRadius: radius.pill, backgroundColor: colors.outline, padding: 6, justifyContent: 'center' },
  knob: { width: 32, height: 32, borderRadius: radius.pill, backgroundColor: colors.surface },
  times: { flexDirection: 'row', gap: 8, marginTop: 16 },
  time: { flex: 1, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center' },
  timeText: { color: colors.text, fontWeight: font.heading, fontSize: 14, fontVariant: ['tabular-nums'] },
  message: { marginTop: 12, color: colors.danger, fontSize: 13, lineHeight: 17 },
});
