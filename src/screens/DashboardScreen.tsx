import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

export default function DashboardScreen() {
  const { colors } = useTheme();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between mb-4" style={{ padding: 16 }}>
        <Text className="text-lg font-bold" style={{ color: colors.text }}>Waiter Dashboard</Text>
        <View className="flex-row items-center gap-3">
          <Text className="text-sm" style={{ color: colors.textSecondary }}>Offline</Text>
        </View>
      </View>

      <View className="mb-4">
        <Text className="text-sm text-text-secondary mb-2">Categories</Text>
        <View className="flex-row space-x-3">
          <TouchableOpacity className="bg-surface px-3 py-2 rounded-2xl">
            <Text className="text-text">All</Text>
          </TouchableOpacity>
          <TouchableOpacity className="bg-surface px-3 py-2 rounded-2xl">
            <Text className="text-text">Pizza</Text>
          </TouchableOpacity>
          <TouchableOpacity className="bg-surface px-3 py-2 rounded-2xl">
            <Text className="text-text">Drinks</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1">
        <Text className="text-sm text-text-secondary mb-2">Menu</Text>
        <View className="flex-row flex-wrap">
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} className="bg-surface p-3 m-1 rounded-md w-1/2">
              <Text className="text-text">Item {i + 1}</Text>
              <Text className="text-text-secondary">€{(8 + i).toFixed(2)}</Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity className="absolute bottom-8 right-6 bg-primary px-5 py-3 rounded-full">
        <Text className="text-inverse font-semibold">Cart</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
