import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Modal, FlatList } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import DiscountControl from '../components/DiscountControl';

export default function VisitEntryScreen({ route, navigation }) {
  const { patient, isPastVisit } = route.params;
  const [loading, setLoading] = useState(false);
  const [activePackages, setActivePackages] = useState([]);
  const [masterProcedures, setMasterProcedures] = useState([]);
  
  // UI Toggles
  const [entryMode, setEntryMode] = useState('STANDARD');
  
  // Date Picker
  const [visitDate, setVisitDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Consultation Fee Engine
  const [consultationFee, setConsultationFee] = useState('400');
  const [consultationNote, setConsultationNote] = useState('New consultation (>14 days)');
  const [existingVisitId, setExistingVisitId] = useState(null);
  const [alreadyPaidAtRegistration, setAlreadyPaidAtRegistration] = useState(0);

  // Dynamic Procedures
  const [procedures, setProcedures] = useState([]);
  
  // Master Proc Modal
  const [showProcModal, setShowProcModal] = useState(false);
  const [activeProcIndex, setActiveProcIndex] = useState(0);
  const [newProcName, setNewProcName] = useState('');
  const [addingNewProc, setAddingNewProc] = useState(false);

  // Synchronized Pharmacy Bill State
  const [pharmacyMeds, setPharmacyMeds] = useState([]);
  const [pharmacyTotal, setPharmacyTotal] = useState(0);
  const [pharmacyPaid, setPharmacyPaid] = useState(0);
  const [fetchingPharmacy, setFetchingPharmacy] = useState(false);

  // Concession / Discount State
  const [discount, setDiscount] = useState({ type: 'NONE', value: 0, amount: 0 });
  const [procedurePaidToday, setProcedurePaidToday] = useState(true);

  const [formData, setFormData] = useState({
    notes: '',
    package_redeemed_id: '',
    new_package_name: '',
    new_package_sessions: '',
    new_package_amount: '',
    payment_mode: 'CASH',
    amount_received: '',
    planned_procedures: ''
  });

  // Next Follow-Up / Appointment Scheduler
  const [nextFollowupDays, setNextFollowupDays] = useState(null);
  const [nextFollowupDate, setNextFollowupDate] = useState('');
  const [nextFollowupTime, setNextFollowupTime] = useState('11:00 AM');

  const selectFollowupDays = (days) => {
    if (days === null) {
      setNextFollowupDays(null);
      setNextFollowupDate('');
      return;
    }
    setNextFollowupDays(days);
    const baseDate = isPastVisit ? new Date(visitDate) : new Date();
    const targetDate = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const formatted = `${yyyy}-${mm}-${dd}`;
    setNextFollowupDate(formatted);
  };

  const API_URL = 'https://skinssence-api.onrender.com/api';

  const getDateStr = (d) => {
    return d.toISOString().split('T')[0];
  };

  useEffect(() => {
    fetchActivePackages();
    fetchMasterProcedures();
    fetchPharmacyForDate(visitDate);
    if (!isPastVisit) {
      fetchLastVisit();
    }
  }, []);

  // Fetch pharmacy bill whenever visit date changes
  useEffect(() => {
    fetchPharmacyForDate(visitDate);
  }, [visitDate]);

  // Live auto-calculate amount to collect with discount support
  const procTotal = procedures.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const cFeeNum = parseFloat(consultationFee) || 0;
  
  // Total billable value of THIS visit (procedures + consultation)
  // Pharmacy items are billed separately under their own Pharmacy Bill to prevent duplicate items and doubled bills.
  const subtotal = (entryMode === 'STANDARD' ? procTotal + cFeeNum : 0);
  const netPayable = Math.max(0, subtotal - (discount?.amount || 0));

  // Actual amount payable for THIS visit TODAY (excluding procedure if client hasn't paid for it yet)
  const payableProcToday = (entryMode === 'STANDARD' && procedurePaidToday) ? procTotal : 0;
  const subtotalPayableToday = (entryMode === 'STANDARD' ? payableProcToday + cFeeNum : 0);
  const netPayableToday = Math.max(0, subtotalPayableToday - (discount?.amount || 0));
  const collectNow = Math.max(0, netPayableToday - (alreadyPaidAtRegistration || 0));

  // Clinic Rule: If any procedure is performed with fee, consultation fee automatically becomes ₹0
  useEffect(() => {
    if (entryMode === 'STANDARD') {
      if (procTotal > 0) {
        if (consultationFee !== '0' || consultationNote !== 'Included with Procedure (₹0)') {
          setConsultationFee('0');
          setConsultationNote('Included with Procedure (₹0)');
        }
      } else if (procTotal === 0 && consultationNote === 'Included with Procedure (₹0)') {
        const restoreFee = (alreadyPaidAtRegistration > 0 ? alreadyPaidAtRegistration : 400).toString();
        setConsultationFee(restoreFee);
        setConsultationNote(alreadyPaidAtRegistration > 0 ? `Enrolled Today — Consultation Fee (₹${restoreFee})` : 'Standard Consultation (₹400)');
      }
    }
  }, [procTotal]);

  useEffect(() => {
    if (entryMode === 'STANDARD') {
      const totalToRecord = (alreadyPaidAtRegistration || 0) + collectNow;
      setFormData(prev => ({ ...prev, amount_received: totalToRecord.toString() }));
    }
  }, [procedures, consultationFee, entryMode, discount, procedurePaidToday, alreadyPaidAtRegistration]);

  const fetchActivePackages = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_URL}/patients/${patient.id}/packages`, { headers: { Authorization: `Bearer ${token}` } });
      setActivePackages(res.data.filter(p => p.sessions_used < p.total_sessions));
    } catch (e) { }
  };

  const fetchPharmacyForDate = async (dateObj) => {
    setFetchingPharmacy(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const dateStr = getDateStr(dateObj);
      const res = await axios.get(`${API_URL}/patients/${patient.id}/pharmacy-by-date?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.found) {
        setPharmacyMeds(res.data.medicines || []);
        setPharmacyTotal(res.data.total_amount || 0);
        setPharmacyPaid(res.data.amount_paid || 0);
      } else {
        setPharmacyMeds([]);
        setPharmacyTotal(0);
        setPharmacyPaid(0);
      }
    } catch (e) {
      console.log('Error fetching pharmacy by date', e);
    } finally {
      setFetchingPharmacy(false);
    }
  };

  const fetchLastVisit = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const [lastVisitRes, rulesRes] = await Promise.all([
        axios.get(`${API_URL}/patients/${patient.id}/last-visit`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/consultation-fee-rules`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);
      
      const lastDate = lastVisitRes.data.last_visit_date;
      const rules = rulesRes.data && rulesRes.data.length > 0 ? rulesRes.data : [
        { min_days: 0, max_days: 7, fee: 0, label: 'Follow-up within 7 days' },
        { min_days: 8, max_days: 14, fee: 200, label: 'Return visit 8-14 days' },
        { min_days: 15, max_days: null, fee: 400, label: 'New consultation (>14 days)' }
      ];
      
      if (!lastDate) {
        const defaultRule = rules.find(r => r.max_days === null || r.max_days === undefined) || rules[rules.length - 1];
        const fee = defaultRule ? defaultRule.fee : 400;
        setConsultationFee(fee.toString());
        setConsultationNote('New patient (first visit)');
        return;
      }

      // Check if patient registered today or had an enrollment visit today
      if (lastVisitRes.data?.is_today) {
        const todayFee = parseFloat(lastVisitRes.data.consultation_fee) || 0;
        const todayPaid = parseFloat(lastVisitRes.data.amount_received) || 0;
        const todayMode = lastVisitRes.data.payment_mode || 'CASH';

        setExistingVisitId(lastVisitRes.data.last_visit_id);
        setAlreadyPaidAtRegistration(todayPaid);
        setConsultationFee(todayFee.toString());
        setConsultationNote(todayPaid > 0 ? `Enrolled Today — Consultation Fee: ₹${todayFee} (${todayMode})` : `Enrolled Today — Consultation: ₹${todayFee}`);
        setFormData(prev => ({
          ...prev,
          payment_mode: todayMode,
          amount_received: todayPaid > 0 ? todayPaid.toString() : todayFee.toString()
        }));
        return;
      }
      
      const daysDiff = Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24));
      
      let matched = null;
      for (const rule of rules.sort((a, b) => a.min_days - b.min_days)) {
        const withinMax = rule.max_days === null || rule.max_days === undefined || daysDiff <= rule.max_days;
        if (daysDiff >= rule.min_days && withinMax) {
          matched = rule;
          break;
        }
      }
      
      if (matched) {
        setConsultationFee(matched.fee.toString());
        setConsultationNote(`${matched.label} (last visit: ${daysDiff}d ago)`);
      } else {
        setConsultationFee('400');
        setConsultationNote(`New consultation (${daysDiff}d since last visit)`);
      }
    } catch (e) {
      console.log('Error fetching last visit', e);
      setConsultationFee('400');
      setConsultationNote('New consultation (default)');
    }
  };

  const fetchMasterProcedures = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_URL}/procedures/master`, { headers: { Authorization: `Bearer ${token}` } });
      setMasterProcedures(res.data);
    } catch (e) { }
  };

  const handleAddNewMasterProc = async () => {
    if (!newProcName.trim()) return;
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.post(`${API_URL}/procedures/master`, { name: newProcName }, { headers: { Authorization: `Bearer ${token}` } });
      setMasterProcedures([...masterProcedures, { id: res.data.id, name: res.data.name }]);
      setNewProcName('');
      setAddingNewProc(false);
      selectMasterProc(res.data);
    } catch (err) {
      Alert.alert('Error', 'Only Admin or Doctor can add master procedures.');
    }
  };

  const selectMasterProc = (proc) => {
    const name = typeof proc === 'string' ? proc : proc.name;
    const procId = typeof proc === 'object' ? proc.id : null;
    const lastPrice = typeof proc === 'object' && proc.last_price ? proc.last_price.toString() : '';
    const newProcs = [...procedures];
    newProcs[activeProcIndex].procedure_id = procId;
    newProcs[activeProcIndex].name = name;
    // Suggest last used price as a flexible starting value if amount is currently empty
    if (!newProcs[activeProcIndex].amount && lastPrice && lastPrice !== '0') {
      newProcs[activeProcIndex].amount = lastPrice;
    }
    // As per clinic rule: if a procedure is done, consultation fee is included (₹0)
    if (consultationFee === '400') {
      setConsultationFee('0');
      setConsultationNote('Included with Procedure (₹0)');
    }
    setProcedures(newProcs);
    setShowProcModal(false);
  };

  const handleInputChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const addProcedureRow = () => {
    setProcedures([...procedures, { name: '', area: '', amount: '' }]);
    if (consultationFee === '400') {
      setConsultationFee('0');
      setConsultationNote('Included with Procedure (₹0)');
    }
  };
  const removeProcedureRow = (index) => {
    const newProcs = [...procedures];
    newProcs.splice(index, 1);
    setProcedures(newProcs);
  };
  const updateProcedure = (index, field, value) => {
    const newProcs = [...procedures];
    newProcs[index][field] = value;
    setProcedures(newProcs);
  };

  const handleSubmit = async () => {
    const validProcs = procedures.filter(p => p.name && p.name.trim() !== '');
    const hasConsultation = cFeeNum > 0;
    const hasProcedures = validProcs.length > 0;
    const hasPharmacy = pharmacyMeds.length > 0;

    // Zero-billing visits (e.g. Report Review, Free Follow-up, Diagnostic check) are fully supported
    if (entryMode === 'STANDARD' && !hasConsultation && !hasProcedures && !hasPharmacy) {
      if (!formData.planned_procedures) {
        formData.planned_procedures = 'REPORT REVIEW / FOLLOW UP';
      }
    }
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      
      const payload = {
        patient_id: patient.id,
        existing_visit_id: existingVisitId || null,
        notes: formData.notes,
        consultation_fee: (entryMode === 'REDEEM_PACKAGE' || entryMode === 'SELL_PACKAGE') ? 0 : cFeeNum,
        medicine_details: '', // Kept separate under the Pharmacy Bill to prevent duplicate items
        medicine_amount: 0,
        payment_mode: formData.payment_mode,
        subtotal: subtotal,
        discount_type: discount.type,
        discount_value: discount.value,
        discount_amount: discount.amount,
        net_payable: netPayable,
        amount_received: parseFloat(formData.amount_received) || 0,
        planned_procedures: formData.planned_procedures
      };

      if (isPastVisit) payload.visit_date = visitDate.toISOString();

      if (entryMode === 'STANDARD') {
        // Send real procedures only; consultation fee is stored in its dedicated field
        payload.procedures = validProcs.map(p => ({ procedure_id: p.procedure_id || null, name: p.name.trim(), area: p.area ? p.area.trim() : '', amount: parseFloat(p.amount) || 0 }));
      } else if (entryMode === 'REDEEM_PACKAGE') {
        const pkg = activePackages.find(p => p.id === formData.package_redeemed_id);
        payload.package_redeemed_id = formData.package_redeemed_id;
        payload.procedures = [{ name: `[Redeemed Session ${pkg.sessions_used + 1} of ${pkg.total_sessions}] ${pkg.package_name}`, area: '', amount: 0 }];
      } else if (entryMode === 'SELL_PACKAGE') {
        payload.package_sold = { name: formData.new_package_name, total_sessions: parseInt(formData.new_package_sessions), amount: parseFloat(formData.new_package_amount) };
      }

      await axios.post(`${API_URL}/visits`, payload, { headers: { Authorization: `Bearer ${token}` } });

      // Auto-book next appointment if selected
      if (nextFollowupDate) {
        try {
          await axios.post(`${API_URL}/appointments`, {
            patient_id: patient.id,
            patient_name: `${patient.first_name} ${patient.last_name || ''}`.trim(),
            mobile: patient.mobile,
            appointment_date: nextFollowupDate,
            appointment_time: nextFollowupTime || '11:00 AM',
            notes: formData.planned_procedures ? `Follow-up: ${formData.planned_procedures}` : 'Follow-up Consultation'
          }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (apptErr) {
          console.log('Auto appointment booking note:', apptErr.message);
        }
      }

      Alert.alert('Success', 'Visit recorded & synchronized successfully!');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to record visit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{isPastVisit ? 'Add Past Visit' : 'New Visit Entry'}</Text>
      </View>

      <View style={styles.modeTabs}>
        <TouchableOpacity style={[styles.modeBtn, entryMode === 'STANDARD' && styles.modeActive]} onPress={() => setEntryMode('STANDARD')}>
          <Text style={[styles.modeText, entryMode === 'STANDARD' && styles.modeTextActive]}>Standard Visit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, entryMode === 'REDEEM_PACKAGE' && styles.modeActive]} onPress={() => { setEntryMode('REDEEM_PACKAGE'); setConsultationFee('0'); setConsultationNote('Prepaid Package (₹0)'); }}>
          <Text style={[styles.modeText, entryMode === 'REDEEM_PACKAGE' && styles.modeTextActive]}>Redeem Pkg</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, entryMode === 'SELL_PACKAGE' && styles.modeActive]} onPress={() => { setEntryMode('SELL_PACKAGE'); setConsultationFee('0'); setConsultationNote('Package Sale (₹0)'); }}>
          <Text style={[styles.modeText, entryMode === 'SELL_PACKAGE' && styles.modeTextActive]}>Sell Package</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* PATIENT HEADER */}
        <View style={styles.patientBanner}>
          <Text style={styles.patientBannerName}>{patient.first_name} {patient.last_name || ''}</Text>
          <Text style={styles.patientBannerId}>{patient.skinssence_id} • 📞 {patient.mobile}</Text>
        </View>

        {isPastVisit && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Visit Date</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.dateText}>{visitDate.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'})}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker value={visitDate} mode="date" display="default" maximumDate={new Date()} onChange={(event, d) => { setShowDatePicker(false); if(d) setVisitDate(d); }} />
            )}
          </View>
        )}

        {/* 1. CONSULTATION FEE SECTION */}
        {entryMode === 'STANDARD' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🩺 Consultation Fee</Text>
            
            {alreadyPaidAtRegistration > 0 && (
              <View style={{ backgroundColor: '#ecfdf5', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#a7f3d0', marginBottom: 10 }}>
                <Text style={{ color: '#065f46', fontSize: 13, fontWeight: 'bold' }}>
                  ✓ Consultation Fee Paid at Registration: ₹{alreadyPaidAtRegistration} ({formData.payment_mode})
                </Text>
                <Text style={{ color: '#065f46', fontSize: 12, marginTop: 2 }}>
                  Already received at reception and synchronized for today.
                </Text>
              </View>
            )}

            <View style={styles.consultationAlert}>
              <Text style={styles.consultationAlertText}>💡 {consultationNote}</Text>
            </View>
            <Text style={styles.label}>Visit Type / Consultation Fee</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
              <TouchableOpacity 
                style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginRight: 6, marginBottom: 6 }, (consultationFee === '0' && consultationNote.includes('Included with Procedure')) ? { backgroundColor: '#eff6ff', borderColor: '#3b82f6' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                onPress={() => { setConsultationFee('0'); setConsultationNote('Included with Procedure (₹0)'); }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#1d4ed8' }}>✨ Included with Procedure (₹0)</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginRight: 6, marginBottom: 6 }, consultationFee === '400' ? { backgroundColor: '#fef3c7', borderColor: '#d97706' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                onPress={() => { setConsultationFee('400'); setConsultationNote('Standard Consultation (₹400)'); }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: consultationFee === '400' ? '#92400e' : '#4b5563' }}>🩺 Standard (₹400)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginRight: 6, marginBottom: 6 }, (consultationFee === '0' && (formData.planned_procedures || '').includes('REPORT')) ? { backgroundColor: '#dcfce7', borderColor: '#16a34a' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                onPress={() => { setConsultationFee('0'); setConsultationNote('Report Review / Follow-up (₹0)'); setFormData(p => ({ ...p, planned_procedures: 'REPORT REVIEW / FOLLOW UP' })); }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#166534' }}>🔬 Report Review (₹0)</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginRight: 6, marginBottom: 6 }, (consultationFee === '0' && !consultationNote.includes('Included')) ? { backgroundColor: '#f3f4f6', borderColor: '#9ca3af' } : { backgroundColor: '#fff', borderColor: '#d1d5db' }]}
                onPress={() => { setConsultationFee('0'); setConsultationNote('Fee Waived / Included (₹0)'); }}>
                <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#4b5563' }}>📋 Fee Waived (₹0)</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={consultationFee}
              onChangeText={(v) => setConsultationFee(v)}
              placeholder="0"
            />
            <Text style={styles.helperText}>
              Set to ₹0 for Report Reviews, free follow-ups, or when fee is waived.
            </Text>
          </View>
        )}

        {/* 2. PROCEDURES SECTION */}
        <View style={styles.section}>
          {entryMode === 'STANDARD' && (
            <>
              <Text style={styles.sectionTitle}>🏥 Procedures / Services</Text>
              {procedures.length === 0 ? (
                <View style={{ backgroundColor: '#f0fdf4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#86efac', marginBottom: 12 }}>
                  <Text style={{ color: '#166534', fontWeight: 'bold', fontSize: 14 }}>🩺 Consultation Only Visit</Text>
                  <Text style={{ color: '#166534', fontSize: 12, marginTop: 2 }}>
                    No procedures performed. If patient received a treatment or service, tap "+ Add Procedure" below.
                  </Text>
                </View>
              ) : (
                procedures.map((proc, index) => (
                  <View key={index} style={styles.procRow}>
                    <View style={{flex: 1, marginBottom: 10}}>
                      <Text style={styles.label}>Procedure Name / Category</Text>
                      <TouchableOpacity style={styles.dropdownBtn} onPress={() => { setActiveProcIndex(index); setShowProcModal(true); }}>
                        <Text style={{color: proc.name ? '#000' : '#888', fontSize: 16}}>{proc.name || 'Tap to select procedure...'}</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                      <View style={{flex: 1, marginRight: 10}}>
                        <Text style={styles.label}>Body Part / Area (Optional)</Text>
                        <TextInput style={styles.input} value={proc.area} onChangeText={(v) => updateProcedure(index, 'area', v)} placeholder="e.g. Full Face, Chin" />
                      </View>
                      <View style={{flex: 0.7}}>
                        <Text style={styles.label}>Amount (Rs)</Text>
                        <TextInput style={styles.input} keyboardType="numeric" value={proc.amount} onChangeText={(v) => updateProcedure(index, 'amount', v)} placeholder="0" />
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => removeProcedureRow(index)} style={{alignSelf: 'flex-end', marginTop: 10}}>
                      <Text style={{color: '#ef4444', fontWeight: 'bold'}}>✕ Remove Procedure</Text>
                    </TouchableOpacity>
                    <View style={{height: 1, backgroundColor: '#eee', marginVertical: 15}} />
                  </View>
                ))
              )}
              <TouchableOpacity style={styles.addProcBtn} onPress={addProcedureRow}>
                <Text style={styles.addProcBtnText}>+ Add Procedure</Text>
              </TouchableOpacity>
            </>
          )}

          {entryMode === 'REDEEM_PACKAGE' && (
            <>
              <Text style={styles.sectionTitle}>🎁 Redeem Prepaid Package</Text>
              {activePackages.length === 0 ? <Text style={styles.errorText}>No active packages available for this patient.</Text> : 
                activePackages.map(pkg => (
                  <TouchableOpacity key={pkg.id} style={[styles.packageCard, formData.package_redeemed_id === pkg.id && styles.packageCardSelected]} onPress={() => handleInputChange('package_redeemed_id', pkg.id)}>
                    <Text style={[styles.pkgName, formData.package_redeemed_id === pkg.id && {color:'#fff'}]}>{pkg.package_name}</Text>
                    <Text style={[styles.pkgDetails, formData.package_redeemed_id === pkg.id && {color:'#fff'}]}>Sessions: {pkg.sessions_used} / {pkg.total_sessions} used</Text>
                  </TouchableOpacity>
              ))}
            </>
          )}

          {entryMode === 'SELL_PACKAGE' && (
            <>
              <Text style={styles.sectionTitle}>🎁 Sell New Package</Text>
              <TextInput style={styles.input} value={formData.new_package_name} onChangeText={(v) => handleInputChange('new_package_name', v)} placeholder="Package Name (e.g. 6 Hydrafacial)" />
              <TextInput style={[styles.input, {marginTop: 10}]} keyboardType="numeric" value={formData.new_package_sessions} onChangeText={(v) => handleInputChange('new_package_sessions', v)} placeholder="Total Sessions (e.g. 6)" />
              <TextInput style={[styles.input, {marginTop: 10}]} keyboardType="numeric" value={formData.new_package_amount} onChangeText={(v) => handleInputChange('new_package_amount', v)} placeholder="Total Amount (Rs)" />
            </>
          )}
          
          <Text style={styles.label}>Clinical Notes / Observations (Optional)</Text>
          <TextInput style={[styles.input, { height: 70 }]} multiline value={formData.notes} onChangeText={(v) => handleInputChange('notes', v)} placeholder="Doctor clinical notes..." />
        </View>

        {/* 3. PHARMACY MEDICINES SECTION (SEPARATELY BILLED) */}
        <View style={styles.section}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
            <Text style={styles.sectionTitle}>💊 Pharmacy Medicines (Separate Bill)</Text>
            {fetchingPharmacy ? (
              <ActivityIndicator size="small" color="#5C0B0B" />
            ) : (
              <TouchableOpacity onPress={() => fetchPharmacyForDate(visitDate)} style={styles.syncBtn}>
                <Text style={styles.syncBtnText}>🔄 Refresh</Text>
              </TouchableOpacity>
            )}
          </View>

          {pharmacyMeds.length > 0 ? (
            <View style={styles.pharmacyListBox}>
              <View style={styles.pharmacyHeaderRow}>
                <Text style={styles.pharmacyBadge}>✓ {pharmacyMeds.length} Items Billed in Pharmacy</Text>
                <Text style={styles.pharmacyTotalText}>Total: Rs. {pharmacyTotal.toFixed(0)}</Text>
              </View>
              <Text style={{fontSize: 11, color: '#166534', marginBottom: 6, fontStyle: 'italic'}}>
                ℹ️ Billed separately under Pharmacy Bill. This visit records only procedures & consultation to prevent double billing.
              </Text>
              {pharmacyMeds.map((m, idx) => (
                <View key={idx} style={styles.pharmacyMedRow}>
                  <Text style={styles.pharmacyMedDetails}>• {m.details}</Text>
                  <Text style={styles.pharmacyMedAmt}>Rs. {parseFloat(m.amount).toFixed(0)}</Text>
                </View>
              ))}
              {pharmacyPaid > 0 && (
                <View style={styles.pharmacyPaidNotice}>
                  <Text style={{color: '#15803d', fontSize: 13, fontWeight: 'bold'}}>
                    ✓ Already paid at Pharmacy counter: Rs. {pharmacyPaid.toFixed(0)}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noPharmacyBox}>
              <Text style={styles.noPharmacyText}>
                No pharmacy bill recorded on {visitDate.toLocaleDateString('en-IN', {day:'2-digit', month:'short'})}.
              </Text>
              <TouchableOpacity 
                style={styles.createPharmacyBtn}
                onPress={() => navigation.navigate('PharmacyBilling', { patient })}>
                <Text style={styles.createPharmacyBtnText}>💊 Open Pharmacy & Create Bill for {patient.first_name}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={[styles.label, {marginTop: 15}]}>📋 Doctor's Advice / Home Care / Next Procedure (Optional)</Text>
          <TextInput
            style={[styles.input, { height: 70 }]}
            multiline
            value={formData.planned_procedures}
            onChangeText={(v) => handleInputChange('planned_procedures', v)}
            placeholder="Advice for next session or home skincare routine..."
          />

          <Text style={[styles.label, {marginTop: 15}]}>📅 Next Follow-up / Appointment (Auto-books on Bill)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {[
              { label: 'None', days: null },
              { label: '+3 Days', days: 3 },
              { label: '+7 Days (1 Wk)', days: 7 },
              { label: '+10 Days', days: 10 },
              { label: '+15 Days', days: 15 },
              { label: '+30 Days (1 Mo)', days: 30 }
            ].map((item, idx) => {
              const isActive = (item.days === null && !nextFollowupDate) || (nextFollowupDays === item.days);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.followupChip, isActive && styles.followupChipActive]}
                  onPress={() => selectFollowupDays(item.days)}
                >
                  <Text style={[styles.followupChipText, isActive && styles.followupChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {nextFollowupDate ? (
            <View style={styles.followupBanner}>
              <Text style={styles.followupBannerText}>
                ✓ Next Appointment: {new Date(nextFollowupDate).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} at {nextFollowupTime}
              </Text>
              <TouchableOpacity onPress={() => selectFollowupDays(null)}>
                <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: 'bold' }}>✕ Clear</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* 4. PAYMENT & SYSTEM CALCULATED TOTAL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Payment Breakdown</Text>

          {/* Procedure Payment Status Toggle */}
          {entryMode === 'STANDARD' && procTotal > 0 && (
            <View style={styles.procPayToggleBox}>
              <Text style={styles.procPayToggleTitle}>🏥 Procedure Payment Status:</Text>
              <View style={styles.procPayToggleRow}>
                <TouchableOpacity
                  style={[styles.procPayChip, procedurePaidToday && styles.procPayChipActive]}
                  onPress={() => setProcedurePaidToday(true)}
                >
                  <Text style={[styles.procPayChipText, procedurePaidToday && styles.procPayChipTextActive]}>
                    ✓ Paid Today (Rs. {procTotal.toFixed(0)})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.procPayChip, !procedurePaidToday && styles.procPayChipPending]}
                  onPress={() => setProcedurePaidToday(false)}
                >
                  <Text style={[styles.procPayChipText, !procedurePaidToday && styles.procPayChipTextPending]}>
                    ⏳ Not Paid Yet / Due (Rs. 0)
                  </Text>
                </TouchableOpacity>
              </View>
              {!procedurePaidToday && (
                <Text style={styles.procPayPendingNote}>
                  ℹ️ Procedure is recorded in clinical history, but its fee (Rs. {procTotal.toFixed(0)}) will NOT be counted in today's received collection.
                </Text>
              )}
            </View>
          )}
          
          <View style={styles.calculationBox}>
            {entryMode === 'STANDARD' && cFeeNum > 0 && (
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>Consultation Fee</Text>
                <Text style={styles.calcValue}>Rs. {cFeeNum.toFixed(0)}</Text>
              </View>
            )}
            {entryMode === 'STANDARD' && (
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>
                  Procedures Total ({procedures.filter(p=>p.name).length} items)
                  {!procedurePaidToday ? ' [UNPAID]' : ''}
                </Text>
                <Text style={[styles.calcValue, !procedurePaidToday && { textDecorationLine: 'line-through', color: '#9ca3af' }]}>
                  Rs. {procTotal.toFixed(0)}
                </Text>
              </View>
            )}
            {pharmacyTotal > 0 && (
              <View style={[styles.calcRow, {backgroundColor: '#f0fdf4', padding: 8, borderRadius: 6, marginVertical: 4, borderWidth: 1, borderColor: '#bbf7d0'}]}>
                <View style={{flex: 1}}>
                  <Text style={{fontSize: 12, color: '#166534', fontWeight: 'bold'}}>Separate Pharmacy Bill (Today)</Text>
                  <Text style={{fontSize: 11, color: '#15803d'}}>Handled separately at Pharmacy counter</Text>
                </View>
                <Text style={{fontSize: 13, fontWeight: 'bold', color: '#166534'}}>
                  Rs. {pharmacyTotal.toFixed(0)} {pharmacyPaid >= pharmacyTotal ? '(Paid)' : ''}
                </Text>
              </View>
            )}
            <View style={styles.calcDivider} />
            <View style={styles.calcRow}>
              <Text style={styles.calcGrandLabel}>VISIT SUBTOTAL</Text>
              <Text style={styles.calcGrandValue}>Rs. {subtotal.toFixed(0)}</Text>
            </View>

            {/* Discount / Concession Component */}
            <View style={{marginTop: 8, marginBottom: 4}}>
              <DiscountControl
                subtotal={subtotal}
                discount={discount}
                onChangeDiscount={setDiscount}
              />
            </View>

            {discount.amount > 0 && (
              <View style={[styles.calcRow, {marginTop: 6}]}>
                <Text style={{fontSize: 14, fontWeight: 'bold', color: '#111827'}}>TOTAL AMOUNT (VISIT)</Text>
                <Text style={{fontSize: 15, fontWeight: 'bold', color: '#5C0B0B'}}>Rs. {netPayable.toFixed(0)}</Text>
              </View>
            )}

            {alreadyPaidAtRegistration > 0 && (
              <View style={styles.calcRow}>
                <Text style={{color: '#15803d', fontSize: 13}}>Already Paid at Registration</Text>
                <Text style={{color: '#15803d', fontWeight: 'bold'}}>- Rs. {alreadyPaidAtRegistration.toFixed(0)}</Text>
              </View>
            )}
            <View style={[styles.calcRow, {marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e5e7eb'}]}>
              <Text style={styles.collectNowLabel}>AMOUNT TO COLLECT FOR VISIT</Text>
              <Text style={styles.collectNowValue}>Rs. {collectNow.toFixed(0)}</Text>
            </View>
          </View>

          <Text style={[styles.label, {marginTop: 15}]}>Payment Method</Text>
          <View style={styles.paymentRow}>
            {['CASH', 'UPI', 'CARD', 'NETBANKING', 'PREPAID_WALLET'].map(mode => (
              <TouchableOpacity key={mode} style={[styles.modeSelect, formData.payment_mode === mode && styles.modeSelected]} onPress={() => handleInputChange('payment_mode', mode)}>
                <Text style={[styles.modeSelectText, formData.payment_mode === mode && styles.modeSelectedText]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <Text style={[styles.label, { marginTop: 0 }]}>Amount Received for Visit (Rs.)</Text>
            <Text style={{ fontSize: 11, color: '#6b7280' }}>Actual cash/UPI collected</Text>
          </View>
          <TextInput
            style={[styles.input, { borderColor: '#10b981', borderWidth: 2, fontSize: 18, fontWeight: 'bold' }]}
            keyboardType="numeric"
            value={formData.amount_received}
            onChangeText={(v) => handleInputChange('amount_received', v)}
            placeholder="0"
          />

          {/* Quick-fill 1-tap buttons */}
          <View style={styles.quickFillRow}>
            <TouchableOpacity
              style={styles.quickFillBtn}
              onPress={() => handleInputChange('amount_received', collectNow.toFixed(0))}
            >
              <Text style={styles.quickFillText}>Rs. {collectNow.toFixed(0)} (Full Visit)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickFillBtn, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}
              onPress={() => handleInputChange('amount_received', '0')}
            >
              <Text style={[styles.quickFillText, { color: '#b91c1c' }]}>Rs. 0 (Unpaid)</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>✓ Save Visit Record</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Standardized Master Procedure Modal */}
      <Modal visible={showProcModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.modalTitle}>Select Master Procedure</Text>
              <Text style={{ fontSize: 12, color: '#64748b' }}>
                Standardized procedure catalog. Price is flexible and entered on the next step.
              </Text>
            </View>
            
            <FlatList
              data={masterProcedures.filter(p => p.active !== 0)}
              keyExtractor={(item) => item.id.toString()}
              style={{ maxHeight: 380 }}
              renderItem={({item}) => (
                <TouchableOpacity style={[styles.modalItem, { paddingVertical: 10 }]} onPress={() => selectMasterProc(item)}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#5C0B0B', backgroundColor: '#fee2e2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginRight: 6 }}>
                          {item.code || `P${item.id}`}
                        </Text>
                        <Text style={{fontSize: 15, color: '#1e293b', fontWeight: '600'}}>{item.name}</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.category || 'General'}</Text>
                    </View>
                    {item.last_price > 0 ? (
                      <Text style={{fontSize: 12, color: '#047857', fontWeight: '500'}}>
                        Last: ₹{item.last_price}
                      </Text>
                    ) : item.avg_price > 0 ? (
                      <Text style={{fontSize: 12, color: '#2563eb', fontWeight: '500'}}>
                        Avg: ₹{item.avg_price}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={[styles.submitBtn, {backgroundColor: '#64748b', marginTop: 15}]} onPress={() => setShowProcModal(false)}>
              <Text style={{color:'#fff', textAlign:'center', fontWeight: 'bold'}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { marginRight: 15 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 15, paddingBottom: 40 },
  patientBanner: { backgroundColor: '#5C0B0B', padding: 15, borderRadius: 10, marginBottom: 15 },
  patientBannerName: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  patientBannerId: { color: '#fecdd3', fontSize: 13, marginTop: 3 },
  modeTabs: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  modeBtn: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  modeActive: { borderBottomColor: '#5C0B0B' },
  modeText: { fontSize: 14, fontWeight: 'bold', color: '#6b7280' },
  modeTextActive: { color: '#5C0B0B' },
  section: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 5, marginTop: 10 },
  helperText: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  consultationAlert: { backgroundColor: '#fffbeb', borderLeftWidth: 4, borderLeftColor: '#f59e0b', padding: 10, borderRadius: 6, marginBottom: 10 },
  consultationAlertText: { color: '#b45309', fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 12, fontSize: 16 },
  dropdownBtn: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#3b82f6', borderRadius: 8, padding: 15 },
  dateBtn: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 15, alignItems: 'center' },
  dateText: { fontSize: 16, color: '#1f2937', fontWeight: 'bold' },
  procRow: { marginBottom: 10 },
  addProcBtn: { marginTop: 10, padding: 12, backgroundColor: '#eef2ff', borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#c7d2fe' },
  addProcBtnText: { color: '#4f46e5', fontWeight: 'bold' },
  packageCard: { padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', marginBottom: 10, backgroundColor: '#f9fafc' },
  packageCardSelected: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  pkgName: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
  pkgDetails: { fontSize: 14, color: '#4b5563', marginTop: 4 },
  errorText: { color: '#ef4444', fontStyle: 'italic', marginBottom: 10 },
  syncBtn: { backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 5 },
  syncBtnText: { color: '#0369a1', fontSize: 12, fontWeight: 'bold' },
  pharmacyListBox: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0', marginTop: 5 },
  pharmacyHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pharmacyBadge: { color: '#15803d', fontWeight: 'bold', fontSize: 13 },
  pharmacyTotalText: { color: '#15803d', fontWeight: 'bold', fontSize: 14 },
  pharmacyMedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#dcfce7' },
  pharmacyMedDetails: { flex: 1, fontSize: 13, color: '#1f2937' },
  pharmacyMedAmt: { fontSize: 13, fontWeight: 'bold', color: '#1f2937', marginLeft: 10 },
  pharmacyPaidNotice: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#bbf7d0' },
  noPharmacyBox: { backgroundColor: '#fff7ed', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#fed7aa', alignItems: 'center' },
  noPharmacyText: { color: '#9a3412', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  createPharmacyBtn: { backgroundColor: '#5C0B0B', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 6 },
  createPharmacyBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  calculationBox: { backgroundColor: '#f9fafb', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginTop: 5 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  calcLabel: { fontSize: 14, color: '#4b5563' },
  calcValue: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  calcDivider: { height: 1, backgroundColor: '#d1d5db', marginVertical: 6 },
  calcGrandLabel: { fontSize: 15, fontWeight: 'bold', color: '#5C0B0B' },
  calcGrandValue: { fontSize: 16, fontWeight: 'bold', color: '#5C0B0B' },
  collectNowLabel: { fontSize: 15, fontWeight: 'bold', color: '#10b981' },
  collectNowValue: { fontSize: 18, fontWeight: '900', color: '#10b981' },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 15, marginTop: 5 },
  modeSelect: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, marginRight: 8, marginBottom: 8, backgroundColor: '#f9fafc' },
  modeSelected: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  modeSelectText: { color: '#4b5563', fontWeight: 'bold', fontSize: 12 },
  modeSelectedText: { color: '#fff' },
  submitBtn: { backgroundColor: '#10b981', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', padding: 20, borderRadius: 10, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#5C0B0B' },
  modalItem: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  procPayToggleBox: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#86efac', marginBottom: 12 },
  procPayToggleTitle: { fontSize: 13, fontWeight: 'bold', color: '#166534', marginBottom: 8 },
  procPayToggleRow: { flexDirection: 'row', gap: 8 },
  procPayChip: { flex: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center' },
  procPayChipActive: { backgroundColor: '#15803d', borderColor: '#15803d' },
  procPayChipPending: { backgroundColor: '#b45309', borderColor: '#b45309' },
  procPayChipText: { fontSize: 12, fontWeight: 'bold', color: '#475569', textAlign: 'center' },
  procPayChipTextActive: { color: '#fff' },
  procPayChipTextPending: { color: '#fff' },
  procPayPendingNote: { fontSize: 11, color: '#92400e', marginTop: 6, fontStyle: 'italic', lineHeight: 15 },
  quickFillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  quickFillBtn: { paddingVertical: 5, paddingHorizontal: 10, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  quickFillText: { fontSize: 12, fontWeight: '600', color: '#334155' },
  followupChip: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#f1f5f9', borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  followupChipActive: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  followupChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  followupChipTextActive: { color: '#fff', fontWeight: 'bold' },
  followupBanner: { marginTop: 8, padding: 10, backgroundColor: '#ecfdf5', borderRadius: 6, borderWidth: 1, borderColor: '#a7f3d0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  followupBannerText: { fontSize: 12, color: '#065f46', fontWeight: 'bold' }
});
