import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  TextInput
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

export default function PharmacyCorrectionModal({ visible, visitId, onClose, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selectedMode, setSelectedMode] = useState('CASH');
  const [modeSaving, setModeSaving] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [cFeeSaving, setCFeeSaving] = useState(false);
  const [customCFee, setCustomCFee] = useState('');

  // Available Payment Modes
  const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'WALLET'];

  useEffect(() => {
    if (visible && visitId) {
      loadSaleDetails();
    } else {
      setData(null);
    }
  }, [visible, visitId]);

  const getApiUrl = async () => {
    // Cloud URL default
    return 'https://skinssence-api.onrender.com';
  };

  const loadSaleDetails = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const baseUrl = await getApiUrl();
      
      let res;
      try {
        res = await axios.get(`${baseUrl}/api/admin/pharmacy/sales/${visitId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (errCloud) {
        // Fallback to local
        res = await axios.get(`http://localhost:3000/api/admin/pharmacy/sales/${visitId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      setData(res.data);
      const currentMode = res.data?.payments?.[0]?.mode || 'CASH';
      setSelectedMode(currentMode.toUpperCase());
      const cFee = res.data?.visit?.consultation_fee !== undefined ? res.data.visit.consultation_fee.toString() : '0';
      setCustomCFee(cFee);
    } catch (err) {
      console.error('Error fetching sale details:', err);
      Alert.alert('Error', 'Failed to load transaction details.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateConsultationFee = async (targetFee) => {
    if (cFeeSaving || actionInProgress) return;
    setCFeeSaving(true);
    setActionInProgress(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const baseUrl = await getApiUrl();
      const feeVal = parseFloat(targetFee) || 0;
      const payload = {
        consultation_fee: feeVal,
        reason: 'Consultation fee adjusted by staff/doctor'
      };
      let res;
      try {
        res = await axios.put(`${baseUrl}/api/admin/pharmacy/sales/${visitId}/consultation-fee`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        res = await axios.put(`http://localhost:3000/api/admin/pharmacy/sales/${visitId}/consultation-fee`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      Alert.alert('Success', res.data?.message || `Consultation fee updated to ₹${feeVal}`);
      await loadSaleDetails();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to update consultation fee:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to update consultation fee');
    } finally {
      setCFeeSaving(false);
      setActionInProgress(false);
    }
  };

  const handleUpdatePaymentMode = async () => {
    if (modeSaving || actionInProgress) return;
    setModeSaving(true);
    setActionInProgress(true);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const baseUrl = await getApiUrl();
      const payload = {
        payment_mode: selectedMode,
        reason: 'Payment mode corrected by Administrator'
      };

      let res;
      try {
        res = await axios.put(`${baseUrl}/api/admin/pharmacy/sales/${visitId}/payment-mode`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        res = await axios.put(`http://localhost:3000/api/admin/pharmacy/sales/${visitId}/payment-mode`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      Alert.alert('Success', res.data?.message || `Payment mode changed to ${selectedMode}`);
      await loadSaleDetails();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to update payment mode:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to update payment mode');
    } finally {
      setModeSaving(false);
      setActionInProgress(false);
    }
  };

  const confirmDeleteItem = (item) => {
    if (actionInProgress) return;
    const name = item.parsed_name || item.details;
    const qty = item.parsed_qty || 1;

    Alert.alert(
      'Remove Medicine Item',
      `Are you sure you want to remove "${name}" (Qty: ${qty}) from this transaction?\n\nDo you want to restore the stock back to pharmacy inventory?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'No (Do NOT Restore)',
          onPress: () => executeDeleteItem(item.id, false)
        },
        {
          text: `Yes, Restore Stock (+${qty})`,
          style: 'default',
          onPress: () => executeDeleteItem(item.id, true)
        }
      ]
    );
  };

  const executeDeleteItem = async (medicineId, restoreStock) => {
    setActionInProgress(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const baseUrl = await getApiUrl();
      const payload = {
        restore_stock: restoreStock,
        reason: 'Duplicate or accidental line item removed by Administrator'
      };

      let res;
      try {
        res = await axios.delete(`${baseUrl}/api/admin/pharmacy/sales/${visitId}/items/${medicineId}`, {
          headers: { Authorization: `Bearer ${token}` },
          data: payload
        });
      } catch (e) {
        res = await axios.delete(`http://localhost:3000/api/admin/pharmacy/sales/${visitId}/items/${medicineId}`, {
          headers: { Authorization: `Bearer ${token}` },
          data: payload
        });
      }

      Alert.alert('Item Removed', res.data?.message || 'Item removed successfully.');
      await loadSaleDetails();
      if (onUpdated) onUpdated();
    } catch (err) {
      console.error('Failed to remove item:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to remove item');
    } finally {
      setActionInProgress(false);
    }
  };

  if (!visible) return null;

  const visit = data?.visit;
  const medicines = data?.medicines || [];
  const payments = data?.payments || [];
  const totalAmount = medicines.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
  const currentPayment = payments[0];
  const currentMode = (currentPayment?.mode || 'NONE').toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* MODAL HEADER */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Pharmacy Sale Correction</Text>
              <Text style={styles.headerSubtitle}>Admin Data Integrity Tool</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close-circle" size={26} color="#475569" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#5C0B0B" />
              <Text style={{ marginTop: 12, color: '#64748b' }}>Loading transaction records...</Text>
            </View>
          ) : !data ? (
            <View style={styles.centerBox}>
              <Text style={{ color: '#ef4444' }}>Unable to load transaction details.</Text>
            </View>
          ) : (
            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {/* PATIENT & SALE INFO BANNER */}
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.patientName}>
                    {visit?.first_name || 'Patient'} {visit?.last_name || ''}
                  </Text>
                  <View style={styles.badgeId}>
                    <Text style={styles.badgeIdText}>{visit?.skinssence_id || (visit?.patient_id ? `ID: ${visit.patient_id}` : '')}</Text>
                  </View>
                </View>
                <Text style={styles.infoSub}>
                  📞 {visit?.mobile || 'No mobile'} • Visit #{visit?.id || visitId}
                </Text>
                <Text style={styles.infoDate}>
                  📅 {visit?.visit_date ? new Date(visit.visit_date).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                  }) : 'N/A'}
                </Text>
              </View>

              {/* 1. PAYMENT MODE SECTION */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="card-outline" size={18} color="#5C0B0B" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>1. Correct Payment Mode</Text>
                </View>
                <Text style={styles.sectionDesc}>
                  Fix accidental Cash/UPI selection without duplicating transactions or changing Sale ID:
                </Text>

                <View style={styles.currentModeRow}>
                  <Text style={styles.currentModeLabel}>Current Mode in DB:</Text>
                  <View style={[styles.modeBadge, { backgroundColor: currentMode === 'UPI' ? '#06b6d4' : (currentMode === 'CASH' ? '#10b981' : '#6366f1') }]}>
                    <Text style={styles.modeBadgeText}>{currentMode}</Text>
                  </View>
                </View>

                {/* MODE SELECTOR BUTTONS */}
                <Text style={styles.selectLabel}>Select Correct Payment Mode:</Text>
                <View style={styles.modesRow}>
                  {PAYMENT_MODES.map((mode) => {
                    const isSelected = selectedMode === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.modeBtn, isSelected && styles.modeBtnSelected]}
                        onPress={() => setSelectedMode(mode)}
                      >
                        <Text style={[styles.modeBtnText, isSelected && styles.modeBtnTextSelected]}>
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* SAVE MODE BUTTON */}
                <TouchableOpacity
                  style={[styles.actionBtn, selectedMode === currentMode && styles.actionBtnDisabled]}
                  disabled={selectedMode === currentMode || modeSaving}
                  onPress={handleUpdatePaymentMode}
                >
                  {modeSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.actionBtnText}>
                        {selectedMode === currentMode ? 'Mode is Already ' + currentMode : `Update Mode to ${selectedMode}`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* 2. MEDICINES & DUPLICATE REMOVAL SECTION */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="medkit-outline" size={18} color="#5C0B0B" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>2. Medicines & Duplicate Item Removal</Text>
                </View>
                <Text style={styles.sectionDesc}>
                  Remove accidentally scanned or duplicated medicines without deleting the entire sale. Inventory will be automatically restored:
                </Text>

                <View style={styles.itemsSummary}>
                  <Text style={styles.itemsCountText}>{medicines.length} Item(s) in this Sale</Text>
                  <Text style={styles.itemsTotalText}>
                    Total: ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </Text>
                </View>

                {medicines.length === 0 ? (
                  <Text style={styles.emptyText}>No medicines attached to this sale.</Text>
                ) : (
                  medicines.map((item, idx) => (
                    <View key={item.id} style={styles.itemRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.itemName}>
                          {idx + 1}. {item.parsed_name || item.details}
                        </Text>
                        <Text style={styles.itemMeta}>
                          Qty: {item.parsed_qty} {item.parsed_batch ? `• Batch: ${item.parsed_batch}` : ''}
                        </Text>
                        <Text style={styles.itemPrice}>
                          ₹{(parseFloat(item.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => confirmDeleteItem(item)}
                        disabled={actionInProgress}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ef4444" style={{ marginRight: 4 }} />
                        <Text style={styles.deleteBtnText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              {/* 3. CONSULTATION FEE CORRECTION SECTION */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="medical-outline" size={18} color="#5C0B0B" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitle}>3. Correct Consultation Fee</Text>
                </View>
                <Text style={styles.sectionDesc}>
                  If consultation fee was included by mistake (e.g. procedure was performed, free follow-up, or package redemption):
                </Text>

                <View style={styles.currentModeRow}>
                  <Text style={styles.currentModeLabel}>Current Consultation Fee:</Text>
                  <View style={[styles.modeBadge, { backgroundColor: (parseFloat(visit?.consultation_fee) || 0) > 0 ? '#fef3c7' : '#dcfce7' }]}>
                    <Text style={[styles.modeBadgeText, { color: (parseFloat(visit?.consultation_fee) || 0) > 0 ? '#92400e' : '#166534' }]}>
                      ₹{(parseFloat(visit?.consultation_fee) || 0).toFixed(0)}
                    </Text>
                  </View>
                </View>

                {/* QUICK 1-TAP ZERO BUTTON */}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#16a34a', marginTop: 10 }, (parseFloat(visit?.consultation_fee) || 0) === 0 && styles.actionBtnDisabled]}
                  onPress={() => handleUpdateConsultationFee(0)}
                  disabled={(parseFloat(visit?.consultation_fee) || 0) === 0 || cFeeSaving}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.actionBtnText}>
                    {cFeeSaving ? 'Updating...' : '✓ Set Fee to ₹0 (Included with Procedure)'}
                  </Text>
                </TouchableOpacity>

                {/* CUSTOM FEE INPUT ROW */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 }}>
                  <TextInput
                    style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 }}
                    keyboardType="numeric"
                    placeholder="Custom fee (e.g. 400)"
                    value={customCFee}
                    onChangeText={setCustomCFee}
                  />
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#5C0B0B', marginTop: 0, paddingHorizontal: 16 }]}
                    onPress={() => handleUpdateConsultationFee(customCFee)}
                    disabled={cFeeSaving}
                  >
                    <Text style={styles.actionBtnText}>Save Fee</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* AUDIT NOTE */}
              <View style={styles.auditNote}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#047857" style={{ marginRight: 6 }} />
                <Text style={styles.auditNoteText}>
                  All adjustments are verified and permanently recorded in the clinic audit trail.
                </Text>
              </View>

              {/* DONE BUTTON */}
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Done / Close</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  container: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  closeBtn: {
    padding: 4
  },
  centerBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  patientName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  badgeId: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fecaca'
  },
  badgeIdText: {
    color: '#5C0B0B',
    fontWeight: 'bold',
    fontSize: 12
  },
  infoSub: {
    fontSize: 13,
    color: '#475569',
    marginTop: 4
  },
  infoDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  sectionDesc: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
    lineHeight: 17
  },
  currentModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#f1f5f9',
    padding: 8,
    borderRadius: 8
  },
  currentModeLabel: {
    fontSize: 13,
    color: '#334155',
    marginRight: 8,
    fontWeight: '500'
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  modeBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12
  },
  selectLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 8
  },
  modesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center'
  },
  modeBtnSelected: {
    backgroundColor: '#5C0B0B',
    borderColor: '#5C0B0B'
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569'
  },
  modeBtnTextSelected: {
    color: '#fff'
  },
  actionBtn: {
    backgroundColor: '#047857',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 8
  },
  actionBtnDisabled: {
    backgroundColor: '#94a3b8'
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14
  },
  itemsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    marginBottom: 10
  },
  itemsCountText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600'
  },
  itemsTotalText: {
    fontSize: 14,
    color: '#5C0B0B',
    fontWeight: 'bold'
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    paddingVertical: 12
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b'
  },
  itemMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#047857',
    marginTop: 2
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold'
  },
  auditNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14
  },
  auditNoteText: {
    flex: 1,
    fontSize: 11,
    color: '#065f46',
    lineHeight: 15
  },
  doneBtn: {
    backgroundColor: '#5C0B0B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  doneBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15
  }
});
