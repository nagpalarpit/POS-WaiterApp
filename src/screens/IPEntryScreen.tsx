import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Alert, Keyboard, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../theme/ThemeProvider';
import serverConnection from '../services/serverConnection';
import { setLocalBaseUrl } from '../services/localApi';

export default function IPEntryScreen() {
    const navigation = useNavigation();
    const isFocused = useIsFocused();
    const [ip, setIp] = useState('127.0.0.1');
    const [port, setPort] = useState('4000'); // Default port
    const [loading, setLoading] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const { colors } = useTheme();

    // Initialize with saved server URL on screen focus
    useEffect(() => {
        const initializeScreen = async () => {
            if (isFocused) {
                const savedUrl = serverConnection.getServerUrl();
                if (savedUrl) {
                    // Parse saved URL to show IP and port
                    const urlObj = new URL(savedUrl);
                    setIp(urlObj.hostname);
                    setPort(urlObj.port || '4000');
                }
                setInitialized(true);
            }
        };

        initializeScreen();
    }, [isFocused]);

    const testConnection = async () => {
        const trimmedIp = ip.trim();
        const trimmedPort = port.trim();

        if (!trimmedIp) {
            Alert.alert('Validation Error', 'Please enter server IP');
            return;
        }

        Keyboard.dismiss();
        const host = trimmedPort ? `http://${trimmedIp}:${trimmedPort}/` : `http://${trimmedIp}/`;
        setLoading(true);

        try {
            const success = await serverConnection.setServerUrl(host);

            console.log('Connection test result:', success);

            if (success) {
                // Also set it in localApi for direct API calls
                await setLocalBaseUrl(host);
                // Backward compatibility for modules still using legacy storage.
                await AsyncStorage.setItem('BASE_URL', host);

                // Fetch POS ID when available, but do not block navigation.
                try {
                    await serverConnection.initializePosId();
                    console.log('POS ID fetched and stored successfully');
                } catch (err: any) {
                    console.log('Warning: Could not fetch POS ID from server:', err.message);
                }

                navigation.navigate('Login' as never);
            } else {
                Alert.alert(
                    'Connection Failed',
                    'Unable to reach the POS server. Please check the IP address and port are correct and try again.'
                );
            }
        } catch (err: any) {
            Alert.alert('Connection Error', err.message || 'Unable to reach server');
        } finally {
            setLoading(false);
        }
    };

    if (!initialized) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: colors.text }}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
                    <View className="items-center mb-6">
                        <View className="w-20 h-20 rounded-full bg-primary items-center justify-center mb-4">
                            <View className="w-10 h-10 rounded-full" style={{ backgroundColor: colors.searchBackground + '66' }} />
                        </View>
                        <Text className="text-2xl font-bold" style={{ color: colors.text }}>Connect to POS</Text>
                        <Text className="text-sm mt-1" style={{ color: colors.textSecondary }}>Enter local server details</Text>
                    </View>

                    <View className="w-full max-w-md mx-auto rounded-2xl px-6 py-6" style={{ backgroundColor: colors.surface }}>
                        <Text className="text-sm mb-2" style={{ color: colors.textSecondary }}>Server IP Address</Text>
                        <TextInput
                            value={ip}
                            onChangeText={setIp}
                            placeholder="e.g., 192.168.1.100"
                            keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
                            className="border border-border rounded-lg px-4 py-3 mb-4"
                            style={{ backgroundColor: colors.searchBackground, color: colors.text }}
                            returnKeyType="next"
                            autoCorrect={false}
                            editable={!loading}
                        />

                        <Text className="text-sm mb-2" style={{ color: colors.textSecondary }}>Port (optional)</Text>
                        <TextInput
                            value={port}
                            onChangeText={setPort}
                            placeholder="e.g., 4000"
                            keyboardType="numeric"
                            className="border border-border rounded-lg px-4 py-3 mb-6"
                            style={{ backgroundColor: colors.searchBackground, color: colors.text }}
                            returnKeyType="done"
                            editable={!loading}
                        />

                        <PrimaryButton
                            title="Connect to Local Server"
                            onPress={testConnection}
                            loading={loading}
                            className="mt-2"
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
