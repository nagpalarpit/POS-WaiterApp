import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useConnection } from '../contexts/ConnectionProvider';
import ConnectionScreen from '../screens/ConnectionScreen';

export default function StatusBarIndicator() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { isLocalServerReachable, isCheckingLocal, pauseLocalServerRetry, resumeLocalServerRetry } = useConnection();
    const [showConnectionModal, setShowConnectionModal] = React.useState(false);

    // Don't show bar if connected or checking
    const shouldShowBar = !isLocalServerReachable && !isCheckingLocal;

    const openConnectionDrawer = () => {
        pauseLocalServerRetry();
        setShowConnectionModal(true);
    };

    const closeConnectionDrawer = () => {
        setShowConnectionModal(false);
        resumeLocalServerRetry().catch(() => { });
    };

    const handleConnected = () => {
        setShowConnectionModal(false);
    };

    return (
        <>
            {shouldShowBar && (
                <>
                    <StatusBar backgroundColor={colors.error} barStyle="light-content" />
                    <TouchableOpacity
                        style={[styles.container, { backgroundColor: colors.error, paddingTop: insets.top }]}
                        onPress={openConnectionDrawer}
                        activeOpacity={0.8}
                    >
                        <View style={styles.content}>
                            <MaterialIcons name="wifi-off" size={16} color="#fff" />
                            <Text style={styles.text}>
                                {isCheckingLocal ? 'Checking connection...' : 'Local server disconnected'}
                            </Text>
                            <MaterialIcons name="chevron-right" size={16} color="#fff" />
                        </View>
                    </TouchableOpacity>
                </>
            )}

            <ConnectionScreen
                visible={showConnectionModal}
                onClose={closeConnectionDrawer}
                onConnected={handleConnected}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    text: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginHorizontal: 8,
        textAlign: 'center',
    },
});
