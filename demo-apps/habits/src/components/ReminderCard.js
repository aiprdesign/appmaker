import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const KEY = 'reminder.v1';
const TIMES = [
  { hour: 8, label: '8:00 AM' },
  { hour: 12, label: '12:00 PM' },
  { hour: 20, label: '8:00 PM' },
];

export default function ReminderCard({ accent }) {
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
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>🔔 Daily reminder</Text>
          <Text style={styles.sub}>{reminder.enabled ? `Every day at ${TIMES.find((t) => t.hour === reminder.hour)?.label}` : 'Off'}</Text>
        </View>
        <TouchableOpacity
          onPress={() => apply(!reminder.enabled, reminder.hour)}
          style={[styles.toggle, reminder.enabled && { backgroundColor: accent }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: reminder.enabled }}
        >
          <View style={[styles.knob, reminder.enabled && { alignSelf: 'flex-end' }]} />
        </TouchableOpacity>
      </View>
      {reminder.enabled && (
        <View style={styles.times}>
          {TIMES.map((t) => (
            <TouchableOpacity
              key={t.hour}
              onPress={() => apply(true, t.hour)}
              style={[styles.time, reminder.hour === t.hour && { backgroundColor: accent, borderColor: accent }]}
            >
              <Text style={[styles.timeText, reminder.hour === t.hour && { color: '#fff' }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {!!message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#16141F' },
  sub: { fontSize: 13, color: '#625F73', marginTop: 2 },
  toggle: { width: 56, height: 44, borderRadius: 22, backgroundColor: '#D5D1E3', padding: 6, justifyContent: 'center' },
  knob: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff' },
  times: { flexDirection: 'row', gap: 8, marginTop: 14 },
  time: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E6E3F0', alignItems: 'center', justifyContent: 'center' },
  timeText: { color: '#16141F', fontWeight: '600' },
  message: { marginTop: 10, color: '#B42318', fontSize: 13 },
});
