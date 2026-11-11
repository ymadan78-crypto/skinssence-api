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
  TextInput,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

const API_BASE_URL = 'https://skinssence-api.onrender.com';

const QUICK_PROCEDURES = [
  { name: 'Hydrafacial', defaultAmount: 2500 },
  { name: 'Carbon Laser Peel', defaultAmount: 3000 },
  { name: 'Chemical Peel', defaultAmount: 1500 },
  { name: 'Laser Hair Removal (Face)', defaultAmount: 2000 },
  { name: 'Laser Hair Removal (Full Body)', defaultAmount: 8000 },
  { name: 'PRP Hair Therapy', defaultAmount: 3500 },
  { name: 'PRP Face (Vampire Facial)', defaultAmount: 4000 },
  { name: 'Comedone Extraction', defaultAmount: 500 },
  { name: 'Mole / Wart / Tag Removal', defaultAmount: 1000 },
  { name: 'Intralesional Injection (TAC)', defaultAmount: 500 },
  { name: 'Dermapen Microneedling', defaultAmount: 2500 },
  { name: 'Tattoo Removal', defaultAmount: 2000 }
];

export default function EditBillModal({ visible, visitId, onClose, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billDetails, setBillDetails] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [restrictionReason, setRestrictionReason] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [isToday, setIsToday] = useState(false);

  // Form State
  const [consultationFee, setConsultationFee] = useState('0');
  const [plannedProcedures, setPlannedProcedures] = useState('');
  const [procedures, setProcedures] = useState([]);
  const [discountType, setDiscountType] = useState('NONE'); // NONE, PERCENTAGE, FLAT
  const [discountValue, setDiscountValue] = useState('0');
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [amountReceived, setAmountReceived] = useState('0');
  const [reason, setReason] = useState('Staff/Doctor bill adjustment');
  const [autoSyncPayment, setAutoSyncPayment] = useState(true);

  // Quick procedure picker modal state
  const [showProcPicker, setShowProcPicker] = useState(false);
  const [customProcName, setCustomProcName] = useState('');
  const [customProcAmount, setCustomProcAmount] = useState('');
  const [customProcArea, setCustomProcArea] = useState('');

  useEffect(() => {
    if (visible && visitId) {
      loadBillDetails();
    } else {
      resetState();
    }
  }, [visible, visitId]);

  const resetState = () => {
    setBillDetails(null);
    setCanEdit(false);
    setRestrictionReason(null);
    setConsultationFee('0');
    setPlannedProcedures('');
    setProcedures([]);
    setDiscountType('NONE');
    setDiscountValue('0');
    setPaymentMode('CASH');
    setAmountReceived('0');
    setReason('Staff/Doctor bill adjustment');
    setAutoSyncPayment(true);
    setShowProcPicker(false);
  };

  const loadBillDetails = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_BASE_URL}/api/visits/${visitId}/details`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });

      const data = res.data;
      setBillDetails(data);
      setCanEdit(data.canEdit);
      setRestrictionReason(data.restrictionReason);
      setUserRole(data.userRole || '');
      setIsToday(data.isToday);

      const v = data.visit || {};
      const cFee = v.consultation_fee !== null && v.consultation_fee !== undefined ? String(v.consultation_fee) : '0';
      setConsultationFee(cFee);
      setPlannedProcedures(v.planned_procedures || '');

      // Load procedures
      const loadedProcs = (data.procedures || []).map(p => ({
        id: p.id,
        name: p.name || '',
        amount: String(p.amount || 0),
        area: p.area || '',
        notes: p.notes || '',
        procedure_id: p.procedure_id || null
      }));
      setProcedures(loadedProcs);

      // Discount
      setDiscountType(v.discount_type || 'NONE');
      setDiscountValue(v.discount_value !== null && v.discount_value !== undefined ? String(v.discount_value) : '0');

      // Payment
      const primaryPayment = (data.payments && data.payments.length > 0) ? data.payments[0] : null;
      if (primaryPayment) {
        setPaymentMode((primaryPayment.mode || 'CASH').toUpperCase());
        setAmountReceived(String(primaryPayment.amount_received || v.net_payable || 0));
      } else {
        setPaymentMode('CASH');
        setAmountReceived(String(v.net_payable || 0));
      }
    } catch (err) {
      console.error('Error loading bill details:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to load bill details';
      Alert.alert('Error', errMsg);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const cFeeNum = parseFloat(consultationFee) || 0;
  const procsTotal = procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const medsTotal = (billDetails?.medicines || []).reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
  const subtotal = cFeeNum + procsTotal + medsTotal;

  const dValNum = parseFloat(discountValue) || 0;
  let calculatedDiscount = 0;
  if (discountType === 'PERCENTAGE') {
    calculatedDiscount = Math.round((subtotal * Math.min(100, Math.max(0, dValNum))) / 100);
  } else if (discountType === 'FLAT') {
    calculatedDiscount = Math.min(subtotal, Math.max(0, dValNum));
  }
  const netPayable = Math.max(0, subtotal - calculatedDiscount);

  // Auto-update amountReceived when netPayable changes if enabled
  useEffect(() => {
    if (autoSyncPayment) {
      setAmountReceived(String(netPayable));
    }
  }, [netPayable, autoSyncPayment]);

  const handleAddProcedure = (procItem) => {
    setProcedures(prev => [
      ...prev,
      {
        id: `temp_${Date.now()}_${Math.random()}`,
        name: procItem.name,
        amount: String(procItem.defaultAmount || 0),
        area: procItem.area || '',
        notes: '',
        procedure_id: null
      }
    ]);
    setShowProcPicker(false);
    setCustomProcName('');
    setCustomProcAmount('');
    setCustomProcArea('');
  };

  const handleAddCustomProcedure = () => {
    if (!customProcName.trim()) {
      Alert.alert('Procedure Name Required', 'Please enter a name for the procedure.');
      return;
    }
    handleAddProcedure({
      name: customProcName.trim(),
      defaultAmount: parseFloat(customProcAmount) || 0,
      area: customProcArea.trim()
    });
  };

  const handleRemoveProcedure = (index) => {
    setProcedures(prev => prev.filter((_, i) => i !== index));
  };

  const handleProcedureChange = (index, field, value) => {
    setProcedures(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSaveBill = async () => {
    if (!canEdit) {
      Alert.alert('Permission Denied', restrictionReason || "Staff cannot edit previous days' bills.");
      return;
    }

    if (procedures.some(p => !p.name || !p.name.trim())) {
      Alert.alert('Invalid Procedure', 'Please make sure all procedures have a name or remove empty rows.');
      return;
    }

    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        consultation_fee: cFeeNum,
        procedures: procedures.map(p => ({
          name: p.name.trim(),
          amount: parseFloat(p.amount) || 0,
          area: p.area ? p.area.trim() : '',
          notes: p.notes ? p.notes.trim() : '',
          procedure_id: p.procedure_id || null
        })),
        planned_procedures: plannedProcedures.trim(),
        discount_type: discountType,
        discount_value: dValNum,
        discount_amount: calculatedDiscount,
        payment_mode: paymentMode,
        amount_received: parseFloat(amountReceived) || netPayable,
        reason: reason.trim() || 'Bill edited by user'
      };

      const res = await axios.put(`${API_BASE_URL}/api/visits/${visitId}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Alert.alert('Success', res.data?.message || 'Bill updated successfully!');
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      console.error('Error updating bill:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to update bill';
      Alert.alert('Update Failed', errMsg);
    } finally {
      setSaving(false);
    }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          {/* HEADER */}
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="document-text" size={20} color="#5C0B0B" />
                <Text style={styles.modalTitle}>Edit Prepared Bill</Text>
                <View style={styles.billIdBadge}>
                  <Text style={styles.billIdBadgeText}>#{visitId}</Text>
                </View>
              </View>
              {billDetails && (
                <Text style={styles.patientSubText}>
                  {billDetails.patient?.name} ({billDetails.patient?.skinssence_id || 'Walk-in'}) • {formatDateDisplay(billDetails.visit?.visit_date || billDetails.visit?.created_at)}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#5C0B0B" />
              <Text style={styles.loadingText}>Loading bill details...</Text>
            </View>
          ) : (
            <ScrollView style={styles.bodyScroll} keyboardShouldPersistTaps="handled">
              {/* PERMISSION BANNER */}
              {!canEdit ? (
                <View style={styles.restrictionBanner}>
                  <Ionicons name="alert-circle" size={22} color="#b91c1c" style={{ marginRight: 8, marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.restrictionTitle}>Permission Restricted</Text>
                    <Text style={styles.restrictionBody}>
                      {restrictionReason || "Staff can only edit today's bills. Previous days' bills can only be edited by Doctor or Admin."}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.permissionSuccessBanner}>
                  <Ionicons name="checkmark-circle" size={18} color="#15803d" style={{ marginRight: 6 }} />
                  <Text style={styles.permissionSuccessText}>
                    {isToday ? "✓ Editable (Today's Bill)" : "✓ Doctor/Admin Privilege (Past Bill Editable)"}
                  </Text>
                </View>
              )}

              {/* 1. CONSULTATION FEE */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>1. Consultation Fee</Text>
                  <Text style={styles.sectionSubtitle}>Standard: ₹400 / Review: ₹0</Text>
                </View>

                <View style={styles.feeInputRow}>
                  <Text style={styles.currencyPrefix}>₹</Text>
                  <TextInput
                    style={[styles.numericInput, !canEdit && styles.disabledInput]}
                    keyboardType="numeric"
                    value={consultationFee}
                    onChangeText={setConsultationFee}
                    editable={canEdit}
                    placeholder="0"
                  />
                  <View style={styles.quickFeeGroup}>
                    {[0, 200, 400].map(fee => (
                      <TouchableOpacity
                        key={fee}
                        disabled={!canEdit}
                        style={[
                          styles.quickFeeBtn,
                          consultationFee === String(fee) && styles.quickFeeBtnActive,
                          !canEdit && styles.disabledBtn
                        ]}
                        onPress={() => setConsultationFee(String(fee))}
                      >
                        <Text
                          style={[
                            styles.quickFeeBtnText,
                            consultationFee === String(fee) && styles.quickFeeBtnTextActive
                          ]}
                        >
                          ₹{fee}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Doctor Note / Planned */}
                <Text style={styles.fieldLabel}>Doctor Advice / Procedures Note</Text>
                <TextInput
                  style={[styles.textInputArea, !canEdit && styles.disabledInput]}
                  value={plannedProcedures}
                  onChangeText={setPlannedProcedures}
                  editable={canEdit}
                  placeholder="Doctor's plan, notes, or advice"
                  multiline
                />
              </View>

              {/* 2. PROCEDURES */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View>
                    <Text style={styles.sectionTitle}>2. Procedures & Services</Text>
                    <Text style={styles.sectionSubtitle}>{procedures.length} procedure(s) included</Text>
                  </View>
                  {canEdit && (
                    <TouchableOpacity
                      style={styles.addProcBtn}
                      onPress={() => setShowProcPicker(true)}
                    >
                      <Ionicons name="add-circle" size={16} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.addProcBtnText}>+ Add Procedure</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {procedures.length === 0 ? (
                  <View style={styles.emptyProcBox}>
                    <Ionicons name="sparkles-outline" size={24} color="#94a3b8" />
                    <Text style={styles.emptyProcText}>No procedures in this bill.</Text>
                    {canEdit && (
                      <TouchableOpacity
                        style={styles.emptyAddBtn}
                        onPress={() => setShowProcPicker(true)}
                      >
                        <Text style={styles.emptyAddBtnText}>+ Add First Procedure</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  procedures.map((proc, idx) => (
                    <View key={proc.id || idx} style={styles.procItemCard}>
                      <View style={styles.procItemHeader}>
                        <Text style={styles.procIndexTag}>#{idx + 1}</Text>
                        <TextInput
                          style={[styles.procNameInput, !canEdit && styles.disabledInput]}
                          value={proc.name}
                          onChangeText={(v) => handleProcedureChange(idx, 'name', v)}
                          editable={canEdit}
                          placeholder="Procedure Name"
                        />
                        {canEdit && (
                          <TouchableOpacity
                            onPress={() => handleRemoveProcedure(idx)}
                            style={styles.removeProcBtn}
                          >
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.procItemDetailsRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.procFieldLabel}>Area / Body Part</Text>
                          <TextInput
                            style={[styles.procSmallInput, !canEdit && styles.disabledInput]}
                            value={proc.area}
                            onChangeText={(v) => handleProcedureChange(idx, 'area', v)}
                            editable={canEdit}
                            placeholder="e.g. Full Face, Underarms"
                          />
                        </View>
                        <View style={{ width: 120 }}>
                          <Text style={styles.procFieldLabel}>Fee Amount (₹)</Text>
                          <TextInput
                            style={[styles.procAmountInput, !canEdit && styles.disabledInput]}
                            keyboardType="numeric"
                            value={proc.amount}
                            onChangeText={(v) => handleProcedureChange(idx, 'amount', v)}
                            editable={canEdit}
                            placeholder="0"
                          />
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* 3. PHARMACY MEDICINES (READ-ONLY IN VISIT BILL) */}
              {billDetails?.medicines && billDetails.medicines.length > 0 && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeaderRow}>
                    <View>
                      <Text style={styles.sectionTitle}>3. Prescribed Medicines</Text>
                      <Text style={styles.sectionSubtitle}>Billed in pharmacy (inventory tracked)</Text>
                    </View>
                    <Text style={styles.medsTotalBadge}>₹{medsTotal.toFixed(0)}</Text>
                  </View>
                  {billDetails.medicines.map((m, mIdx) => (
                    <View key={m.id || mIdx} style={styles.medItemRow}>
                      <Text style={styles.medBullet}>💊</Text>
                      <Text style={styles.medNameText}>{m.details || 'Medicine'}</Text>
                      <Text style={styles.medAmountText}>₹{(parseFloat(m.amount) || 0).toFixed(0)}</Text>
                    </View>
                  ))}
                  <Text style={styles.medsFootnote}>
                    * Note: To add or return pharmacy items, use "+ Pharmacy" or Pharmacy Correction.
                  </Text>
                </View>
              )}

              {/* 4. DISCOUNT */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>4. Discount</Text>
                <View style={styles.discountTypeRow}>
                  {[
                    { id: 'NONE', label: 'No Discount' },
                    { id: 'PERCENTAGE', label: 'Percent (%)' },
                    { id: 'FLAT', label: 'Flat Cash (₹)' }
                  ].map(dt => (
                    <TouchableOpacity
                      key={dt.id}
                      disabled={!canEdit}
                      style={[
                        styles.discountTypeBtn,
                        discountType === dt.id && styles.discountTypeBtnActive,
                        !canEdit && styles.disabledBtn
                      ]}
                      onPress={() => {
                        setDiscountType(dt.id);
                        if (dt.id === 'NONE') setDiscountValue('0');
                      }}
                    >
                      <Text
                        style={[
                          styles.discountTypeBtnText,
                          discountType === dt.id && styles.discountTypeBtnTextActive
                        ]}
                      >
                        {dt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {discountType !== 'NONE' && (
                  <View style={styles.discountValueRow}>
                    <Text style={styles.fieldLabel}>
                      {discountType === 'PERCENTAGE' ? 'Discount Percentage (%):' : 'Flat Discount Amount (₹):'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <TextInput
                        style={[styles.discountValueInput, !canEdit && styles.disabledInput]}
                        keyboardType="numeric"
                        value={discountValue}
                        onChangeText={setDiscountValue}
                        editable={canEdit}
                        placeholder="0"
                      />
                      <Text style={styles.discountPreviewText}>
                        = -₹{calculatedDiscount.toLocaleString('en-IN')} off
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* 5. BILL TOTALS & CALCULATION BREAKDOWN */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryHeading}>BILL CALCULATION SUMMARY</Text>
                
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Consultation Fee:</Text>
                  <Text style={styles.summaryVal}>₹{cFeeNum.toLocaleString('en-IN')}</Text>
                </View>

                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Procedures ({procedures.length}):</Text>
                  <Text style={styles.summaryVal}>₹{procsTotal.toLocaleString('en-IN')}</Text>
                </View>

                {medsTotal > 0 && (
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>Pharmacy Medicines:</Text>
                    <Text style={styles.summaryVal}>₹{medsTotal.toLocaleString('en-IN')}</Text>
                  </View>
                )}

                <View style={[styles.summaryLine, styles.subtotalDivider]}>
                  <Text style={styles.subtotalLabel}>Subtotal:</Text>
                  <Text style={styles.subtotalVal}>₹{subtotal.toLocaleString('en-IN')}</Text>
                </View>

                {calculatedDiscount > 0 && (
                  <View style={styles.summaryLine}>
                    <Text style={[styles.summaryLabel, { color: '#dc2626' }]}>
                      Discount ({discountType === 'PERCENTAGE' ? `${discountValue}%` : 'Flat'}):
                    </Text>
                    <Text style={[styles.summaryVal, { color: '#dc2626', fontWeight: 'bold' }]}>
                      -₹{calculatedDiscount.toLocaleString('en-IN')}
                    </Text>
                  </View>
                )}

                <View style={styles.netPayableRow}>
                  <Text style={styles.netPayableLabel}>NET PAYABLE AMOUNT</Text>
                  <Text style={styles.netPayableVal}>₹{netPayable.toLocaleString('en-IN')}</Text>
                </View>
              </View>

              {/* 6. PAYMENT MODE & AMOUNT RECEIVED */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>5. Payment Receipt</Text>
                
                <Text style={styles.fieldLabel}>Payment Mode</Text>
                <View style={styles.paymentModesRow}>
                  {['CASH', 'UPI', 'CARD', 'WALLET'].map(mode => (
                    <TouchableOpacity
                      key={mode}
                      disabled={!canEdit}
                      style={[
                        styles.paymentModeChip,
                        paymentMode === mode && styles.paymentModeChipActive,
                        !canEdit && styles.disabledBtn
                      ]}
                      onPress={() => setPaymentMode(mode)}
                    >
                      <Text
                        style={[
                          styles.paymentModeChipText,
                          paymentMode === mode && styles.paymentModeChipTextActive
                        ]}
                      >
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.fieldLabel}>Amount Received (₹)</Text>
                    <TouchableOpacity
                      disabled={!canEdit}
                      onPress={() => {
                        setAutoSyncPayment(true);
                        setAmountReceived(String(netPayable));
                      }}
                    >
                      <Text style={{ fontSize: 11, color: '#5C0B0B', fontWeight: '600' }}>
                        Match Net Payable (₹{netPayable})
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.numericInput, !canEdit && styles.disabledInput]}
                    keyboardType="numeric"
                    value={amountReceived}
                    onChangeText={(val) => {
                      setAutoSyncPayment(false);
                      setAmountReceived(val);
                    }}
                    editable={canEdit}
                    placeholder="0"
                  />
                </View>

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.fieldLabel}>Reason / Edit Remarks</Text>
                  <TextInput
                    style={[styles.singleTextInput, !canEdit && styles.disabledInput]}
                    value={reason}
                    onChangeText={setReason}
                    editable={canEdit}
                    placeholder="e.g. Corrected consultation fee, added procedure"
                  />
                </View>
              </View>
            </ScrollView>
          )}

          {/* FOOTER ACTIONS */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>

            {canEdit && (
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.disabledBtn]}
                onPress={handleSaveBill}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="save" size={17} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.saveBtnText}>Save & Update Bill</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* QUICK PROCEDURE SELECTION SUB-MODAL */}
        <Modal
          visible={showProcPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowProcPicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContent}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>Add Procedure to Bill</Text>
                <TouchableOpacity onPress={() => setShowProcPicker(false)}>
                  <Ionicons name="close-circle" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380 }}>
                {/* Custom Procedure Input */}
                <View style={styles.customProcBox}>
                  <Text style={styles.customProcBoxTitle}>Custom Procedure</Text>
                  <TextInput
                    style={styles.customInput}
                    placeholder="Procedure Name (e.g. Laser Peeling)"
                    value={customProcName}
                    onChangeText={setCustomProcName}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <TextInput
                      style={[styles.customInput, { flex: 1 }]}
                      placeholder="Area (e.g. Face)"
                      value={customProcArea}
                      onChangeText={setCustomProcArea}
                    />
                    <TextInput
                      style={[styles.customInput, { width: 110 }]}
                      placeholder="Amount (₹)"
                      keyboardType="numeric"
                      value={customProcAmount}
                      onChangeText={setCustomProcAmount}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.addCustomBtn}
                    onPress={handleAddCustomProcedure}
                  >
                    <Text style={styles.addCustomBtnText}>+ Add Custom Procedure</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.quickListHeading}>Common Clinic Procedures:</Text>
                {QUICK_PROCEDURES.map((p, pIdx) => (
                  <TouchableOpacity
                    key={pIdx}
                    style={styles.quickProcItem}
                    onPress={() => handleAddProcedure(p)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quickProcName}>{p.name}</Text>
                    </View>
                    <Text style={styles.quickProcAmount}>₹{p.defaultAmount.toLocaleString('en-IN')}</Text>
                    <Ionicons name="add-circle-outline" size={20} color="#5C0B0B" style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
    minHeight: '60%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  billIdBadge: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  billIdBadgeText: {
    color: '#991b1b',
    fontWeight: 'bold',
    fontSize: 12
  },
  patientSubText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 3
  },
  closeBtn: {
    padding: 6
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b'
  },
  bodyScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  restrictionBanner: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#f87171',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14
  },
  restrictionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: 2
  },
  restrictionBody: {
    fontSize: 12.5,
    color: '#7f1d1d',
    lineHeight: 17
  },
  permissionSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12
  },
  permissionSuccessText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '600'
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1
  },
  feeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#475569',
    marginRight: 6
  },
  numericInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    backgroundColor: '#fff',
    minWidth: 90
  },
  quickFeeGroup: {
    flexDirection: 'row',
    marginLeft: 10,
    gap: 6,
    flex: 1
  },
  quickFeeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc'
  },
  quickFeeBtnActive: {
    backgroundColor: '#5C0B0B',
    borderColor: '#5C0B0B'
  },
  quickFeeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155'
  },
  quickFeeBtnTextActive: {
    color: '#fff'
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4
  },
  textInputArea: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 50,
    backgroundColor: '#fff'
  },
  singleTextInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#fff'
  },
  addProcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C0B0B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  addProcBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  emptyProcBox: {
    alignItems: 'center',
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    borderRadius: 8
  },
  emptyProcText: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4
  },
  emptyAddBtn: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  emptyAddBtnText: {
    color: '#5C0B0B',
    fontWeight: 'bold',
    fontSize: 12
  },
  procItemCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  procItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  procIndexTag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    marginRight: 6
  },
  procNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    backgroundColor: '#fff'
  },
  removeProcBtn: {
    padding: 6,
    marginLeft: 6
  },
  procItemDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  procFieldLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2
  },
  procSmallInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 12,
    color: '#0f172a',
    backgroundColor: '#fff'
  },
  procAmountInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
    backgroundColor: '#fff',
    textAlign: 'right'
  },
  medsTotalBadge: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    color: '#166534',
    fontWeight: 'bold',
    fontSize: 13
  },
  medItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  medBullet: {
    fontSize: 12,
    marginRight: 6
  },
  medNameText: {
    flex: 1,
    fontSize: 13,
    color: '#334155'
  },
  medAmountText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  medsFootnote: {
    fontSize: 11,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 6
  },
  discountTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10
  },
  discountTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center'
  },
  discountTypeBtnActive: {
    backgroundColor: '#5C0B0B',
    borderColor: '#5C0B0B'
  },
  discountTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  discountTypeBtnTextActive: {
    color: '#fff'
  },
  discountValueRow: {
    marginTop: 4
  },
  discountValueInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    backgroundColor: '#fff',
    width: 100
  },
  discountPreviewText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#dc2626',
    marginLeft: 10
  },
  summaryCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12
  },
  summaryHeading: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 8
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3
  },
  summaryLabel: {
    fontSize: 13,
    color: '#cbd5e1'
  },
  summaryVal: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '600'
  },
  subtotalDivider: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 6,
    marginTop: 4
  },
  subtotalLabel: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#cbd5e1'
  },
  subtotalVal: {
    fontSize: 13.5,
    fontWeight: 'bold',
    color: '#fff'
  },
  netPayableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderTopColor: '#475569',
    paddingTop: 10,
    marginTop: 8
  },
  netPayableLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fbbf24'
  },
  netPayableVal: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fbbf24'
  },
  paymentModesRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6
  },
  paymentModeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center'
  },
  paymentModeChipActive: {
    backgroundColor: '#15803d',
    borderColor: '#15803d'
  },
  paymentModeChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155'
  },
  paymentModeChipTextActive: {
    color: '#fff'
  },
  disabledInput: {
    backgroundColor: '#f1f5f9',
    color: '#64748b'
  },
  disabledBtn: {
    opacity: 0.5
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 10
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center'
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569'
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#5C0B0B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff'
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 20
  },
  pickerContent: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxHeight: '85%'
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  customProcBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14
  },
  customProcBoxTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 6
  },
  customInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    backgroundColor: '#fff'
  },
  addCustomBtn: {
    backgroundColor: '#5C0B0B',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8
  },
  addCustomBtnText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: 'bold'
  },
  quickListHeading: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 8
  },
  quickProcItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  quickProcName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1e293b'
  },
  quickProcAmount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#5C0B0B'
  }
});
