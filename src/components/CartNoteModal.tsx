import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { getCurrencySymbol } from '../utils/currency';
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
        if (visible) {
            setNote(initialNote || '');
            setDiscountType(initialDiscount?.discountType || 'FLAT');
            setDiscountValue(String(initialDiscount?.discountValue || ''));
        }
    }, [initialNote, initialDiscount, visible]);

    const save = () => {
        const value = parseFloat(discountValue) || 0;
        const discount = value > 0 ? { discountType, discountValue: value } as CartDiscount : null;
        onSave(note, discount);
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                {/* Backdrop Pressable */}
                <Pressable
                    onPress={onClose}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}
                />
                
                {/* Modal Content */}
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
                    <Card style={{ width: '100%', maxWidth: 400 }} rounded={12}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>Edit Order</Text>
                            <TouchableOpacity onPress={onClose}><MaterialCommunityIcons name="close" size={24} color={colors.text} /></TouchableOpacity>
                        </View>

                        {/* Order Note Section */}
                        <View style={{ marginBottom: 16 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Order Note</Text>
                            <TextInput
                                value={note}
                                onChangeText={setNote}
                                placeholder="Add a note for this order..."
                                placeholderTextColor={colors.textSecondary}
                                style={{ minHeight: 80, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.surface }}
                                multiline
                            />
                        </View>

                        {/* Discount Section */}
                        <View style={{ marginBottom: 16 }}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Discount</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TouchableOpacity onPress={() => setDiscountType('FLAT')} style={{ padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: discountType === 'FLAT' ? colors.primary : colors.border, backgroundColor: discountType === 'FLAT' ? colors.primary + '20' : colors.surface }}>
                                    <Text style={{ color: discountType === 'FLAT' ? colors.primary : colors.text, fontWeight: '600', fontSize: 12 }}>
                                      {getCurrencySymbol()} Flat
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setDiscountType('PERCENTAGE')} style={{ padding: 10, borderRadius: 8, borderWidth: 1.5, borderColor: discountType === 'PERCENTAGE' ? colors.primary : colors.border, backgroundColor: discountType === 'PERCENTAGE' ? colors.primary + '20' : colors.surface }}>
                                    <Text style={{ color: discountType === 'PERCENTAGE' ? colors.primary : colors.text, fontWeight: '600', fontSize: 12 }}>% Percent</Text>
                                </TouchableOpacity>

                                <TextInput
                                    value={discountValue}
                                    onChangeText={setDiscountValue}
                                    placeholder={discountType === 'FLAT' ? 'Amount' : 'Percentage'}
                                    placeholderTextColor={colors.textSecondary}
                                    keyboardType="decimal-pad"
                                    style={{ flex: 1, color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.surface, fontWeight: '600' }}
                                />
                            </View>
                        </View>

                        {/* Buttons */}
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={onClose} style={{ flex: 1, padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }}>
                                <Text style={{ textAlign: 'center', color: colors.text, fontWeight: '600' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => {
                                save();
                                onClose();
                            }} style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: colors.primary }}>
                                <Text style={{ textAlign: 'center', color: colors.textInverse, fontWeight: '700' }}>Save Changes</Text>
                            </TouchableOpacity>
                        </View>
                    </Card>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
