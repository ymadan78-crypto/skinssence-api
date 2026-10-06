import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Switch, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDailyClinicQrStatus, promptDailyClinicQrRequired } from '../utils/clinicQrHelper';

export default function PatientRegistrationScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [showHairDate, setShowHairDate] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', mobile: '', dob: '', gender: 'MALE', email: '',
    emergency_mobile: '', address: '', city: '',
    concerns: [], other_concern: '',
    upcoming_event: false, event_date: '',
    last_hair_procedure: '', last_hair_procedure_date: ''
  });
  const [chargeConsultation, setChargeConsultation] = useState(true);
  const [consultationPaymentMode, setConsultationPaymentMode] = useState('CASH');
  const [regUpiAccount, setRegUpiAccount] = useState('STORE'); // 'STORE' | 'CLINIC'
  const [clinicQrCompleted, setClinicQrCompleted] = useState(false);

  useEffect(() => {
    (async () => {
      const status = await getDailyClinicQrStatus();
      setClinicQrCompleted(status.completed);
    })();
  }, []);

  const API_URL = 'https://skinssence-api.onrender.com/api/patients';

  const skinConcernsList = ['Acne', 'Pigmentation', 'Scar', 'Open Pores', 'Under Eye', 'Body Hair', 'Tattoo', 'Mole', 'Dark Lips', 'Elbow/Knee'];
  const hairConcernsList = ['Hair Thinning', 'Dandruff/ Flaky Scalp', 'Oily Scalp', 'Dry Scalp', 'Dry & Frizzy Hair', 'Hair Fall', 'Brittle / Damaged Hair', 'Rough / Unmanageable Hair', 'Split Ends'];

  const onDateChange = (event, selectedDate, field, setShow) => {
    setShow(Platform.OS === 'ios');
    if (selectedDate) {
      const d = new Date(selectedDate);
      const formattedDate = (d.getMonth() + 1).toString().padStart(2, '0') + '/' + d.getDate().toString().padStart(2, '0') + '/' + d.getFullYear();
      handleInputChange(field, formattedDate);
    }
  };

  const handleInputChange = (field, value) => { setFormData(prev => ({ ...prev, [field]: value })); };

  const toggleConcern = (concernName) => {
    setFormData(prev => {
      const exists = prev.concerns.includes(concernName);
      return {
        ...prev,
        concerns: exists ? prev.concerns.filter(c => c !== concernName) : [...prev.concerns, concernName]
      };
    });
  };

  const handlePaymentModeSelect = (mode) => {
    setConsultationPaymentMode(mode);
    if (mode === 'UPI' && !clinicQrCompleted) {
      promptDailyClinicQrRequired(
        () => setRegUpiAccount('CLINIC'),
        () => setRegUpiAccount('STORE')
      );
    }
  };

  const submitRegistration = async (force_duplicate = false, chosenUpiAccount = null) => {
    const activeUpiAccount = chosenUpiAccount || regUpiAccount;

    // Check if daily Clinic QR transaction is still pending
    if (
      chargeConsultation &&
      consultationPaymentMode === 'UPI' &&
      activeUpiAccount !== 'CLINIC' &&
      !clinicQrCompleted
    ) {
      promptDailyClinicQrRequired(
        () => {
          setRegUpiAccount('CLINIC');
          executeSubmit(force_duplicate, 'CLINIC');
        },
        () => {
          executeSubmit(force_duplicate, 'STORE');
        }
      );
      return;
    }

    await executeSubmit(force_duplicate, activeUpiAccount);
  };

  const executeSubmit = async (force_duplicate = false, activeUpiAccount = regUpiAccount) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const effectiveMode = consultationPaymentMode === 'UPI' 
        ? (activeUpiAccount === 'CLINIC' ? 'UPI (Clinic)' : 'UPI (Store)')
        : consultationPaymentMode;
      const payload = {
        ...formData,
        force_duplicate,
        charge_consultation: chargeConsultation,
        consultation_fee: chargeConsultation ? 400 : 0,
        consultation_payment_mode: chargeConsultation ? effectiveMode : null
      };
      const idempotencyKey = `reg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const response = await axios.post(API_URL, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-idempotency-key': idempotencyKey
        }
      });
      if (activeUpiAccount === 'CLINIC') {
        setClinicQrCompleted(true);
      }
      const feeInfo = chargeConsultation
        ? `\nConsultation Fee: ₹400 (${effectiveMode}) recorded.`
        : '\nConsultation Fee: Waived (₹0).';
      Alert.alert('Success', `Patient registered successfully with number: ${response.data.skinssence_id}.${feeInfo}`);
      navigation.goBack();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to register patient');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.first_name || !formData.last_name || !formData.mobile || !formData.city) {
      return Alert.alert('Error', 'Please fill all mandatory fields (First Name, Last Name, Mobile, City).');
    }
    if (formData.mobile.length !== 10) {
      return Alert.alert('Error', 'Mobile number must be exactly 10 digits.');
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const checkRes = await axios.get(`https://skinssence-api.onrender.com/api/patients/check-mobile/${formData.mobile}`, { headers: { Authorization: `Bearer ${token}` } });
      if (checkRes.data.exists) {
        setLoading(false);
        Alert.alert('Duplicate Number', 'This mobile number is already registered. Continue?', [{ text: 'No', style: 'cancel' }, { text: 'Yes', onPress: () => submitRegistration(true) }]);
        return;
      }
      await submitRegistration(false);
    } catch (error) {
      setLoading(false);
      Alert.alert('Error', 'Could not verify mobile number.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={styles.backText}>Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>New Patient Registration</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Demographics</Text>
          <Text style={styles.label}>First Name *</Text>
          <TextInput style={styles.input} value={formData.first_name} onChangeText={(v) => handleInputChange('first_name', v)} />
          <Text style={styles.label}>Last Name *</Text>
          <TextInput style={styles.input} value={formData.last_name} onChangeText={(v) => handleInputChange('last_name', v)} />
          <Text style={styles.label}>Mobile Number * (10 digits)</Text>
          <TextInput style={styles.input} keyboardType='numeric' maxLength={10} value={formData.mobile} onChangeText={(v) => handleInputChange('mobile', v)} />
          <Text style={styles.label}>Date of Birth *</Text>
          <TouchableOpacity onPress={() => setShowDobPicker(true)} style={[styles.input, {justifyContent:'center'}]}>
            <Text style={{color: formData.dob ? '#000' : '#9ca3af'}}>{formData.dob || 'Select Date (mm/dd/yyyy)'}</Text>
          </TouchableOpacity>
          {showDobPicker && (
            <DateTimePicker value={formData.dob ? new Date(formData.dob) : new Date()} mode="date" display="default" onChange={(e, d) => onDateChange(e, d, 'dob', setShowDobPicker)} />
          )}
          <Text style={styles.label}>Gender</Text>
          <View style={styles.rowBtnContainer}>
            {['MALE', 'FEMALE', 'OTHER'].map(g => (
              <TouchableOpacity key={g} style={[styles.choiceBtn, formData.gender === g && styles.choiceSelected]} onPress={() => handleInputChange('gender', g)}>
                <Text style={[styles.choiceText, formData.gender === g && styles.choiceTextSelected]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>City *</Text>
          <TextInput style={styles.input} value={formData.city} onChangeText={(v) => handleInputChange('city', v)} />
          <Text style={styles.label}>Address (Optional)</Text>
          <TextInput style={styles.input} value={formData.address} onChangeText={(v) => handleInputChange('address', v)} />

          <View style={styles.divider} />
          
          <Text style={styles.sectionTitle}>Skin Concerns</Text>
          <View style={styles.concernGrid}>
            {skinConcernsList.map(c => (
              <TouchableOpacity key={c} style={[styles.concernBox, formData.concerns.includes(c) && styles.concernBoxSelected]} onPress={() => toggleConcern(c)}>
                <Text style={formData.concerns.includes(c) ? styles.concernBoxTextSelected : styles.concernBoxText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <Text style={styles.sectionTitle}>Hair & Scalp Concerns</Text>
          <View style={styles.concernGrid}>
            {hairConcernsList.map(c => (
              <TouchableOpacity key={c} style={[styles.concernBox, formData.concerns.includes(c) && styles.concernBoxSelected]} onPress={() => toggleConcern(c)}>
                <Text style={formData.concerns.includes(c) ? styles.concernBoxTextSelected : styles.concernBoxText}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          
          <Text style={styles.label}>Other Concern:</Text>
          <TextInput style={styles.input} value={formData.other_concern} onChangeText={(v) => handleInputChange('other_concern', v)} />

          <Text style={styles.label}>Last hair procedure done (if any):</Text>
          <TextInput style={styles.input} value={formData.last_hair_procedure} onChangeText={(v) => handleInputChange('last_hair_procedure', v)} />
          
          <Text style={styles.label}>On Date:</Text>
          <TouchableOpacity onPress={() => setShowHairDate(true)} style={[styles.input, {justifyContent:'center'}]}>
            <Text style={{color: formData.last_hair_procedure_date ? '#000' : '#9ca3af'}}>{formData.last_hair_procedure_date || 'Select Date'}</Text>
          </TouchableOpacity>
          {showHairDate && (
            <DateTimePicker value={formData.last_hair_procedure_date ? new Date(formData.last_hair_procedure_date) : new Date()} mode="date" display="default" onChange={(e, d) => onDateChange(e, d, 'last_hair_procedure_date', setShowHairDate)} />
          )}

          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <Text style={styles.label}>Any upcoming personal event?</Text>
            <Switch value={formData.upcoming_event} onValueChange={(v) => handleInputChange('upcoming_event', v)} />
          </View>
          {formData.upcoming_event && (
            <View>
              <Text style={styles.label}>Event Date *</Text>
              <TouchableOpacity onPress={() => setShowEventPicker(true)} style={[styles.input, {justifyContent:'center'}]}>
                <Text style={{color: formData.event_date ? '#000' : '#9ca3af'}}>{formData.event_date || 'Select Date'}</Text>
              </TouchableOpacity>
              {showEventPicker && (
                <DateTimePicker value={formData.event_date ? new Date(formData.event_date) : new Date()} mode="date" display="default" onChange={(e, d) => onDateChange(e, d, 'event_date', setShowEventPicker)} />
              )}
            </View>
          )}
          <View style={styles.divider} />
          
          <Text style={styles.sectionTitle}>🩺 Consultation Fee (Enrollment)</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.label, { marginTop: 0 }]}>Charge Consultation Fee (₹400)</Text>
              <Text style={{ fontSize: 12, color: chargeConsultation ? '#15803d' : '#64748b', marginTop: 2 }}>
                {chargeConsultation 
                  ? 'Fee: ₹400' 
                  : 'Fee Waived (₹0)'}
              </Text>
            </View>
            <Switch
              value={chargeConsultation}
              onValueChange={setChargeConsultation}
              trackColor={{ false: '#cbd5e1', true: '#86efac' }}
              thumbColor={chargeConsultation ? '#16a34a' : '#f1f5f9'}
            />
          </View>

          {chargeConsultation && (
            <View style={{ marginTop: 10, padding: 12, backgroundColor: '#f0fdf4', borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#166534' }}>Amount Payable:</Text>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#166534' }}>₹400</Text>
              </View>

              <Text style={[styles.label, { marginTop: 0, marginBottom: 6, color: '#166534' }]}>Select Payment Mode:</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.paymentModeBtn,
                    consultationPaymentMode === 'CASH' && styles.paymentModeBtnActive
                  ]}
                  onPress={() => handlePaymentModeSelect('CASH')}
                >
                  <Text style={[
                    styles.paymentModeText,
                    consultationPaymentMode === 'CASH' && styles.paymentModeTextActive
                  ]}>💵 Cash</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.paymentModeBtn,
                    consultationPaymentMode === 'UPI' && styles.paymentModeBtnActive
                  ]}
                  onPress={() => handlePaymentModeSelect('UPI')}
                >
                  <Text style={[
                    styles.paymentModeText,
                    consultationPaymentMode === 'UPI' && styles.paymentModeTextActive
                  ]}>📱 UPI / QR</Text>
                </TouchableOpacity>
              </View>

              {consultationPaymentMode === 'UPI' && (
                <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#bbf7d0' }}>
                  {!clinicQrCompleted ? (
                    <View style={{ backgroundColor: '#fef3c7', padding: 8, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#f59e0b' }}>
                      <Text style={{ fontSize: 11, color: '#92400e', fontWeight: 'bold' }}>
                        ⚠️ Daily Mandate: 1 Clinic QR payment required today (0 done so far).
                      </Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#ecfdf5', padding: 6, borderRadius: 6, marginBottom: 8 }}>
                      <Text style={{ fontSize: 11, color: '#065f46', fontWeight: '600' }}>
                        ✅ Daily Clinic QR completed for today.
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#166534', marginBottom: 6 }}>Receiving UPI Account:</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        paddingHorizontal: 4,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: regUpiAccount === 'STORE' ? '#15803d' : '#cbd5e1',
                        backgroundColor: regUpiAccount === 'STORE' ? '#15803d' : '#fff',
                        alignItems: 'center'
                      }}
                      onPress={() => setRegUpiAccount('STORE')}
                    >
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: regUpiAccount === 'STORE' ? '#fff' : '#334155' }}>
                        🛒 Store (Default)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        paddingHorizontal: 4,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: regUpiAccount === 'CLINIC' ? '#15803d' : '#cbd5e1',
                        backgroundColor: regUpiAccount === 'CLINIC' ? '#15803d' : '#fff',
                        alignItems: 'center'
                      }}
                      onPress={() => setRegUpiAccount('CLINIC')}
                    >
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: regUpiAccount === 'CLINIC' ? '#fff' : '#334155' }}>
                        🏥 Laser & Clinic
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color='#fff' /> : <Text style={styles.submitBtnText}>Register Patient</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { marginRight: 15 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 20 },
  formSection: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginVertical: 10 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 5 },
  rowBtnContainer: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  choiceBtn: { flex: 1, padding: 12, borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, alignItems: 'center' },
  choiceSelected: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  choiceText: { color: '#4b5563', fontWeight: 'bold' },
  choiceTextSelected: { color: '#fff' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 20 },
  concernGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  concernBox: { padding: 8, borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 20, backgroundColor: '#f9fafc' },
  concernBoxSelected: { backgroundColor: '#3A0707', borderColor: '#3A0707' },
  concernBoxText: { color: '#4b5563', fontSize: 12 },
  concernBoxTextSelected: { color: '#fff', fontSize: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 10 },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 30 },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  paymentModeBtn: { flex: 1, paddingVertical: 10, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 8, alignItems: 'center', backgroundColor: '#fff' },
  paymentModeBtnActive: { backgroundColor: '#15803d', borderColor: '#15803d' },
  paymentModeText: { color: '#334155', fontWeight: 'bold', fontSize: 14 },
  paymentModeTextActive: { color: '#fff' }
});
