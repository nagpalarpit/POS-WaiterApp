import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from './Card';

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
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} allowSwipeDismissal={true}>
            <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' }}>
                <Card style={{ width: '90%' }} rounded={12}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>Item Note</Text>
                        <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={colors.text} /></TouchableOpacity>
                    </View>

                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Add note for this item"
                        placeholderTextColor={colors.textSecondary}
                        style={{ minHeight: 80, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8 }}
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
            </View>
        </Modal>
    );
}
