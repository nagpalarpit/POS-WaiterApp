import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from './Card';
import { CartDiscount } from '../services/cartService';

interface Props {
    visible: boolean;
    initialNote?: string;
    initialDiscount?: CartDiscount | null;
    onClose: () => void;
    onSave: (note: string, discount: CartDiscount | null) => void;
}

export default function CartNoteModal({ visible, initialNote = '', initialDiscount = null, onClose, onSave }: Props) {
    const { colors, name } = useTheme();
    const [note, setNote] = useState(initialNote || '');
    const [discountType, setDiscountType] = useState<'PERCENTAGE' | 'FLAT'>(initialDiscount?.discountType || 'FLAT');
    const [discountValue, setDiscountValue] = useState(String(initialDiscount?.discountValue || ''));

    useEffect(() => {
        setNote(initialNote || '');
        setDiscountType(initialDiscount?.discountType || 'FLAT');
        setDiscountValue(String(initialDiscount?.discountValue || ''));
    }, [initialNote, initialDiscount, visible]);

    const save = () => {
        const value = parseFloat(discountValue) || 0;
        const discount = value > 0 ? { discountType, discountValue: value } as CartDiscount : null;
        onSave(note, discount);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} allowSwipeDismissal={true}>
            <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' }}>
                <Card style={{ width: '90%' }} rounded={12}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={{ color: colors.text, fontWeight: '700' }}>Cart Note & Discount</Text>
                        <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={20} color={colors.text} /></TouchableOpacity>
                    </View>

                    <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="Add a note for the cart"
                        placeholderTextColor={colors.textSecondary}
                        style={{ minHeight: 80, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8 }}
                        multiline
                    />

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
                        <TouchableOpacity onPress={() => setDiscountType('FLAT')} style={{ padding: 8, borderRadius: 6, borderWidth: 1, borderColor: discountType === 'FLAT' ? colors.primary : colors.border, backgroundColor: discountType === 'FLAT' ? colors.primary + '20' : 'transparent' }}>
                            <Text style={{ color: colors.text }}>Flat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setDiscountType('PERCENTAGE')} style={{ padding: 8, borderRadius: 6, borderWidth: 1, borderColor: discountType === 'PERCENTAGE' ? colors.primary : colors.border, backgroundColor: discountType === 'PERCENTAGE' ? colors.primary + '20' : 'transparent' }}>
                            <Text style={{ color: colors.text }}>Percent</Text>
                        </TouchableOpacity>

                        <TextInput
                            value={discountValue}
                            onChangeText={setDiscountValue}
                            placeholder={discountType === 'FLAT' ? 'Amount' : 'Percentage'}
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="numeric"
                            style={{ flex: 1, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8 }}
                        />
                    </View>

                    <View style={{ flexDirection: 'row', marginTop: 12 }}>
                        <TouchableOpacity onPress={onClose} style={{ flex: 1, marginRight: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                            <Text style={{ textAlign: 'center', color: colors.text }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={save} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.primary }}>
                            <Text style={{ textAlign: 'center', color: colors.textInverse }}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </Card>
            </View>
        </Modal>
    );
}
