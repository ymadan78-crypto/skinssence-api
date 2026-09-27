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
  Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';

const PRESET_REASONS = [
  'Treatment completed',
  'Patient does not require further follow-up',
  'Treatment terminated',
  'Other'
];

export default function PendingFollowupReminderModal({
  visible,
  onClose,
  navigation,
  onUpdated,
  initialPatients = null
}) {
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState(initialPatients || []);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [showNotRequiredForm, setShowNotRequiredForm] = useState(false);
  const [selectedReason, setSelectedReason] = useState(PRESET_REASONS[0]);
  const [customReasonNotes, setCustomReasonNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialPatients && Array.isArray(initialPatients) && initialPatients.length > 0) {
        setPatients(initialPatients);
        setSelectedPatientId(initialPatients[0]?.patient_id || null);
      } else {
        fetchPendingPatients();
      }
      setShowNotRequiredForm(false);
      setSelectedReason(PRESET_REASONS[0]);
      setCustomReasonNotes('');
    }
  }, [visible, initialPatients]);

  const fetchPendingPatients = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      let res;
      try {
        res = await axios.get('https://skinssence-api.onrender.com/api/appointments/pending-followups', {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (cloudErr) {
        res = await axios.get('http://localhost:3000/api/appointments/pending-followups', {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      const list = res.data?.pendingPatients || [];
      setPatients(list);
      if (list.length > 0) {
        setSelectedPatientId(list[0].patient_id);
      } else {
        setSelectedPatientId(null);
      }
    } catch (e) {
      console.log('Error fetching pending follow-up patients:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDismissHourly = async () => {
    try {
      await AsyncStorage.setItem('@last_followup_reminder_time', Date.now().toString());
    } catch (e) {}
    onClose();
  };

  const selectedPatient = patients.find(p => p.patient_id === selectedPatientId);

  const handleBookAppointment = () => {
    if (!selectedPatient) {
      Alert.alert('Select Patient', 'Please select a patient to book a follow-up appointment.');
      return;
    }
    AsyncStorage.setItem('@last_followup_reminder_time', Date.now().toString()).catch(() => {});
    onClose();
    navigation.navigate('AppointmentCalendar', {
      patient: {
        first_name: selectedPatient.first_name,
        last_name: selectedPatient.last_name || '',
        mobile: selectedPatient.mobile || '',
        skinssence_id: selectedPatient.skinssence_id || '',
        id: selectedPatient.patient_id
      }
    });
  };

  const handleMarkNotRequired = async () => {
    if (!selectedPatient) {
      Alert.alert('Select Patient', 'Please select a patient.');
      return;
    }
    if (selectedReason === 'Other' && !customReasonNotes.trim()) {
      Alert.alert('Reason Required', 'Please enter a note for why follow-up is not required.');
      return;
    }

    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        patient_id: selectedPatient.patient_id,
        visit_id: selectedPatient.latest_visit_id,
        reason: selectedReason,
        notes: customReasonNotes.trim()
      };

      try {
        await axios.post('https://skinssence-api.onrender.com/api/appointments/followup-not-required', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (cloudErr) {
        await axios.post('http://localhost:3000/api/appointments/followup-not-required', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      const updatedList = patients.filter(p => p.patient_id !== selectedPatient.patient_id);
      setPatients(updatedList);
      setShowNotRequiredForm(false);
      setCustomReasonNotes('');

      if (updatedList.length > 0) {
        setSelectedPatientId(updatedList[0].patient_id);
      } else {
        setSelectedPatientId(null);
        setTimeout(() => {
          onClose();
        }, 300);
      }

      if (onUpdated) onUpdated();
    } catch (e) {
      console.log('Error marking followup not required:', e);
      Alert.alert('Error', 'Failed to update follow-up status. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismissHourly}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* HEADER */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.iconCircle}>
                <Ionicons name="calendar-outline" size={20} color="#475569" />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.headerTitle}>Follow-up Reminder</Text>
                <Text style={styles.headerSub}>
                  Follow-ups pending: <Text style={{ fontWeight: 'bold', color: '#0f172a' }}>{patients.length}</Text>
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleDismissHourly} style={styles.closeIconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#475569" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          ) : patients.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#10b981" />
              <Text style={styles.emptyTitle}>All Caught Up</Text>
              <Text style={styles.emptySub}>
                No pending follow-ups for today's visited patients.
              </Text>
              <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
                <Text style={styles.dismissBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
              {/* COMPACT PATIENT LIST */}
              <View style={styles.patientListContainer}>
                {patients.map(item => {
                  const isSelected = item.patient_id === selectedPatientId;
                  return (
                    <TouchableOpacity
                      key={item.patient_id}
                      style={[styles.patientCard, isSelected && styles.selectedPatientCard]}
                      onPress={() => {
                        setSelectedPatientId(item.patient_id);
                        setShowNotRequiredForm(false);
                      }}>
                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                      <View style={{ flex: 1, marginLeft: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={[styles.patientName, isSelected && styles.selectedPatientName]}>
                          {item.first_name} {item.last_name || ''}
                        </Text>
                        {item.skinssence_id ? (
                          <Text style={styles.sNumText}>{item.skinssence_id}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ACTIONS FOR SELECTED PATIENT */}
              {selectedPatient && !showNotRequiredForm && (
                <View style={styles.actionSection}>
                  <TouchableOpacity style={styles.bookBtn} onPress={handleBookAppointment}>
                    <Text style={styles.bookBtnText}>Book Follow-up Appointment</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.notRequiredToggleBtn}
                    onPress={() => setShowNotRequiredForm(true)}>
                    <Text style={styles.notRequiredToggleText}>Follow-up Not Required</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* NOT REQUIRED SUB-FORM */}
              {selectedPatient && showNotRequiredForm && (
                <View style={styles.notRequiredCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.notRequiredHeader}>Reason:</Text>
                    <TouchableOpacity onPress={() => setShowNotRequiredForm(false)}>
                      <Text style={{ color: '#64748b', fontSize: 12 }}>Cancel</Text>
                    </TouchableOpacity>
                  </View>

                  {PRESET_REASONS.map(reason => (
                    <TouchableOpacity
                      key={reason}
                      style={styles.reasonOption}
                      onPress={() => setSelectedReason(reason)}>
                      <Ionicons
                        name={selectedReason === reason ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={selectedReason === reason ? '#5C0B0B' : '#94a3b8'}
                      />
                      <Text style={[styles.reasonOptionText, selectedReason === reason && { fontWeight: '600', color: '#0f172a' }]}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {selectedReason === 'Other' && (
                    <TextInput
                      style={styles.notesInput}
                      placeholder="Note..."
                      placeholderTextColor="#94a3b8"
                      value={customReasonNotes}
                      onChangeText={setCustomReasonNotes}
                    />
                  )}

                  <TouchableOpacity
                    style={[styles.confirmNotRequiredBtn, submitting && { opacity: 0.7 }]}
                    onPress={handleMarkNotRequired}
                    disabled={submitting}>
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.confirmNotRequiredText}>Confirm & Remove</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* DISMISS / SNOOZE */}
              <TouchableOpacity style={styles.snoozeBtn} onPress={handleDismissHourly}>
                <Text style={styles.snoozeBtnText}>Remind in 1 Hour</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    width: '100%',
    maxWidth: 420,
    maxHeight: Dimensions.get('window').height * 0.8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff'
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a'
  },
  headerSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1
  },
  closeIconBtn: {
    padding: 4,
    borderRadius: 6
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b'
  },
  emptyContainer: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 10
  },
  emptySub: {
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4
  },
  dismissBtn: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6
  },
  dismissBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13
  },
  bodyScroll: {
    padding: 14
  },
  patientListContainer: {
    marginBottom: 10
  },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 6
  },
  selectedPatientCard: {
    backgroundColor: '#f8fafc',
    borderColor: '#64748b'
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center'
  },
  radioOuterSelected: {
    borderColor: '#0f172a'
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#0f172a'
  },
  patientName: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1e293b'
  },
  selectedPatientName: {
    color: '#0f172a',
    fontWeight: '700'
  },
  sNumText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500'
  },
  actionSection: {
    marginTop: 4,
    marginBottom: 8
  },
  bookBtn: {
    backgroundColor: '#5C0B0B',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 6
  },
  bookBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13.5
  },
  notRequiredToggleBtn: {
    backgroundColor: '#ffffff',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  notRequiredToggleText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13
  },
  notRequiredCard: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
    marginBottom: 8
  },
  notRequiredHeader: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155'
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6
  },
  reasonOptionText: {
    fontSize: 12.5,
    color: '#475569',
    marginLeft: 8
  },
  notesInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12.5,
    color: '#1e293b',
    marginTop: 4,
    marginBottom: 6
  },
  confirmNotRequiredBtn: {
    backgroundColor: '#334155',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 6
  },
  confirmNotRequiredText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12.5
  },
  snoozeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 2
  },
  snoozeBtnText: {
    fontSize: 12,
    color: '#64748b'
  }
});
