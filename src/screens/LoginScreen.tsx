import React, { useState } from 'react';
import { View, Text, TextInput, Alert, Keyboard, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../theme/ThemeProvider';
import authService from '../services/authService';

export default function LoginScreen() {
  const navigation = useNavigation();
  const [username, setUsername] = useState('testyash1@gmail_test.com');
  const [password, setPassword] = useState('admin@123');
  const [loading, setLoading] = useState(false);
  const { colors } = useTheme();

  const doLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Please enter username and password');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      const result = await authService.loginWithFallback({
        email: username.trim(),
        password: password.trim(),
      });

      if (result.success && result.response) {
        const loginTypeLabel = result.loginType === 'local' ? 'Local Server' : 'Cloud Server';
        console.log(`Login successful via ${loginTypeLabel}`);
        
        // Store user data to AsyncStorage for later access (companyId, etc.)
        try {
          await AsyncStorage.setItem('userData', JSON.stringify(result.response.user));
          await AsyncStorage.setItem('authToken', result.response.token);
        } catch (storageError) {
          console.error('Error storing user data:', storageError);
        }
        
        // Navigate to Dashboard (reset stack so Dashboard becomes the root)
        navigation.reset({ index: 0, routes: [{ name: 'Main' as never }] });
      } else {
        Alert.alert('Login Failed', result.error || 'Unable to authenticate');
      }
    } catch (err: any) {
      Alert.alert('Login Error', err.message || 'An unexpected error occurred');
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
            <Text className="text-2xl font-bold" style={{ color: colors.text }}>Welcome Waiter</Text>
            <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Log into your account</Text>
          </View>

          <View className="w-full max-w-md mx-auto rounded-2xl px-6 py-6" style={Platform.OS === 'android' ? { elevation: 2 } : { shadowColor: colors.border, shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, backgroundColor: colors.surface }}>
            <View className="mb-4">
              <Text className="text-sm mb-1" style={{ color: colors.textSecondary }}>Username</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                placeholder="Enter your username"
                autoCapitalize="none"
                className="border border-border rounded-lg px-4 py-3"
                style={{ backgroundColor: colors.searchBackground, color: colors.text }}
                editable={!loading}
              />
            </View>

            <View className="mb-6">
              <Text className="text-sm mb-1" style={{ color: colors.textSecondary }}>Password</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry
                className="border border-border rounded-lg px-4 py-3"
                style={{ backgroundColor: colors.searchBackground, color: colors.text }}
                editable={!loading}
              />
            </View>

            <PrimaryButton 
              title="Login" 
              onPress={doLogin} 
              loading={loading} 
              className="mt-4"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
