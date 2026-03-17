import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from './Card';
import AppBottomSheet from './AppBottomSheet';
import AppBottomSheetTextInput from './AppBottomSheetTextInput';

interface Props {
    visible: boolean;
    initialNote?: string;
    onClose: () => void;
    onSave: (note: string) => void;
}

export default function ItemNoteModal({ visible, initialNote = '', onClose, onSave }: Props) {
    const { colors, name } = useTheme();
    const [note, setNote] = useState(initialNote || '');

    useEffect(() => {
        setNote(initialNote || '');
    }, [initialNote, visible]);

    return (
        <AppBottomSheet
            visible={visible}
            onClose={onClose}
            title="Item Note"
            snapPoints={['44%']}
        >
            <Card style={{ width: '100%' }} rounded={12}>
                <AppBottomSheetTextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add note for this item"
                    placeholderTextColor={colors.textSecondary}
                    style={{ minHeight: 100, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 }}
                    multiline
                />

                <View style={{ flexDirection: 'row', marginTop: 12 }}>
                    <TouchableOpacity onPress={onClose} style={{ flex: 1, marginRight: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ textAlign: 'center', color: colors.text }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { onSave(note); onClose(); }} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.primary }}>
                        <Text style={{ textAlign: 'center', color: colors.textInverse }}>Save</Text>
                    </TouchableOpacity>
                </View>
            </Card>
        </AppBottomSheet>
    );
}
