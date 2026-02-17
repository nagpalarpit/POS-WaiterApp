import React, { useState } from 'react';
import { View, Text, TextInput, Alert, Keyboard, Platform, KeyboardAvoidingView, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../theme/ThemeProvider';

export default function LoginScreen() {
  const navigation = useNavigation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { colors } = useTheme();

  const doLogin = async () => {
    Keyboard.dismiss();
    setLoading(true);
    try {
    //   const base = (await AsyncStorage.getItem('BASE_URL')) || '';
      const res = await axios.post(`/admin/auth/login`, { username, password });
      // Replace with actual response mapping (token etc.)
      if (res.status === 200) {
        await AsyncStorage.setItem('token', res.data?.token || 'demo-token');
        navigation.navigate('Dashboard' as never);
      } else {
        Alert.alert('Login failed', 'Invalid credentials');
      }
    } catch (err: any) {
      Alert.alert('Login failed', err.message || 'Unable to reach server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
          <View className="items-center mb-6">
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-4">
              <View className="w-10 h-10 rounded-full" style={{ backgroundColor: colors.searchBackground + '66' }} />
            </View>
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>Hello Again!</Text>
            <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Log into your account</Text>
          </View>

          <View className="w-full max-w-md mx-auto rounded-2xl px-6 py-6" style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: colors.border, shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } , backgroundColor: colors.surface}}>
            <View className="mb-4">
              <Text className="text-sm mb-1" style={{ color: colors.textSecondary }}>Enter your email address</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Enter your email address"
                autoCapitalize="none"
                keyboardType="email-address"
                className="border border-border rounded-lg px-4 py-3"
                style={{ backgroundColor: colors.searchBackground, color: colors.text }}
              />
            </View>

            <View className="mb-2">
              <Text className="text-sm mb-1" style={{ color: colors.textSecondary }}>Enter your password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry
                className="border border-border rounded-lg px-4 py-3"
                style={{ backgroundColor: colors.searchBackground, color: colors.text }}
              />
            </View>

            <PrimaryButton title="Continue" onPress={doLogin} loading={loading} className="mt-4" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
