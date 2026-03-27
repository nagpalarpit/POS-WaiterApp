import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import AppBottomSheet from './AppBottomSheet';
import AppBottomSheetTextInput from './AppBottomSheetTextInput';
import { useTranslation } from '../contexts/LanguageContext';

interface Props {
    visible: boolean;
    initialNote?: string;
    onClose: () => void;
    onSave: (note: string) => void;
}

export default function ItemNoteModal({ visible, initialNote = '', onClose, onSave }: Props) {
    const { colors } = useTheme();
    const { t } = useTranslation();
    const [note, setNote] = useState(initialNote || '');

    useEffect(() => {
        setNote(initialNote || '');
    }, [initialNote, visible]);

    const footer = (
        <View style={styles.footerActions}>
            <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.85}
                style={[
                    styles.secondaryButton,
                    {
                        borderColor: colors.border,
                        backgroundColor: colors.searchBackground || colors.surface,
                    },
                ]}
            >
                <Text style={[styles.secondaryButtonText, { color: colors.textSecondary || colors.text }]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={() => { onSave(note); onClose(); }}
                activeOpacity={0.85}
                style={[
                    styles.primaryButton,
                    {
                        backgroundColor: colors.primary,
                    },
                ]}
            >
                <Text style={[styles.primaryButtonText, { color: colors.textInverse || '#fff' }]}>{t('saveNote')}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <AppBottomSheet
            visible={visible}
            onClose={onClose}
            title={t('itemNote')}
            subtitle={t('addQuickInstructionForThisItem')}
            snapPoints={['56%']}
            footer={footer}
        >
            <View style={styles.formSection}>
                <Text style={[styles.label, { color: colors.textSecondary || colors.text }]}>{t('note')}</Text>
                <AppBottomSheetTextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder={t('addNoteForThisItem')}
                    placeholderTextColor={colors.textSecondary || colors.text}
                    style={[
                        styles.textArea,
                        {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.searchBackground || colors.surface,
                        },
                    ]}
                    multiline
                />
            </View>
        </AppBottomSheet>
    );
}

const styles = StyleSheet.create({
    formSection: {
        marginBottom: 18,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
        letterSpacing: 0.2,
    },
    textArea: {
        minHeight: 132,
        borderWidth: 1,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        textAlignVertical: 'top',
        fontSize: 16,
    },
    footerActions: {
        flexDirection: 'row',
        gap: 10,
    },
    secondaryButton: {
        flex: 0.42,
        minHeight: 54,
        borderRadius: 18,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '700',
    },
    primaryButton: {
        flex: 1,
        minHeight: 56,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonText: {
        fontSize: 16,
        fontWeight: '800',
    },
});
