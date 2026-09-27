import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function HabitRow({ habit, done, streak, accent, onToggle, onDelete }) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Text style={{ fontSize: 24 }}>{habit.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, done && styles.nameDone]}>{habit.name}</Text>
        <Text style={styles.meta}>{streak > 0 ? `🔥 ${streak}-day streak` : 'Start your streak today'}</Text>
      </View>
      <TouchableOpacity onLongPress={onDelete} onPress={onToggle} style={[styles.check, done && { backgroundColor: accent, borderColor: accent }]}>
        {done && <Text style={styles.tick}>✓</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 14, marginBottom: 10, gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#F4F2FA', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: '#16141F' },
  nameDone: { color: '#9A98A6', textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: '#8A8799', marginTop: 2 },
  check: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#D5D1E3', alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
