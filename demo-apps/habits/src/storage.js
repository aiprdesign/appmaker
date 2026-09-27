import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'habits.v1';

export async function loadHabits() {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveHabits(habits) {
  return AsyncStorage.setItem(KEY, JSON.stringify(habits));
}

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function streakFor(habit) {
  let streak = 0;
  const day = new Date();
  while (habit.days[todayKey(day)]) {
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
