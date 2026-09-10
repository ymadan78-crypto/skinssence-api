import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';

/**
 * Reusable Discount Control Component for Pharmacy & Procedure Billing.
 * 
 * Props:
 * - subtotal: number (the gross subtotal of the bill)
 * - discount: { type: 'NONE' | 'PERCENTAGE' | 'FIXED', value: number, amount: number }
 * - onChangeDiscount: function(newDiscount)
 */
export default function DiscountControl({ subtotal = 0, discount = { type: 'NONE', value: 0, amount: 0 }, onChangeDiscount }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [discountMode, setDiscountMode] = useState(discount.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED');
  const [inputValue, setInputValue] = useState(discount.value > 0 ? discount.value.toString() : '');

  const openModal = () => {
    const currentMode = discount.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED';
    setDiscountMode(currentMode);
    setInputValue(discount.value > 0 ? discount.value.toString() : '');
    setModalVisible(true);
  };

  const handleModeSwitch = (mode) => {
    setDiscountMode(mode);
    setInputValue(''); // Switching replaces, never adds
  };

  const numInput = parseFloat(inputValue) || 0;
  let previewDiscountAmount = 0;
  if (discountMode === 'PERCENTAGE') {
    previewDiscountAmount = Math.round((subtotal * Math.min(100, Math.max(0, numInput))) / 100);
  } else {
    previewDiscountAmount = Math.min(subtotal, Math.max(0, numInput));
  }
  const previewNetPayable = Math.max(0, subtotal - previewDiscountAmount);

  const handleApply = () => {
    if (inputValue.trim() === '' || numInput === 0) {
      handleRemove();
      return;
    }

    if (numInput < 0) {
      Alert.alert('Invalid Discount', 'Discount value cannot be negative.');
      return;
    }

    if (discountMode === 'PERCENTAGE') {
      if (numInput > 100) {
        Alert.alert('Invalid Discount', 'Discount percentage cannot exceed 100%.');
        return;
      }
      const discAmt = Math.round((subtotal * numInput) / 100);
      onChangeDiscount({
        type: 'PERCENTAGE',
        value: numInput,
        amount: discAmt
      });
    } else {
      if (numInput > subtotal) {
        Alert.alert('Invalid Discount', `Fixed discount (₹${numInput}) cannot exceed the subtotal (₹${subtotal}).`);
        return;
      }
      onChangeDiscount({
        type: 'FIXED',
        value: numInput,
        amount: Math.round(numInput)
      });
    }

    setModalVisible(false);
  };

  const handleRemove = () => {
    onChangeDiscount({
      type: 'NONE',
      value: 0,
      amount: 0
    });
    setInputValue('');
    setModalVisible(false);
  };

  const hasDiscount = discount && discount.amount > 0;

  return (
    <View style={styles.container}>
      {!hasDiscount ? (
        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Text style={styles.addBtnText}>🏷️ + Add Discount / Concession</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.activeDiscountBadge}>
          <View style={styles.badgeLeft}>
            <Text style={styles.badgeIcon}>🏷️</Text>
            <View>
              <Text style={styles.badgeTitle}>
                Discount ({discount.type === 'PERCENTAGE' ? `${discount.value}%` : 'Fixed ₹'}):
              </Text>
              <Text style={styles.badgeAmount}>- ₹{discount.amount.toFixed(0)}</Text>
            </View>
          </View>
          <View style={styles.badgeActions}>
            <TouchableOpacity style={styles.editBtn} onPress={openModal}>
              <Text style={styles.editBtnText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.removeBtn} onPress={handleRemove}>
              <Text style={styles.removeBtnText}>✕ Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* DISCOUNT MODAL */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply Discount / Concession</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.subtotalBanner}>
              <Text style={styles.subtotalBannerLabel}>Bill Subtotal:</Text>
              <Text style={styles.subtotalBannerValue}>₹ {subtotal.toFixed(2)}</Text>
            </View>

            {/* METHOD TOGGLE (ONLY ONE AT A TIME) */}
            <Text style={styles.fieldLabel}>Choose Discount Method:</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, discountMode === 'PERCENTAGE' && styles.toggleBtnActive]}
                onPress={() => handleModeSwitch('PERCENTAGE')}
              >
                <Text style={[styles.toggleText, discountMode === 'PERCENTAGE' && styles.toggleTextActive]}>
                  Discount %
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, discountMode === 'FIXED' && styles.toggleBtnActive]}
                onPress={() => handleModeSwitch('FIXED')}
              >
                <Text style={[styles.toggleText, discountMode === 'FIXED' && styles.toggleTextActive]}>
                  Discount ₹
                </Text>
              </TouchableOpacity>
            </View>

            {/* INPUT FIELD */}
            <Text style={styles.fieldLabel}>
              {discountMode === 'PERCENTAGE' ? 'Enter Percentage (%):' : 'Enter Rupee Amount (₹):'}
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder={discountMode === 'PERCENTAGE' ? 'e.g. 10 for 10%' : 'e.g. 500'}
              value={inputValue}
              onChangeText={setInputValue}
              autoFocus
            />

            {/* REAL-TIME PREVIEW */}
            <View style={styles.previewBox}>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Subtotal:</Text>
                <Text style={styles.previewVal}>₹ {subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { color: '#dc2626' }]}>
                  Discount {discountMode === 'PERCENTAGE' && numInput > 0 ? `(${numInput}%)` : ''}:
                </Text>
                <Text style={[styles.previewVal, { color: '#dc2626', fontWeight: 'bold' }]}>
                  - ₹ {previewDiscountAmount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.previewDivider} />
              <View style={styles.previewRow}>
                <Text style={[styles.previewLabel, { fontWeight: 'bold', color: '#111827' }]}>Net Payable:</Text>
                <Text style={[styles.previewVal, { fontSize: 18, color: '#16a34a', fontWeight: 'bold' }]}>
                  ₹ {previewNetPayable.toFixed(2)}
                </Text>
              </View>
            </View>

            {/* ACTION BUTTONS */}
            <View style={styles.actionRow}>
              {hasDiscount && (
                <TouchableOpacity style={styles.modalRemoveBtn} onPress={handleRemove}>
                  <Text style={styles.modalRemoveBtnText}>Remove</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.modalApplyBtn} onPress={handleApply}>
                <Text style={styles.modalApplyBtnText}>✓ Apply Discount</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10
  },
  addBtn: {
    backgroundColor: '#fff',
    borderColor: '#d1d5db',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addBtnText: {
    color: '#4b5563',
    fontWeight: 'bold',
    fontSize: 14
  },
  activeDiscountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 10
  },
  badgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  badgeIcon: {
    fontSize: 20,
    marginRight: 8
  },
  badgeTitle: {
    fontSize: 12,
    color: '#7f1d1d',
    fontWeight: '600'
  },
  badgeAmount: {
    fontSize: 16,
    color: '#991b1b',
    fontWeight: 'bold'
  },
  badgeActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  editBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 5,
    marginRight: 6
  },
  editBtnText: {
    fontSize: 12,
    color: '#991b1b',
    fontWeight: 'bold'
  },
  removeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fee2e2',
    borderRadius: 5
  },
  removeBtnText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: 'bold'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    elevation: 5
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827'
  },
  closeBtn: {
    fontSize: 20,
    color: '#6b7280',
    padding: 4
  },
  subtotalBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14
  },
  subtotalBannerLabel: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '600'
  },
  subtotalBannerValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: 'bold'
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6
  },
  toggleBtnActive: {
    backgroundColor: '#5C0B0B',
    elevation: 2
  },
  toggleText: {
    fontSize: 14,
    color: '#4b5563',
    fontWeight: '600'
  },
  toggleTextActive: {
    color: '#fff',
    fontWeight: 'bold'
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 14
  },
  previewBox: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  previewLabel: {
    fontSize: 13,
    color: '#6b7280'
  },
  previewVal: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600'
  },
  previewDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 6
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  modalRemoveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    marginRight: 10
  },
  modalRemoveBtnText: {
    color: '#dc2626',
    fontWeight: 'bold',
    fontSize: 14
  },
  modalApplyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#16a34a',
    alignItems: 'center'
  },
  modalApplyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15
  }
});
