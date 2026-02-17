import React, { useState } from 'react';
import { View, Text, TextInput, Alert, Keyboard, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../theme/ThemeProvider';

export default function IPEntryScreen() {
    const navigation = useNavigation();
    const [ip, setIp] = useState('');
    const [port, setPort] = useState('');
    const [loading, setLoading] = useState(false);
    const { colors } = useTheme();

    const testConnection = async () => {
        Keyboard.dismiss();
        const host = port ? `http://${ip}:${port}` : `http://${ip}`;
        setLoading(true);
        try {
            const res = await axios.get(`${host}/`, { timeout: 3000 });
            if (res.status === 200) {
                await AsyncStorage.setItem('BASE_URL', host);
                navigation.navigate('Login' as never);
            } else {
                Alert.alert('Connection Failed', 'Server responded with non-200 status');
            }
        } catch (err: any) {
            Alert.alert('Connection Failed', err.message || 'Unable to reach server');
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
                        <Text className="text-2xl font-bold" style={{ color: colors.text }}>Connect to POS</Text>
                        <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Enter server IP and port</Text>
                    </View>

                    <View className="w-full max-w-md mx-auto rounded-2xl px-6 py-6" style={{ backgroundColor: colors.surface }}>
                        <Text className="text-sm mb-2" style={{ color: colors.textSecondary }}>Server IP</Text>
                        <TextInput
                            value={ip}
                            onChangeText={setIp}
                            placeholder="xxx.xxx.xxx.xxx"
                            keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
                            className="border border-border rounded-lg px-4 py-3 mb-4"
                            style={{ backgroundColor: colors.searchBackground, color: colors.text }}
                            returnKeyType="next"
                            autoCorrect={false}
                        />

                        <Text className="text-sm mb-2" style={{ color: colors.textSecondary }}>Port (optional)</Text>
                        <TextInput
                            value={port}
                            onChangeText={setPort}
                            placeholder="xxxx"
                            keyboardType="numeric"
                            className="border border-border rounded-lg px-4 py-3 mb-6"
                            style={{ backgroundColor: colors.searchBackground, color: colors.text }}
                            returnKeyType="done"
                        />

                        <PrimaryButton title="Connect" onPress={testConnection} loading={loading} className="mt-1" />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
