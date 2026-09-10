import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  Linking, 
  Alert, 
  Share, 
  Modal, 
  TextInput 
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateFollowUpMessage } from '../utils/whatsappHelper';

export default function AppointmentRemindersScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [filter, setFilter] = useState('CURRENT'); // 'CURRENT', 'RECENT_PAST', 'NEXT_3_DAYS', 'ALL'
  const [renderError, setRenderError] = useState(null);

  // Call Outcome / Report Modal State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState('Spoke - Response Taken / Confirmed');
  const [reportNote, setReportNote] = useState('');

  const API_URL = 'https://skinssence-api.onrender.com/api/appointments';

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    setLoading(true);
    setRenderError(null);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_URL}/reminders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setAppointments(res.data);
      } else {
        console.warn('[Call Reminder] Non-array response received:', res.data);
        setAppointments([]);
      }
    } catch (error) {
      console.error('[Call Reminder Exception in fetchReminders]:', error);
      setRenderError(error.message || 'Failed to fetch follow-up reminders.');
    } finally {
      setLoading(false);
    }
  };

  // Safe Date Parsing Helper
  const parseDateSafely = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    try {
      const clean = dateStr.trim().split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return new Date(y, m, d);
        }
      }
      const dObj = new Date(clean);
      if (!isNaN(dObj.getTime())) return dObj;
    } catch (e) {
      console.log('[Date Parse Error]:', e);
    }
    return null;
  };

  const formatDateDisplay = (dateStr) => {
    const d = parseDateSafely(dateStr);
    if (!d) return dateStr || 'Date Not Set';
    try {
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }
  };

  const getDueCategory = (dateStr) => {
    const apptDate = parseDateSafely(dateStr);
    if (!apptDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    apptDate.setHours(0, 0, 0, 0);

    const diffDays = Math.round((apptDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (isNaN(diffDays)) return null;

    // Category 1: Recent Past - Response Pending (Last 3 Days: -3, -2, -1)
    if (diffDays >= -3 && diffDays <= -1) {
      return {
        category: 'RECENT_PAST',
        diffDays,
        label: `🕒 PENDING (${Math.abs(diffDays)}d ago)`,
        badgeText: `${Math.abs(diffDays)}d ago`,
        color: '#b91c1c',
        isRecentPast: true
      };
    }

    // Category 2: Current (Today & Tomorrow: 0, 1)
    if (diffDays === 0) {
      return {
        category: 'CURRENT',
        diffDays,
        label: '🔥 DUE TODAY',
        badgeText: 'Today',
        color: '#ef4444',
        isToday: true
      };
    }
    if (diffDays === 1) {
      return {
        category: 'CURRENT',
        diffDays,
        label: '📅 DUE TOMORROW',
        badgeText: 'Tomorrow',
        color: '#2563eb',
        isTomorrow: true
      };
    }

    // Category 3: Next 3 Days (After Tomorrow: 2, 3, 4)
    if (diffDays >= 2 && diffDays <= 4) {
      return {
        category: 'NEXT_3_DAYS',
        diffDays,
        label: `⏳ DUE IN ${diffDays} DAYS`,
        badgeText: `In ${diffDays}d`,
        color: '#059669',
        isNext3Days: true
      };
    }

    return null; // Out of the -3 to +4 window
  };

  const getDueDetails = (dateStr) => {
    const cat = getDueCategory(dateStr);
    if (cat) return cat;
    return { label: 'SCHEDULED', color: '#6b7280', diffDays: null, category: 'OTHER' };
  };

  // Safe Status Update
  const updateStatus = async (id, status, outcome = null, noteText = null) => {
    if (!id) return;
    setActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_URL}/${id}/status`, { 
        status, 
        call_outcome: outcome,
        notes: noteText 
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Update local state immediately: remove if response taken, cancelled, completed, or rescheduled
      if (['CANCELLED', 'COMPLETED', 'RESPONSE_TAKEN', 'CONFIRMED', 'RESCHEDULED', 'VISITED'].includes(status)) {
        setAppointments(prev => prev.filter(a => a && a.id !== id));
      } else {
        setAppointments(prev => prev.map(a => a && a.id === id ? { ...a, status, notes: noteText || a.notes } : a));
      }

      Alert.alert('Success', `Follow-up updated: ${status === 'RESPONSE_TAKEN' ? 'Response Taken' : status}`);
    } catch (error) {
      console.error('[Call Reminder Update Error]:', error);
      Alert.alert('Update Failed', error.response?.data?.error || 'Could not update follow-up status.');
    } finally {
      setActionLoading(false);
    }
  };

  // Safe Cancel Action with Confirmation
  const handleCancelReminder = (appt) => {
    if (!appt || !appt.id) return;
    const patientName = appt.patient_name || 'this patient';

    Alert.alert(
      'Cancel Reminder',
      `Are you sure you want to cancel the reminder for ${patientName}? This will remove it from active call lists.`,
      [
        { text: 'Keep', style: 'cancel' },
        { 
          text: 'Yes, Cancel', 
          style: 'destructive',
          onPress: () => updateStatus(appt.id, 'CANCELLED', 'Cancelled by Staff')
        }
      ]
    );
  };

  // Instant Mark Response Taken
  const handleMarkResponseTaken = (appt) => {
    if (!appt || !appt.id) return;
    Alert.alert(
      'Mark Response Taken',
      `Confirm response taken from ${appt.patient_name || 'this patient'}? This will clear this call reminder.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: '✓ Response Taken', 
          style: 'default',
          onPress: () => updateStatus(appt.id, 'RESPONSE_TAKEN', 'Response Taken by Staff', 'Spoke with client - response taken')
        }
      ]
    );
  };

  // Open Report Call Outcome Modal
  const handleOpenReportModal = (appt) => {
    setSelectedAppt(appt);
    setSelectedOutcome('Spoke - Response Taken / Confirmed');
    setReportNote('');
    setReportModalVisible(true);
  };

  // Submit Call Outcome Report
  const handleSubmitReport = async () => {
    if (!selectedAppt) return;
    setReportModalVisible(false);

    let newStatus = 'RESPONSE_TAKEN';
    if (selectedOutcome === 'Cancelled by Client') newStatus = 'CANCELLED';
    else if (selectedOutcome === 'Requested Reschedule') newStatus = 'RESCHEDULED';
    else if (selectedOutcome === 'No Answer / Call Back Later') newStatus = 'NO_ANSWER';
    else if (selectedOutcome.includes('Response Taken') || selectedOutcome.includes('Spoke')) newStatus = 'RESPONSE_TAKEN';

    await updateStatus(selectedAppt.id, newStatus, selectedOutcome, reportNote.trim() || null);
  };

  // Safe Phone Call
  const handleCall = (mobile) => {
    if (!mobile) return Alert.alert('Missing Number', 'No phone number available for this patient.');
    const clean = String(mobile).replace(/\D/g, '');
    Linking.openURL(`tel:${clean}`).catch(err => {
      console.log('[Phone Call Error]:', err);
      Alert.alert('Dialer Error', 'Could not launch phone dialer on this device.');
    });
  };

  // Safe WhatsApp Messaging
  const handleSendWhatsApp = (appt) => {
    const mobile = appt?.mobile || appt?.patient_mobile;
    if (!mobile) return Alert.alert('Missing Number', 'Mobile number not found.');
    
    let msg = '';
    try {
      msg = generateFollowUpMessage(appt);
    } catch (e) {
      console.log('[FollowUp Message Generation Error]:', e);
      msg = `Hello ${appt?.patient_name || 'Client'}, this is a reminder from Skinssence Laser & Skincare Clinic regarding your follow-up appointment.`;
    }

    const clean = String(mobile).replace(/\D/g, '');
    const phoneWithCode = clean.startsWith('91') ? clean : `91${clean}`;
    
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}&phone=${phoneWithCode}`).catch(err => {
      console.log('[WhatsApp Launch Error]:', err);
      Alert.alert('WhatsApp Error', 'WhatsApp does not appear to be installed on this device.');
    });
  };

  // Safe Message Sharing / Copying using React Native Share API
  const handleShareMessage = async (appt) => {
    try {
      const msg = generateFollowUpMessage(appt);
      await Share.share({
        message: msg,
        title: 'Skinssence Follow-up Reminder'
      });
    } catch (error) {
      console.log('[Share Error]:', error);
      Alert.alert('Share', 'Could not share message.');
    }
  };

  // Filter appointments safely: Exclude visited, rescheduled, or response taken
  const safeAppointments = (appointments || []).filter(a => a && typeof a === 'object');
  
  const pendingReminders = safeAppointments.filter(appt => {
    // 1. Do not show patient that already visited
    if (appt.has_visited && appt.has_visited > 0) return false;

    // 2. Do not show rescheduled or completed appointments
    const st = String(appt.status || '').toUpperCase();
    if (st.includes('RESCHEDULE') || st === 'CANCELLED' || st === 'COMPLETED' || st === 'VISITED') return false;

    // 3. Do not show if staff marked response taken
    if (['RESPONSE_TAKEN', 'CONFIRMED', 'DONE', 'CALLED'].includes(st)) return false;
    if ((appt.notes || '').includes('[Call: Spoke - Confirmed') || (appt.notes || '').includes('[Call: Response Taken]')) return false;

    // Must be in one of the three categories: Recent Past (-3d), Current (Today/Tmrw), or Next 3 Days
    const cat = getDueCategory(appt.appointment_date);
    return cat !== null;
  });

  const countCurrent = pendingReminders.filter(a => getDueCategory(a.appointment_date)?.category === 'CURRENT').length;
  const countRecentPast = pendingReminders.filter(a => getDueCategory(a.appointment_date)?.category === 'RECENT_PAST').length;
  const countNext3Days = pendingReminders.filter(a => getDueCategory(a.appointment_date)?.category === 'NEXT_3_DAYS').length;

  const filteredAppointments = pendingReminders.filter(appt => {
    const cat = getDueCategory(appt.appointment_date);
    if (!cat) return false;
    if (filter === 'ALL') return true;
    return cat.category === filter;
  });

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Call & Follow-up Reminders</Text>
      </View>

      {/* THREE CATEGORY FILTER TABS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={{ paddingHorizontal: 10 }}>
        {[
          { key: 'CURRENT', label: `📅 Today & Tomorrow (${countCurrent})` },
          { key: 'RECENT_PAST', label: `🕒 Recent Past: Last 3d (${countRecentPast})` },
          { key: 'NEXT_3_DAYS', label: `⏳ Next 3 Days (${countNext3Days})` },
          { key: 'ALL', label: `All Active (${pendingReminders.length})` }
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterChip, filter === tab.key && styles.filterChipActive]}
            onPress={() => setFilter(tab.key)}>
            <Text style={[styles.filterChipText, filter === tab.key && styles.filterChipTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ERROR RECOVERY CARD */}
      {renderError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>⚠️ Unable to Load Reminders</Text>
          <Text style={styles.errorText}>{renderError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchReminders}>
            <Text style={styles.retryBtnText}>🔄 Retry Loading</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* LOADING INDICATOR */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#5C0B0B" />
          <Text style={{ color: '#666', marginTop: 12 }}>Loading call reminders...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionDesc}>
            Ready-to-call patient reminders. Tap "Report Call" to log outcomes, or "Cancel" to clear.
          </Text>

          {/* EMPTY STATE */}
          {filteredAppointments.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📞</Text>
              <Text style={styles.emptyTitle}>No Reminders Found</Text>
              <Text style={styles.emptyText}>There are no follow-ups scheduled under this category.</Text>
              <TouchableOpacity 
                style={styles.bookNewBtn} 
                onPress={() => navigation.navigate('AppointmentCalendar')}>
                <Text style={styles.bookNewBtnText}>+ Book New Follow-up</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredAppointments.map((appt) => {
              const due = getDueDetails(appt.appointment_date);
              let readyMessage = '';
              try {
                readyMessage = generateFollowUpMessage(appt);
              } catch (e) {
                readyMessage = `Hello ${appt.patient_name || 'Client'}, this is a reminder regarding your upcoming appointment at Skinssence Clinic.`;
              }

              const patientName = String(appt.patient_name || 'Client').trim();
              const patientId = String(appt.patient_id || '').trim();
              const phone = String(appt.mobile || '').trim();
              const notes = String(appt.notes || 'Follow-up Consultation / Review').trim();
              const apptTime = String(appt.appointment_time || '').trim();
              const status = String(appt.status || 'SCHEDULED').trim().toUpperCase();

              return (
                <View key={appt.id || Math.random().toString()} style={[styles.card, { borderLeftColor: due.color }]}>
                  {/* CARD HEADER */}
                  <View style={styles.cardHeader}>
                    <View style={[styles.badge, { backgroundColor: due.color }]}>
                      <Text style={styles.badgeText}>{due.label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {apptTime ? (
                        <Text style={styles.apptTime}>⏰ {apptTime} &nbsp;</Text>
                      ) : null}
                      <View style={[styles.statusBadge, status === 'CONFIRMED' ? { backgroundColor: '#dcfce7' } : { backgroundColor: '#f1f5f9' }]}>
                        <Text style={[styles.statusBadgeText, status === 'CONFIRMED' ? { color: '#16a34a' } : { color: '#64748b' }]}>
                          {status}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* CLIENT INFO */}
                  <View style={styles.clientInfoRow}>
                    <Text style={styles.patientName}>{patientName} {patientId ? `(${patientId})` : ''}</Text>
                    <Text style={styles.patientPhone}>📞 {phone || 'No Mobile'}</Text>
                  </View>

                  {/* PURPOSE & DETAILS */}
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Purpose / Reason:</Text>
                    <Text style={styles.detailValue}>{notes}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Follow-up Due:</Text>
                    <Text style={[styles.detailValue, { fontWeight: 'bold' }]}>
                      {formatDateDisplay(appt.appointment_date)}
                    </Text>
                  </View>

                  {/* READY WHATSAPP MESSAGE BOX */}
                  <View style={styles.messageBox}>
                    <View style={styles.messageHeader}>
                      <Text style={styles.messageTitle}>💬 Ready Message:</Text>
                      <TouchableOpacity onPress={() => handleShareMessage(appt)} style={styles.copyBtn}>
                        <Text style={styles.copyBtnText}>📋 Share / Copy</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.messageBody}>{readyMessage}</Text>
                  </View>

                  {/* DIRECT ACTION BUTTONS: WHATSAPP + CALL */}
                  <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.waBtn} onPress={() => handleSendWhatsApp(appt)}>
                      <Text style={styles.waText}>📲 Send WhatsApp</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.callBtn} onPress={() => handleCall(phone)}>
                      <Text style={styles.callText}>📞 Direct Call</Text>
                    </TouchableOpacity>
                  </View>

                  {/* WORKFLOW / OUTCOME ACTIONS: RESPONSE TAKEN & LOG CALL */}
                  <View style={styles.statusRow}>
                    <TouchableOpacity 
                      style={[styles.statusBtn, { backgroundColor: '#10b981', flex: 1.2 }]} 
                      onPress={() => handleMarkResponseTaken(appt)}
                      disabled={actionLoading}
                    >
                      <Text style={styles.statusBtnText}>✓ Response Taken</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.statusBtn, { backgroundColor: '#2563eb', flex: 1 }]} 
                      onPress={() => handleOpenReportModal(appt)}
                      disabled={actionLoading}
                    >
                      <Text style={styles.statusBtnText}>📝 Log Outcome</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.statusBtn, { backgroundColor: '#ef4444', flex: 0.8 }]} 
                      onPress={() => handleCancelReminder(appt)}
                      disabled={actionLoading}
                    >
                      <Text style={styles.statusBtnText}>❌ Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* CALL OUTCOME REPORT MODAL */}
      <Modal
        visible={reportModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setReportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📝 Log Call Outcome</Text>
            <Text style={styles.modalSubtitle}>
              Patient: {selectedAppt?.patient_name} ({selectedAppt?.mobile})
            </Text>

            <Text style={styles.modalLabel}>Select Call Result:</Text>
            {[
              'Spoke - Response Taken / Confirmed',
              'Requested Reschedule',
              'Cancelled by Client',
              'No Answer / Call Back Later'
            ].map(outcome => (
              <TouchableOpacity
                key={outcome}
                style={[styles.outcomeOption, selectedOutcome === outcome && styles.outcomeOptionActive]}
                onPress={() => setSelectedOutcome(outcome)}
              >
                <Text style={[styles.outcomeOptionText, selectedOutcome === outcome && styles.outcomeOptionTextActive]}>
                  {selectedOutcome === outcome ? '● ' : '○ '} {outcome}
                </Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>Call Notes (Optional):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Will call back tomorrow, traveling"
              value={reportNote}
              onChangeText={setReportNote}
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setReportModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.modalSaveBtn} 
                onPress={handleSubmitReport}
              >
                <Text style={styles.modalSaveText}>Save Outcome</Text>
              </TouchableOpacity>
            </View>
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
  filterBar: { backgroundColor: '#fff', paddingVertical: 10, elevation: 2, maxHeight: 55 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f3f4f6', marginRight: 8, height: 34, justifyContent: 'center' },
  filterChipActive: { backgroundColor: '#5C0B0B' },
  filterChipText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
  filterChipTextActive: { color: '#fff', fontWeight: 'bold' },
  scrollContent: { padding: 15, paddingBottom: 40 },
  sectionDesc: { fontSize: 13, color: '#6b7280', marginBottom: 12, fontStyle: 'italic' },
  
  errorBox: { backgroundColor: '#fef2f2', padding: 16, margin: 15, borderRadius: 10, borderWidth: 1, borderColor: '#fca5a5' },
  errorTitle: { color: '#991b1b', fontWeight: 'bold', fontSize: 15, marginBottom: 4 },
  errorText: { color: '#b91c1c', fontSize: 13, marginBottom: 10 },
  retryBtn: { backgroundColor: '#dc2626', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignSelf: 'flex-start' },
  retryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  emptyBox: { backgroundColor: '#fff', padding: 30, borderRadius: 12, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1.5, borderColor: '#cbd5e1', marginTop: 30 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#334155', marginBottom: 4 },
  emptyText: { color: '#64748b', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  bookNewBtn: { backgroundColor: '#5C0B0B', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  bookNewBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  card: { backgroundColor: '#fff', padding: 16, borderRadius: 10, elevation: 2, marginBottom: 16, borderLeftWidth: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  apptTime: { fontSize: 13, fontWeight: 'bold', color: '#1f2937' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  clientInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  patientName: { fontSize: 17, fontWeight: 'bold', color: '#111827', flex: 1 },
  patientPhone: { fontSize: 13, color: '#059669', fontWeight: 'bold' },
  detailRow: { flexDirection: 'row', marginBottom: 4 },
  detailLabel: { width: 130, fontSize: 13, color: '#6b7280', fontWeight: '600' },
  detailValue: { flex: 1, fontSize: 13, color: '#1f2937' },
  messageBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 12, marginTop: 10, marginBottom: 12 },
  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  messageTitle: { fontSize: 12, fontWeight: 'bold', color: '#15803d' },
  copyBtn: { backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  copyBtnText: { color: '#15803d', fontSize: 11, fontWeight: 'bold' },
  messageBody: { fontSize: 12, color: '#1f2937', lineHeight: 18, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  waBtn: { flex: 1.2, backgroundColor: '#25D366', paddingVertical: 11, borderRadius: 8, alignItems: 'center', marginRight: 6 },
  waText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  callBtn: { flex: 0.8, backgroundColor: '#0284c7', paddingVertical: 11, borderRadius: 8, alignItems: 'center', marginLeft: 6 },
  callText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  statusBtn: { paddingVertical: 8, borderRadius: 6, flex: 1, marginHorizontal: 3, alignItems: 'center' },
  statusBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 380, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  modalLabel: { fontSize: 13, fontWeight: 'bold', color: '#334155', marginBottom: 8 },
  outcomeOption: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 6 },
  outcomeOptionActive: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  outcomeOptionText: { fontSize: 13, color: '#475569' },
  outcomeOptionTextActive: { color: '#1d4ed8', fontWeight: 'bold' },
  modalInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: '#f8fafc', marginBottom: 16 },
  modalActionRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  modalCancelText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
  modalSaveBtn: { backgroundColor: '#1e40af', paddingVertical: 9, paddingHorizontal: 18, borderRadius: 6 },
  modalSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 13 }
});
