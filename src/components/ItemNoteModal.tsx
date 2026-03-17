import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import BottomDrawer from './BottomDrawer';

interface Props {
  visible: boolean;
  initialNote?: string;
  onClose: () => void;
  onSave: (note: string) => void;
}

export default function ItemNoteModal({
  visible,
  initialNote = '',
  onClose,
  onSave,
}: Props) {
  const { colors } = useTheme();
  const [note, setNote] = useState(initialNote || '');

  useEffect(() => {
    setNote(initialNote || '');
  }, [initialNote, visible]);

  const footer = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TouchableOpacity
        onPress={onClose}
        style={{
          flex: 1,
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ textAlign: 'center', color: colors.text }}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          onSave(note);
          onClose();
        }}
        style={{
          flex: 1,
          padding: 12,
          borderRadius: 10,
          backgroundColor: colors.primary,
        }}
      >
        <Text style={{ textAlign: 'center', color: colors.textInverse }}>
          Save
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      title="Item Note"
      subtitle="Add a note for this item."
      footer={footer}
      maxHeightRatio={0.66}
    >
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Add note for this item"
        placeholderTextColor={colors.textSecondary}
        style={{
          minHeight: 110,
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          padding: 12,
          backgroundColor: colors.surface,
          textAlignVertical: 'top',
        }}
        multiline
      />
    </BottomDrawer>
  );
}
