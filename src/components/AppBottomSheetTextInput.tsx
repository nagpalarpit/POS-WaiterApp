import React, { forwardRef } from 'react';
import {
  TextInputProps,
} from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

const AppBottomSheetTextInput = forwardRef<any, TextInputProps>(function AppBottomSheetTextInput(
  props,
  ref
) {
  return <BottomSheetTextInput ref={ref} {...props} />;
});

export default AppBottomSheetTextInput;
