import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  KeyboardAvoidingView
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

const API_BASE_URL = 'https://skinssence-api-1.onrender.com';

const QUICK_PROCEDURES = [
  'Hydrafacial',
  'Hair Spa',
  'Chemical Peel',
  'Laser Hair Removal',
  'Carbon Laser Peel',
  'PRP Face',
  'PRP Hair Therapy',
  'Dermapen Microneedling'
];

const QUICK_TIMES = [
  '11:00 AM',
  '11:15 AM',
  '11:30 AM',
  '12:00 PM',
  '01:00 PM',
  '04:00 PM',
  '05:00 PM',
  '06:00 PM'
];

const QUICK_AMOUNTS = ['500', '1000', '1500', '2000'];

const PAYMENT_MODES = ['CASH', 'UPI (Store)', 'UPI (Clinic)', 'CARD'];

export default function AdvanceBookingModal({ visible, patient, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);

  // 1. Booking / Transaction Date (Default: Today)
  const [bookingDate, setBookingDate] = useState(new Date());
  const [showBookingDatePicker, setShowBookingDatePicker] = useState(false);

  // 2. Appointment / Procedure Date
  // Default to 14 days in future or customized
  const defaultApptDate = new Date();
  defaultApptDate.setDate(defaultApptDate.getDate() + 14);
  const [appointmentDate, setAppointmentDate] = useState(defaultApptDate);
  const [showApptDatePicker, setShowApptDatePicker] = useState(false);

  // 3. Time Slot
  const [appointmentTime, setAppointmentTime] = useState('11:15 AM');

  // 4. Planned Procedure(s)
  const [plannedProcedures, setPlannedProcedures] = useState('Hydrafacial & Hair Spa');

  // 5. Advance Amount & Mode
  const [advanceAmount, setAdvanceAmount] = useState('500');
  const [paymentMode, setPaymentMode] = useState('UPI (Store)');

  // 6. Estimated Total (Optional)
  const [estimatedTotal, setEstimatedTotal] = useState('');

  // 7. Notes
  const [notes, setNotes] = useState('');

  const formatDateYMD = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatDisplayDate = (dateObj) => {
    return dateObj.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleAddProcTag = (tag) => {
    if (!plannedProcedures.trim()) {
      setPlannedProcedures(tag);
    } else if (!plannedProcedures.toLowerCase().includes(tag.toLowerCase())) {
      setPlannedProcedures(`${plannedProcedures} + ${tag}`);
    }
  };

  const advanceNum = parseFloat(advanceAmount) || 0;
  const estTotalNum = parseFloat(estimatedTotal) || 0;
  const approxBalance = estTotalNum > advanceNum ? estTotalNum - advanceNum : 0;

  const handleSubmit = async () => {
    if (!advanceNum || advanceNum <= 0) {
      Alert.alert('Invalid Advance', 'Please enter a valid advance payment amount (e.g. ₹500).');
      return;
    }

    if (!plannedProcedures.trim()) {
      Alert.alert('Procedure Required', 'Please enter the planned service or procedure.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        patient_id: patient.id,
        booking_date: formatDateYMD(bookingDate),
        appointment_date: formatDateYMD(appointmentDate),
        appointment_time: appointmentTime,
        planned_procedures: plannedProcedures.trim(),
        advance_amount: advanceNum,
        payment_mode: paymentMode,
        estimated_total: estTotalNum > 0 ? estTotalNum : null,
        notes: notes.trim()
      };

      const res = await axios.post(`${API_BASE_URL}/api/advance-bookings`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { receipt_text, clean_mobile } = res.data;

      Alert.alert(
        'Advance Booking Confirmed! 🎉',
        `₹${advanceNum.toFixed(0)} advance recorded for ${formatDisplayDate(appointmentDate)}.\n\nAccount balance updated and appointment scheduled.`,
        [
          {
            text: 'Close',
            style: 'cancel',
            onPress: () => {
              if (onSuccess) onSuccess();
              onClose();
            }
          },
          {
            text: '📲 Share on WhatsApp',
            style: 'default',
            onPress: () => {
              const url = `whatsapp://send?phone=91${clean_mobile}&text=${encodeURIComponent(receipt_text)}`;
              Linking.openURL(url).catch(() => {
                Alert.alert('Error', 'Could not open WhatsApp on this device.');
              });
              if (onSuccess) onSuccess();
              onClose();
            }
          }
        ]
      );
    } catch (err) {
      console.error('Error saving advance booking:', err);
      Alert.alert('Error', err?.response?.data?.error || err.message || 'Failed to record advance booking.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContent}>
          {/* HEADER */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.headerIconCircle}>
                <Ionicons name="ticket" size={20} color="#7c3aed" />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.headerTitle}>Advance Booking & Receipt</Text>
                <Text style={styles.headerSubtitle}>
                  {patient.first_name} {patient.last_name || ''} ({patient.skinssence_id || 'Walk-in'})
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* BOOKING DATE (TRANSACTION DATE - TODAY) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>1. Payment / Booking Date (Today)</Text>
                <TouchableOpacity onPress={() => setShowBookingDatePicker(true)}>
                  <Text style={styles.editDateLink}>Change</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.datePickerBtn}
                onPress={() => setShowBookingDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color="#475569" style={{ marginRight: 8 }} />
                <Text style={styles.datePickerText}>
                  {formatDisplayDate(bookingDate)} (Today)
                </Text>
              </TouchableOpacity>
              {showBookingDatePicker && (
                <DateTimePicker
                  value={bookingDate}
                  mode="date"
                  display="default"
                  onChange={(event, d) => {
                    setShowBookingDatePicker(false);
                    if (d) setBookingDate(d);
                  }}
                />
              )}
            </View>

            {/* APPOINTMENT / PROCEDURE DATE & TIME */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>2. Scheduled Procedure Date & Time</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={[styles.datePickerBtn, { flex: 1.4 }]}
                  onPress={() => setShowApptDatePicker(true)}
                >
                  <Ionicons name="calendar" size={16} color="#7c3aed" style={{ marginRight: 6 }} />
                  <Text style={[styles.datePickerText, { color: '#7c3aed', fontWeight: 'bold' }]}>
                    {formatDisplayDate(appointmentDate)}
                  </Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.textInputBox, { textAlign: 'center', fontWeight: 'bold' }]}
                    value={appointmentTime}
                    onChangeText={setAppointmentTime}
                    placeholder="11:15 AM"
                  />
                </View>
              </View>

              {showApptDatePicker && (
                <DateTimePicker
                  value={appointmentDate}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  onChange={(event, d) => {
                    setShowApptDatePicker(false);
                    if (d) setAppointmentDate(d);
                  }}
                />
              )}

              {/* Quick Time Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {QUICK_TIMES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.chipBtn, appointmentTime === t && styles.chipBtnActive]}
                    onPress={() => setAppointmentTime(t)}
                  >
                    <Text style={[styles.chipBtnText, appointmentTime === t && styles.chipBtnTextActive]}>
                      {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* PLANNED PROCEDURE / SERVICES */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>3. Planned Service(s) / Treatment</Text>
              <TextInput
                style={styles.textInputBox}
                value={plannedProcedures}
                onChangeText={setPlannedProcedures}
                placeholder="e.g. Hydrafacial & Hair Spa"
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {QUICK_PROCEDURES.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={styles.quickTagBtn}
                    onPress={() => handleAddProcTag(p)}
                  >
                    <Ionicons name="add-circle-outline" size={13} color="#7c3aed" style={{ marginRight: 3 }} />
                    <Text style={styles.quickTagText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* ADVANCE PAYMENT AMOUNT & MODE */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>4. Advance Deposit Paid Today (₹)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.textInputBox, styles.amountInput]}
                    keyboardType="numeric"
                    value={advanceAmount}
                    onChangeText={setAdvanceAmount}
                    placeholder="500"
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {QUICK_AMOUNTS.map(a => (
                    <TouchableOpacity
                      key={a}
                      style={[styles.amtChip, advanceAmount === a && styles.amtChipActive]}
                      onPress={() => setAdvanceAmount(a)}
                    >
                      <Text style={[styles.amtChipText, advanceAmount === a && styles.amtChipTextActive]}>
                        ₹{a}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* PAYMENT MODE */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>5. Payment Mode</Text>
              <View style={styles.modeRow}>
                {PAYMENT_MODES.map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeChip, paymentMode === m && styles.modeChipActive]}
                    onPress={() => setPaymentMode(m)}
                  >
                    <Text style={[styles.modeChipText, paymentMode === m && styles.modeChipTextActive]}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ESTIMATED TOTAL (OPTIONAL) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>6. Estimated Service Total (Optional)</Text>
                <Text style={styles.optionalBadge}>Optional</Text>
              </View>
              <TextInput
                style={styles.textInputBox}
                keyboardType="numeric"
                value={estimatedTotal}
                onChangeText={setEstimatedTotal}
                placeholder="e.g. 3500 (Leave blank if procedure price is tentative)"
              />
              <Text style={styles.helperText}>
                {estTotalNum > 0
                  ? `Approx. Balance Due on Visit: ₹${approxBalance.toFixed(0)}`
                  : 'If left blank, receipt states: "Remaining balance payable on visit day as per chosen service."'}
              </Text>
            </View>

            {/* BOOKING NOTES */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>7. Notes / Remarks (Optional)</Text>
              <TextInput
                style={[styles.textInputBox, { height: 44 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Client requested 11:15 AM sharp"
              />
            </View>

            {/* RECEIPT PREVIEW SUMMARY CARD */}
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>Receipt Preview Summary:</Text>
              <Text style={styles.summaryRow}>• Patient: {patient.first_name} ({patient.skinssence_id})</Text>
              <Text style={styles.summaryRow}>• Scheduled: {formatDisplayDate(appointmentDate)} at {appointmentTime}</Text>
              <Text style={styles.summaryRow}>• Planned Service: {plannedProcedures || 'Procedure'}</Text>
              <Text style={[styles.summaryRow, { fontWeight: 'bold', color: '#15803d' }]}>
                • Advance Paid: ₹{advanceNum.toFixed(0)} ({paymentMode})
              </Text>
              <Text style={styles.summaryTerms}>
                Notice: All WhatsApp receipts and terms will be sent in 100% clean English.
              </Text>
            </View>
          </ScrollView>

          {/* FOOTER BUTTONS */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.confirmBtn, submitting && styles.disabledBtn]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.confirmBtnText}>Save & Send WhatsApp</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    elevation: 8
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b'
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1
  },
  closeBtn: {
    padding: 4
  },
  formScroll: {
    paddingHorizontal: 16,
    paddingTop: 12
  },
  inputGroup: {
    marginBottom: 14
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 5
  },
  editDateLink: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#7c3aed'
  },
  optionalBadge: {
    fontSize: 10,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  datePickerText: {
    fontSize: 14,
    color: '#1e293b'
  },
  textInputBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b'
  },
  amountInput: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a'
  },
  chipsScroll: {
    marginTop: 6
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 6
  },
  chipBtnActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#c4b5fd'
  },
  chipBtnText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600'
  },
  chipBtnTextActive: {
    color: '#7c3aed',
    fontWeight: 'bold'
  },
  quickTagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#ddd6fe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6
  },
  quickTagText: {
    fontSize: 11,
    color: '#6d28d9',
    fontWeight: '600'
  },
  amtChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  amtChipActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#7c3aed'
  },
  amtChipText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569'
  },
  amtChipTextActive: {
    color: '#7c3aed'
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  modeChipActive: {
    backgroundColor: '#047857',
    borderColor: '#047857'
  },
  modeChipText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600'
  },
  modeChipTextActive: {
    color: '#fff',
    fontWeight: 'bold'
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    fontStyle: 'italic'
  },
  summaryBox: {
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    marginBottom: 16
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6b21a8',
    marginBottom: 4
  },
  summaryRow: {
    fontSize: 12,
    color: '#334155',
    marginVertical: 1
  },
  summaryTerms: {
    fontSize: 10,
    color: '#7e22ce',
    marginTop: 6,
    fontStyle: 'italic'
  },
  footerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row'
  },
  cancelBtn: {
    backgroundColor: '#f1f5f9'
  },
  cancelBtnText: {
    color: '#475569',
    fontWeight: 'bold',
    fontSize: 13
  },
  confirmBtn: {
    backgroundColor: '#7c3aed',
    flex: 1.6
  },
  confirmBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13
  },
  disabledBtn: {
    opacity: 0.6
  }
});
