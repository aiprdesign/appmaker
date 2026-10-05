import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Check, Flame, Trash2 } from 'lucide-react-native';
import { colors, radius, font, card } from '../theme';

export default function HabitRow({ habit, done, streak, onToggle, onDelete }) {
  return (
    <View style={[card, styles.row]}>
      <View style={styles.icon} accessible={false}>
        <Text style={styles.emoji}>{habit.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, done && styles.nameDone]}>{habit.name}</Text>
        <View style={styles.metaRow}>
          {streak > 0 && <Flame size={14} color={colors.primary} accessible={false} />}
          <Text style={styles.meta}>{streak > 0 ? `${streak}-day streak` : 'Start your streak today'}</Text>
        </View>
      </View>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${habit.name}`}
        hitSlop={4}
        style={({ pressed }) => [styles.delete, pressed && { opacity: 0.7 }]}
      >
        <Trash2 size={20} color={colors.muted} accessible={false} />
      </Pressable>
      <Pressable
        onLongPress={onDelete}
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${habit.name}, done today`}
        accessibilityHint="Long-press to delete"
        style={({ pressed }) => [
          styles.check,
          done && { backgroundColor: colors.primary, borderColor: colors.primary },
          pressed && { opacity: 0.7 },
        ]}
      >
        {done && <Check size={22} color={colors.onPrimary} strokeWidth={3} accessible={false} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 12, gap: 12, minHeight: 76 },
  icon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: font.heading, color: colors.text },
  nameDone: { color: colors.muted, textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  meta: { fontSize: 13, lineHeight: 17, color: colors.muted, fontVariant: ['tabular-nums'] },
  delete: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  check: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center' },
});
