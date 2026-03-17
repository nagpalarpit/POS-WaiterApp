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
    const {
        isInternetReachable,
        isLocalServerReachable,
        isCheckingLocal,
        pauseLocalServerRetry,
        resumeLocalServerRetry,
    } = useConnection();
    const [showConnectionModal, setShowConnectionModal] = React.useState(false);

    const showLocalServerBanner = !isLocalServerReachable && !isCheckingLocal;
    const showInternetBanner = !isInternetReachable && isLocalServerReachable;
    const shouldShowBar = showLocalServerBanner || showInternetBanner;
    const isActionable = showLocalServerBanner;

    const bannerColor = showInternetBanner ? colors.warning || '#D97706' : colors.error;
    const bannerIcon = showInternetBanner ? 'cloud-off' : 'wifi-off';
    const bannerText = showInternetBanner
        ? 'Internet unavailable'
        : isCheckingLocal
            ? 'Checking connection...'
            : 'Local server disconnected';

    const openConnectionDrawer = () => {
        if (!isActionable) return;
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
                    <StatusBar backgroundColor={bannerColor} barStyle="light-content" />
                    <TouchableOpacity
                        disabled={!isActionable}
                        style={[styles.container, { backgroundColor: bannerColor, paddingTop: insets.top }]}
                        onPress={openConnectionDrawer}
                        activeOpacity={isActionable ? 0.8 : 1}
                    >
                        <View style={styles.content}>
                            <MaterialIcons name={bannerIcon} size={16} color="#fff" />
                            <Text style={styles.text}>{bannerText}</Text>
                            {isActionable ? <MaterialIcons name="chevron-right" size={16} color="#fff" /> : null}
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
        zIndex: 10,
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
