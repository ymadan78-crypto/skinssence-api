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

const API_BASE_URL = 'https://skinssence-api-1.onrender.com';

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

function parseMedicineDetailsString(details) {
  if (!details || typeof details !== 'string') return { name: 'Medicine', qty: 1, batch: '' };
  let name = details;
  let batch = '';
  let qty = 1;

  const qtyMatch = details.match(/\(Qty:\s*(\d+)\)/i);
  if (qtyMatch) qty = parseInt(qtyMatch[1], 10) || 1;

  const batchMatch = details.match(/\[Batch:\s*([^\]]+)\]/i);
  if (batchMatch) batch = batchMatch[1].trim();

  name = details.split('[')[0].split('(Qty:')[0].split('|')[0].trim();
  return { name: name || details, qty, batch };
}

export default function EditBillModal({ visible, visitId, initialVisit, initialPatient, onClose, onUpdated }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billDetails, setBillDetails] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [restrictionReason, setRestrictionReason] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [isToday, setIsToday] = useState(false);

  // Form State: 1. Consultation Fee
  const [consultationFee, setConsultationFee] = useState('0');

  // Form State: 2. Procedures
  const [plannedProcedures, setPlannedProcedures] = useState('');
  const [procedures, setProcedures] = useState([]);

  // Form State: 3. Pharmacy Medicines
  const [medicines, setMedicines] = useState([]);

  // Form State: 4. Discount
  const [discountType, setDiscountType] = useState('NONE'); // NONE, PERCENTAGE, FLAT
  const [discountValue, setDiscountValue] = useState('0');

  // Form State: 5. Payment Receipt & Split Payments
  const [paymentMode, setPaymentMode] = useState('CASH'); // CASH, UPI, CARD, SPLIT
  const [amountReceived, setAmountReceived] = useState('0');
  const [splitCash, setSplitCash] = useState('0');
  const [splitUpi, setSplitUpi] = useState('0');
  const [splitUpiMode, setSplitUpiMode] = useState('UPI'); // UPI, UPI (Clinic), UPI (Store)
  const [reason, setReason] = useState('Staff/Doctor bill adjustment');
  const [autoSyncPayment, setAutoSyncPayment] = useState(true);

  // Modals
  const [showProcPicker, setShowProcPicker] = useState(false);
  const [customProcName, setCustomProcName] = useState('');
  const [customProcAmount, setCustomProcAmount] = useState('');
  const [customProcArea, setCustomProcArea] = useState('');

  const [showMedPicker, setShowMedPicker] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [medSearch, setMedSearch] = useState('');
  const [customMedName, setCustomMedName] = useState('');
  const [customMedQty, setCustomMedQty] = useState('1');
  const [customMedAmount, setCustomMedAmount] = useState('');

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
    setMedicines([]);
    setDiscountType('NONE');
    setDiscountValue('0');
    setPaymentMode('CASH');
    setAmountReceived('0');
    setSplitCash('0');
    setSplitUpi('0');
    setSplitUpiMode('UPI');
    setReason('Staff/Doctor bill adjustment');
    setAutoSyncPayment(true);
    setShowProcPicker(false);
    setShowMedPicker(false);
  };

  const loadInventory = async () => {
    if (inventoryItems.length > 0) return;
    setInventoryLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_BASE_URL}/api/inventory`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setInventoryItems(res.data);
      }
    } catch (err) {
      console.log('Error fetching inventory in EditBillModal:', err.message);
    } finally {
      setInventoryLoading(false);
    }
  };

  const loadBillDetails = async () => {
    if (typeof visitId === 'string' && visitId.startsWith('pkg_')) {
      Alert.alert('Package Bill', 'Prepaid package entries can be reviewed and edited from the Packages section.');
      onClose();
      return;
    }

    // Pre-populate from initialVisit if available
    if (initialVisit) {
      const v = initialVisit;
      setConsultationFee(v.consultation_fee !== null && v.consultation_fee !== undefined ? String(v.consultation_fee) : '0');
      setPlannedProcedures(v.planned_procedures || '');
      if (Array.isArray(v.procedures) && v.procedures.length > 0) {
        setProcedures(v.procedures.map(p => ({
          id: p.id || `temp_${Math.random()}`,
          name: p.name || '',
          amount: String(p.amount || 0),
          area: p.area || '',
          notes: p.notes || ''
        })));
      }
      if (Array.isArray(v.medicines) && v.medicines.length > 0) {
        setMedicines(v.medicines.map((m, idx) => {
          const parsed = parseMedicineDetailsString(m.details || m.name);
          return {
            id: m.id || `init_med_${idx}_${Date.now()}`,
            name: parsed.name,
            qty: String(parsed.qty || 1),
            amount: String(m.amount !== undefined && m.amount !== null ? m.amount : 0),
            batch: parsed.batch || ''
          };
        }));
      }
      setDiscountType(v.discount_type || 'NONE');
      setDiscountValue(v.discount_value !== null && v.discount_value !== undefined ? String(v.discount_value) : '0');

      if (Array.isArray(v.payments) && v.payments.length > 1) {
        const cashPay = v.payments.find(p => (p.mode || '').toUpperCase().includes('CASH'));
        const upiPay = v.payments.find(p => (p.mode || '').toUpperCase().includes('UPI'));
        if (cashPay || upiPay) {
          setPaymentMode('SPLIT');
          setSplitCash(String(cashPay ? cashPay.amount_received : 0));
          setSplitUpi(String(upiPay ? upiPay.amount_received : 0));
          setSplitUpiMode(upiPay ? upiPay.mode : 'UPI');
        }
      } else if (Array.isArray(v.payments) && v.payments.length > 0) {
        setPaymentMode((v.payments[0].mode || 'CASH').toUpperCase());
        setAmountReceived(String(v.payments[0].amount_received || v.net_payable || 0));
      }
    }

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

      // Load medicines
      const loadedMeds = (data.medicines || []).map((m, idx) => {
        const parsed = parseMedicineDetailsString(m.details);
        return {
          id: m.id || `med_${idx}_${Date.now()}`,
          name: parsed.name,
          qty: String(parsed.qty || 1),
          amount: String(m.amount !== undefined && m.amount !== null ? m.amount : 0),
          batch: parsed.batch || ''
        };
      });
      setMedicines(loadedMeds);

      // Discount
      setDiscountType(v.discount_type || 'NONE');
      setDiscountValue(v.discount_value !== null && v.discount_value !== undefined ? String(v.discount_value) : '0');

      // Payment & Split Detection
      const pays = data.payments || [];
      if (pays.length > 1) {
        const cashPay = pays.find(p => (p.mode || '').toUpperCase().includes('CASH'));
        const upiPay = pays.find(p => (p.mode || '').toUpperCase().includes('UPI'));
        if (cashPay || upiPay) {
          setPaymentMode('SPLIT');
          setSplitCash(String(cashPay ? cashPay.amount_received : 0));
          setSplitUpi(String(upiPay ? upiPay.amount_received : 0));
          setSplitUpiMode(upiPay ? upiPay.mode : 'UPI');
        } else {
          setPaymentMode('SPLIT');
          setSplitCash(String(pays[0]?.amount_received || 0));
          setSplitUpi(String(pays[1]?.amount_received || 0));
        }
      } else if (pays.length === 1) {
        const p = pays[0];
        const pMode = (p.mode || 'CASH').toUpperCase();
        if (pMode === 'SPLIT') {
          setPaymentMode('SPLIT');
          const half = Math.round((v.net_payable || 0) / 2);
          setSplitCash(String(half));
          setSplitUpi(String((v.net_payable || 0) - half));
        } else {
          setPaymentMode(pMode);
          setAmountReceived(String(p.amount_received !== undefined && p.amount_received !== null ? p.amount_received : (v.net_payable || 0)));
        }
      } else {
        setPaymentMode('CASH');
        setAmountReceived(String(v.net_payable || 0));
      }
    } catch (err) {
      console.error('Error loading bill details:', err);
      if (err.response?.status === 404) {
        Alert.alert(
          'Render Deployment Required',
          'The backend on Render is still deploying the latest updates.\n\nPlease check your Render Dashboard (dashboard.render.com) -> skinssence-api-1. Once live, bill editing will be fully operational.'
        );
      } else {
        const errMsg = err.response?.data?.error || err.message || 'Failed to load bill details';
        Alert.alert('Error', errMsg);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  // Calculations
  const cFeeNum = parseFloat(consultationFee) || 0;
  const procsTotal = procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const medsTotal = medicines.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
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
      if (paymentMode === 'SPLIT') {
        const cashVal = parseFloat(splitCash) || 0;
        if (cashVal > 0 && cashVal <= netPayable) {
          setSplitUpi(String(netPayable - cashVal));
        } else if (cashVal === 0) {
          setSplitUpi(String(netPayable));
        }
      }
    }
  }, [netPayable, autoSyncPayment]);

  // --- Procedures Handlers ---
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

  // --- Medicines Handlers ---
  const handleAddMedicine = (medItem) => {
    setMedicines(prev => [
      ...prev,
      {
        id: `temp_med_${Date.now()}_${Math.random()}`,
        name: medItem.name,
        qty: String(medItem.qty || 1),
        amount: String(medItem.amount || 0),
        batch: medItem.batch || ''
      }
    ]);
    setShowMedPicker(false);
    setCustomMedName('');
    setCustomMedQty('1');
    setCustomMedAmount('');
  };

  const handleAddCustomMedicine = () => {
    if (!customMedName.trim()) {
      Alert.alert('Medicine Name Required', 'Please enter a name for the medicine.');
      return;
    }
    handleAddMedicine({
      name: customMedName.trim(),
      qty: parseInt(customMedQty, 10) || 1,
      amount: parseFloat(customMedAmount) || 0,
      batch: ''
    });
  };

  const handleRemoveMedicine = (index) => {
    setMedicines(prev => prev.filter((_, i) => i !== index));
  };

  const handleMedicineChange = (index, field, value) => {
    setMedicines(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // --- Save Handler ---
  const handleSaveBill = async () => {
    if (!canEdit) {
      Alert.alert('Permission Denied', restrictionReason || "Staff cannot edit previous days' bills.");
      return;
    }

    if (procedures.some(p => !p.name || !p.name.trim())) {
      Alert.alert('Invalid Procedure', 'Please make sure all procedures have a name or remove empty rows.');
      return;
    }

    if (medicines.some(m => !m.name || !m.name.trim())) {
      Alert.alert('Invalid Medicine', 'Please make sure all medicines have a name or remove empty rows.');
      return;
    }

    const isSplit = paymentMode === 'SPLIT';
    const cashAmt = parseFloat(splitCash) || 0;
    const upiAmt = parseFloat(splitUpi) || 0;

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
        medicines: medicines.map(m => ({
          name: m.name.trim(),
          qty: parseInt(m.qty, 10) || 1,
          amount: parseFloat(m.amount) || 0,
          batch: m.batch ? m.batch.trim() : ''
        })),
        planned_procedures: plannedProcedures.trim(),
        discount_type: discountType,
        discount_value: dValNum,
        discount_amount: calculatedDiscount,
        payment_mode: paymentMode,
        split_payments: isSplit ? [
          { mode: 'CASH', amount: cashAmt },
          { mode: splitUpiMode || 'UPI', amount: upiAmt }
        ] : null,
        amount_received: isSplit ? (cashAmt + upiAmt) : (parseFloat(amountReceived) || netPayable),
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
              </View>

              {/* 2. CLINIC PROCEDURES */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.sectionTitle}>2. Clinic Procedures</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{procedures.length}</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionSubtitle}>Services performed in clinic</Text>
                  </View>
                  {canEdit && (
                    <TouchableOpacity
                      style={styles.addProcBtn}
                      onPress={() => setShowProcPicker(true)}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                      <Text style={styles.addProcBtnText}>+ Add Proc</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {procedures.length === 0 ? (
                  <View style={styles.emptyProcBox}>
                    <Ionicons name="bandage-outline" size={26} color="#94a3b8" />
                    <Text style={styles.emptyProcText}>No procedures in this bill</Text>
                    {canEdit && (
                      <TouchableOpacity
                        style={styles.emptyAddBtn}
                        onPress={() => setShowProcPicker(true)}
                      >
                        <Text style={styles.emptyAddBtnText}>+ Add Procedure</Text>
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

              {/* 3. PHARMACY MEDICINES (EDITABLE & EXPANDABLE) */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.sectionTitle}>3. Prescribed Medicines</Text>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{medicines.length}</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionSubtitle}>Edit quantities, amounts, or add new medicines</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.medsTotalBadge}>Total: ₹{medsTotal.toLocaleString('en-IN')}</Text>
                    {canEdit && (
                      <TouchableOpacity
                        style={styles.addMedBtn}
                        onPress={() => {
                          loadInventory();
                          setShowMedPicker(true);
                        }}
                      >
                        <Ionicons name="add" size={15} color="#fff" />
                        <Text style={styles.addProcBtnText}>+ Add Med</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {medicines.length === 0 ? (
                  <View style={styles.emptyProcBox}>
                    <Ionicons name="medkit-outline" size={26} color="#94a3b8" />
                    <Text style={styles.emptyProcText}>No pharmacy medicines in this visit bill</Text>
                    {canEdit && (
                      <TouchableOpacity
                        style={styles.emptyAddBtn}
                        onPress={() => {
                          loadInventory();
                          setShowMedPicker(true);
                        }}
                      >
                        <Text style={styles.emptyAddBtnText}>+ Add Medicine from Pharmacy</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  medicines.map((med, mIdx) => (
                    <View key={med.id || mIdx} style={styles.medItemCard}>
                      <View style={styles.medItemTopRow}>
                        <Text style={styles.medBulletTag}>💊 #{mIdx + 1}</Text>
                        <TextInput
                          style={[styles.medNameInput, !canEdit && styles.disabledInput]}
                          value={med.name}
                          onChangeText={(v) => handleMedicineChange(mIdx, 'name', v)}
                          editable={canEdit}
                          placeholder="Medicine Name"
                        />
                        {canEdit && (
                          <TouchableOpacity
                            onPress={() => handleRemoveMedicine(mIdx)}
                            style={styles.removeProcBtn}
                          >
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.medItemBottomRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.procFieldLabel}>Quantity (Units/Strips)</Text>
                          <TextInput
                            style={[styles.procSmallInput, !canEdit && styles.disabledInput]}
                            keyboardType="numeric"
                            value={med.qty}
                            onChangeText={(v) => handleMedicineChange(mIdx, 'qty', v)}
                            editable={canEdit}
                            placeholder="1"
                          />
                        </View>
                        <View style={{ width: 130 }}>
                          <Text style={styles.procFieldLabel}>Line Total (₹)</Text>
                          <TextInput
                            style={[styles.procAmountInput, !canEdit && styles.disabledInput]}
                            keyboardType="numeric"
                            value={med.amount}
                            onChangeText={(v) => handleMedicineChange(mIdx, 'amount', v)}
                            editable={canEdit}
                            placeholder="0"
                          />
                        </View>
                      </View>
                      {med.batch ? (
                        <Text style={styles.medBatchNote}>Batch: {med.batch}</Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>

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
                    <Text style={styles.summaryLabel}>Pharmacy Medicines ({medicines.length}):</Text>
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

              {/* 6. PAYMENT RECEIPT & SPLIT (CASH + UPI) */}
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>5. Payment Receipt</Text>
                
                <Text style={styles.fieldLabel}>Payment Mode</Text>
                <View style={styles.paymentModesRow}>
                  {['CASH', 'UPI', 'CARD', 'SPLIT'].map(mode => (
                    <TouchableOpacity
                      key={mode}
                      disabled={!canEdit}
                      style={[
                        styles.paymentModeChip,
                        paymentMode === mode && styles.paymentModeChipActive,
                        !canEdit && styles.disabledBtn
                      ]}
                      onPress={() => {
                        setPaymentMode(mode);
                        if (mode === 'SPLIT') {
                          const half = Math.round(netPayable / 2);
                          if (parseFloat(splitCash) === 0 && parseFloat(splitUpi) === 0) {
                            setSplitCash(String(half));
                            setSplitUpi(String(netPayable - half));
                          }
                        }
                      }}
                    >
                      <Text
                        style={[
                          styles.paymentModeChipText,
                          paymentMode === mode && styles.paymentModeChipTextActive
                        ]}
                      >
                        {mode === 'SPLIT' ? '⚡ SPLIT (Cash+UPI)' : mode}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* SPLIT PAYMENT BOX */}
                {paymentMode === 'SPLIT' ? (
                  <View style={styles.splitBox}>
                    <View style={styles.splitHeaderRow}>
                      <Ionicons name="git-branch-outline" size={16} color="#0369a1" />
                      <Text style={styles.splitBoxTitle}>Split Payment Breakdown (Cash + UPI)</Text>
                    </View>

                    <View style={styles.splitInputsRow}>
                      {/* CASH INPUT */}
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.splitInputLabel}>💵 Cash Amount (₹)</Text>
                        <TextInput
                          style={[styles.splitNumericInput, !canEdit && styles.disabledInput]}
                          keyboardType="numeric"
                          value={splitCash}
                          onChangeText={(val) => {
                            setSplitCash(val);
                            const cashVal = parseFloat(val) || 0;
                            const remaining = Math.max(0, netPayable - cashVal);
                            setSplitUpi(String(remaining));
                          }}
                          editable={canEdit}
                          placeholder="0"
                        />
                      </View>

                      {/* UPI INPUT */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.splitInputLabel}>📱 UPI Amount (₹)</Text>
                        <TextInput
                          style={[styles.splitNumericInput, !canEdit && styles.disabledInput]}
                          keyboardType="numeric"
                          value={splitUpi}
                          onChangeText={(val) => setSplitUpi(val)}
                          editable={canEdit}
                          placeholder="0"
                        />
                      </View>
                    </View>

                    {/* UPI SUB-TYPE SELECTOR */}
                    <View style={styles.upiModeSelectorRow}>
                      <Text style={styles.upiSubLabel}>UPI Account:</Text>
                      {['UPI', 'UPI (Clinic)', 'UPI (Store)'].map(um => (
                        <TouchableOpacity
                          key={um}
                          disabled={!canEdit}
                          style={[
                            styles.upiChip,
                            splitUpiMode === um && styles.upiChipActive
                          ]}
                          onPress={() => setSplitUpiMode(um)}
                        >
                          <Text style={[styles.upiChipText, splitUpiMode === um && styles.upiChipTextActive]}>
                            {um}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* SPLIT BALANCING BANNER */}
                    {(() => {
                      const cashAmt = parseFloat(splitCash) || 0;
                      const upiAmt = parseFloat(splitUpi) || 0;
                      const totalSplit = cashAmt + upiAmt;
                      const diff = totalSplit - netPayable;
                      const isBalanced = Math.abs(diff) < 0.5;

                      return (
                        <View style={[styles.splitStatusBanner, isBalanced ? styles.splitStatusOk : styles.splitStatusWarning]}>
                          <Ionicons
                            name={isBalanced ? 'checkmark-circle' : 'alert-circle'}
                            size={16}
                            color={isBalanced ? '#15803d' : '#b45309'}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={[styles.splitStatusText, { color: isBalanced ? '#15803d' : '#b45309' }]}>
                            {isBalanced
                              ? `Total ₹${totalSplit} matches Net Payable (₹${netPayable})`
                              : diff < 0
                                ? `Short by ₹${Math.abs(diff)} (Total: ₹${totalSplit} / Net: ₹${netPayable})`
                                : `Excess by ₹${diff} (Total: ₹${totalSplit} / Net: ₹${netPayable})`
                            }
                          </Text>
                          {!isBalanced && canEdit && (
                            <TouchableOpacity
                              style={styles.autoBalanceBtn}
                              onPress={() => {
                                const rem = Math.max(0, netPayable - cashAmt);
                                setSplitUpi(String(rem));
                              }}
                            >
                              <Text style={styles.autoBalanceBtnText}>Balance UPI</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                ) : (
                  /* SINGLE PAYMENT AMOUNT INPUT */
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
                )}

                <View style={{ marginTop: 12 }}>
                  <Text style={styles.fieldLabel}>Reason / Edit Remarks</Text>
                  <TextInput
                    style={[styles.singleTextInput, !canEdit && styles.disabledInput]}
                    value={reason}
                    onChangeText={setReason}
                    editable={canEdit}
                    placeholder="e.g. Corrected consultation fee, updated pharmacy items, split payment"
                  />
                </View>
              </View>
            </ScrollView>
          )}

          {/* FOOTER ACTIONS - ELEVATED WITH HIGH PADDING FOR ANDROID NAVIGATION BAR */}
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

        {/* QUICK MEDICINE SELECTION SUB-MODAL */}
        <Modal
          visible={showMedPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowMedPicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContent}>
              <View style={styles.pickerHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="medkit" size={20} color="#5C0B0B" />
                  <Text style={styles.pickerTitle}>Add Medicine to Bill</Text>
                </View>
                <TouchableOpacity onPress={() => setShowMedPicker(false)}>
                  <Ionicons name="close-circle" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                {/* Custom Medicine Input Box */}
                <View style={styles.customProcBox}>
                  <Text style={styles.customProcBoxTitle}>Custom Medicine Item</Text>
                  <TextInput
                    style={styles.customInput}
                    placeholder="Medicine Name (e.g. Sebogel / Sunscreen)"
                    value={customMedName}
                    onChangeText={setCustomMedName}
                  />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                    <TextInput
                      style={[styles.customInput, { width: 90 }]}
                      placeholder="Qty (e.g. 1)"
                      keyboardType="numeric"
                      value={customMedQty}
                      onChangeText={setCustomMedQty}
                    />
                    <TextInput
                      style={[styles.customInput, { flex: 1 }]}
                      placeholder="Total Price (₹)"
                      keyboardType="numeric"
                      value={customMedAmount}
                      onChangeText={setCustomMedAmount}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.addCustomBtn}
                    onPress={handleAddCustomMedicine}
                  >
                    <Text style={styles.addCustomBtnText}>+ Add Custom Medicine</Text>
                  </TouchableOpacity>
                </View>

                {/* Search from Inventory */}
                <View style={{ marginTop: 12, marginBottom: 8 }}>
                  <Text style={styles.quickListHeading}>Or Select from Pharmacy Stock:</Text>
                  <View style={styles.searchBarContainer}>
                    <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.searchBarInput}
                      placeholder="Search medicine name..."
                      value={medSearch}
                      onChangeText={setMedSearch}
                    />
                    {medSearch ? (
                      <TouchableOpacity onPress={() => setMedSearch('')}>
                        <Ionicons name="close-circle" size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {inventoryLoading ? (
                  <ActivityIndicator size="small" color="#5C0B0B" style={{ marginVertical: 14 }} />
                ) : (
                  (inventoryItems || [])
                    .filter(item => {
                      if (!medSearch.trim()) return true;
                      return (item.medicine_name || '').toLowerCase().includes(medSearch.toLowerCase().trim());
                    })
                    .slice(0, 25)
                    .map((item, iIdx) => (
                      <TouchableOpacity
                        key={item.id || iIdx}
                        style={styles.quickProcItem}
                        onPress={() => {
                          handleAddMedicine({
                            name: item.medicine_name,
                            qty: 1,
                            amount: item.mrp || 0,
                            batch: item.batch_number || ''
                          });
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quickProcName}>{item.medicine_name}</Text>
                          <Text style={styles.quickProcSub}>
                            Stock: {item.quantity || 0} {item.unit || 'units'} {item.batch_number ? `• Batch: ${item.batch_number}` : ''}
                          </Text>
                        </View>
                        <Text style={styles.quickProcAmount}>₹{(parseFloat(item.mrp) || 0).toLocaleString('en-IN')}</Text>
                        <Ionicons name="add-circle-outline" size={20} color="#5C0B0B" style={{ marginLeft: 8 }} />
                      </TouchableOpacity>
                    ))
                )}
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
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
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
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14
  },
  permissionSuccessText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#166534'
  },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  countBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569'
  },
  feeInputRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#334155',
    marginRight: 6
  },
  numericInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
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
    backgroundColor: '#fff',
    marginTop: 4
  },
  quickFeeGroup: {
    flexDirection: 'row',
    marginLeft: 10,
    gap: 6
  },
  quickFeeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  quickFeeBtnActive: {
    backgroundColor: '#5C0B0B',
    borderColor: '#5C0B0B'
  },
  quickFeeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  quickFeeBtnTextActive: {
    color: '#fff'
  },
  addProcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C0B0B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  addMedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4
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
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0369a1'
  },
  medItemCard: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  medItemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  medBulletTag: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0284c7',
    marginRight: 6
  },
  medNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    backgroundColor: '#fff'
  },
  medItemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  medBatchNote: {
    fontSize: 11,
    color: '#0369a1',
    marginTop: 4,
    fontStyle: 'italic'
  },
  discountTypeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  discountTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
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
    fontWeight: 'bold',
    color: '#334155'
  },
  discountTypeBtnTextActive: {
    color: '#fff'
  },
  discountValueRow: {
    marginTop: 6
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4
  },
  discountValueInput: {
    width: 120,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
    backgroundColor: '#fff'
  },
  discountPreviewText: {
    marginLeft: 12,
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '600'
  },
  summaryCard: {
    backgroundColor: '#1e293b',
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
    fontSize: 11.5,
    fontWeight: 'bold',
    color: '#334155'
  },
  paymentModeChipTextActive: {
    color: '#fff'
  },
  splitBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    padding: 12,
    marginTop: 10
  },
  splitHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8
  },
  splitBoxTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#15803d'
  },
  splitInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  splitInputLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 3
  },
  splitNumericInput: {
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    backgroundColor: '#fff'
  },
  upiModeSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8
  },
  upiSubLabel: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  upiChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  upiChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7'
  },
  upiChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  upiChipTextActive: {
    color: '#fff'
  },
  splitStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1
  },
  splitStatusOk: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac'
  },
  splitStatusWarning: {
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d'
  },
  splitStatusText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600'
  },
  autoBalanceBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    marginLeft: 6
  },
  autoBalanceBtnText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: 'bold'
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 38 : 28, // High elevation above Android 3-button & gesture nav bar
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 12
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    backgroundColor: '#f8fafc'
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569'
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#5C0B0B',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#5C0B0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  saveBtnText: {
    fontSize: 15,
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
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a'
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
  quickProcSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  quickProcAmount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#5C0B0B'
  }
});
