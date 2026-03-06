import { useState } from 'react';
import { CartDiscountType } from '../services/cartService';
import { getDiscountTypeLabel } from '../utils/cartCalculations';
import { Cart } from '../services/cartService';
import { useToast } from '../components/ToastProvider';

/**
 * Hook for managing cart notes and discount editing states
 */
export const useCartNotes = (cart: Cart, onSaveNote: any, onSaveDiscount: any) => {
  const { showToast } = useToast();
  // Item note editing
  const [editingItemNoteId, setEditingItemNoteId] = useState<string | null>(null);
  const [itemNoteDraft, setItemNoteDraft] = useState('');
  const [showItemNoteModal, setShowItemNoteModal] = useState(false);

  // Order note editing
  const [isEditingOrderNote, setIsEditingOrderNote] = useState(false);
  const [orderNoteDraft, setOrderNoteDraft] = useState('');
  const [showCartNoteModal, setShowCartNoteModal] = useState(false);

  // Discount editing
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [discountTypeDraft, setDiscountTypeDraft] = useState<CartDiscountType>('PERCENTAGE');
  const [discountValueDraft, setDiscountValueDraft] = useState('');

  // ===== Item Note Management =====
  const startEditItemNote = (cartId: string, currentNote: string) => {
    setEditingItemNoteId(cartId);
    setItemNoteDraft(currentNote || '');
  };

  const cancelItemNoteEdit = () => {
    setEditingItemNoteId(null);
    setItemNoteDraft('');
  };

  const openItemNoteModal = (cartId: string, currentNote: string) => {
    setEditingItemNoteId(cartId);
    setItemNoteDraft(currentNote || '');
    setShowItemNoteModal(true);
  };

  const saveItemNoteModal = async (note: string) => {
    if (!editingItemNoteId) return;
    try {
      await onSaveNote(editingItemNoteId, note);
      setShowItemNoteModal(false);
      setEditingItemNoteId(null);
      setItemNoteDraft('');
    } catch (err) {
      console.error('Error saving item note via modal:', err);
    }
  };

  // ===== Order Note Management =====
  const startEditOrderNote = () => {
    setOrderNoteDraft(cart.orderNote || '');
    setIsEditingOrderNote(true);
  };

  const cancelOrderNoteEdit = () => {
    setIsEditingOrderNote(false);
    setOrderNoteDraft('');
  };

  const saveOrderNote = async () => {
    try {
      // Save through cart note modal or direct update
      setShowCartNoteModal(true);
      // The saving logic is handled by the component
    } catch (error) {
      console.error('Error saving cart note:', error);
    }
  };

  // ===== Discount Management =====
  const startDiscountEdit = () => {
    setDiscountTypeDraft(cart.discount?.discountType || 'PERCENTAGE');
    setDiscountValueDraft(
      cart.discount?.discountValue !== undefined
        ? String(cart.discount.discountValue)
        : ''
    );
    setIsEditingDiscount(true);
  };

  const cancelDiscountEdit = () => {
    setIsEditingDiscount(false);
    setDiscountValueDraft('');
    setDiscountTypeDraft('PERCENTAGE');
  };

  const saveDiscount = async () => {
    try {
      const discountValue = parseFloat(discountValueDraft || '0');
      if (!Number.isFinite(discountValue) || discountValue <= 0) {
        await onSaveDiscount(null);
        cancelDiscountEdit();
        return;
      }

      if (discountTypeDraft === 'PERCENTAGE' && discountValue > 100) {
        showToast('Percentage discount cannot exceed 100.', { type: 'error' });
        return;
      }

      await onSaveDiscount({
        discountName: getDiscountTypeLabel(discountTypeDraft),
        discountType: discountTypeDraft,
        discountValue,
      });
      cancelDiscountEdit();
    } catch (error) {
      console.error('Error saving discount:', error);
    }
  };

  const clearDiscount = async () => {
    try {
      await onSaveDiscount(null);
      cancelDiscountEdit();
    } catch (error) {
      console.error('Error clearing discount:', error);
    }
  };

  return {
    // Item note states
    editingItemNoteId,
    itemNoteDraft,
    setItemNoteDraft,
    showItemNoteModal,
    setShowItemNoteModal,
    startEditItemNote,
    cancelItemNoteEdit,
    openItemNoteModal,
    saveItemNoteModal,

    // Order note states
    isEditingOrderNote,
    setIsEditingOrderNote,
    orderNoteDraft,
    setOrderNoteDraft,
    showCartNoteModal,
    setShowCartNoteModal,
    startEditOrderNote,
    cancelOrderNoteEdit,
    saveOrderNote,

    // Discount states
    isEditingDiscount,
    discountTypeDraft,
    setDiscountTypeDraft,
    discountValueDraft,
    setDiscountValueDraft,
    startDiscountEdit,
    cancelDiscountEdit,
    saveDiscount,
    clearDiscount,
  };
};
