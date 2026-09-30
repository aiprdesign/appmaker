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
      <TouchableOpacity
        onLongPress={onDelete}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${habit.name}, done today`}
        accessibilityHint="Long-press to delete"
        style={[styles.check, done && { backgroundColor: accent, borderColor: accent }]}
      >
        {done && <Text style={styles.tick}>✓</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 14, marginBottom: 10, gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#F4F2FA', alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: '#16141F' },
  nameDone: { color: '#625F73', textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: '#625F73', marginTop: 2 },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#8A8F98', alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
