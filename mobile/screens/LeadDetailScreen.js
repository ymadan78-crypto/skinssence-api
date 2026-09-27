import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  AppState,
  Switch
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://skinssence-api.onrender.com/api/leads';

export default function LeadDetailScreen({ navigation, route }) {
  const { lead_id } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Interaction Modal State
  const [interactionModal, setInteractionModal] = useState(false);
  const [interactionType, setInteractionType] = useState('Phone Call');
  const [interactionSummary, setInteractionSummary] = useState('');
  const [interactionNotes, setInteractionNotes] = useState('');

  // Follow-up Modal State
  const [followupModal, setFollowupModal] = useState(false);
  const [fDate, setFDate] = useState('');
  const [fTime, setFTime] = useState('11:00 AM');
  const [fReason, setFReason] = useState('');

  // Complete Follow-up Modal State
  const [completeModal, setCompleteModal] = useState(false);
  const [activeFollowupId, setActiveFollowupId] = useState(null);
  const [compNotes, setCompNotes] = useState('');
  const [nextFDate, setNextFDate] = useState('');
  const [nextFTime, setNextFTime] = useState('11:00 AM');
  const [nextFReason, setNextFReason] = useState('');
  const [nextStatus, setNextStatus] = useState('');


  // Call Outcome Modal State
  const callInitiatedRef = React.useRef(false);
  const [callOutcomeModal, setCallOutcomeModal] = useState(false);
  const [callOutcomeType, setCallOutcomeType] = useState('Spoke - Interested');
  const [callOutcomeNotes, setCallOutcomeNotes] = useState('');
  const [callOutcomeStatus, setCallOutcomeStatus] = useState('Interested');
  const [needFollowup, setNeedFollowup] = useState(true);
  const [callFollowupDate, setCallFollowupDate] = useState('');
  const [callFollowupTime, setCallFollowupTime] = useState('11:00 AM');
  const [callFollowupReason, setCallFollowupReason] = useState('Follow-up on treatment interest');
  const [savingOutcome, setSavingOutcome] = useState(false);

  const getTomorrowDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleOpenCallOutcomeModal = () => {
    if (!callFollowupDate) {
      setCallFollowupDate(getTomorrowDateStr());
    }
    setCallOutcomeModal(true);
  };

  // Convert Modal State
  const [convertModal, setConvertModal] = useState(false);
  const [convertAction, setConvertAction] = useState('CREATE_NEW'); // 'CREATE_NEW' or 'LINK_EXISTING'
  const [existingSId, setExistingSId] = useState('');
  const [convertLoading, setConvertLoading] = useState(false);

  const fetchLeadDetails = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_BASE}/${lead_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (e) {
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeadDetails();
  }, [lead_id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && callInitiatedRef.current) {
        callInitiatedRef.current = false;
        setCallFollowupDate(getTomorrowDateStr());
        setCallOutcomeModal(true);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);


  const handleCall = () => {
    if (!data?.lead?.mobile) return;
    const clean = String(data.lead.mobile).replace(/\D/g, '');
    callInitiatedRef.current = true;
    Linking.openURL(`tel:${clean}`).catch(() => {
      callInitiatedRef.current = false;
      Alert.alert('Error', 'Unable to open phone dialer');
    });
  };

  const handleWhatsApp = () => {
    if (!data?.lead?.mobile) return;
    const clean = String(data.lead.mobile).replace(/\D/g, '');
    const phoneWithCode = clean.startsWith('91') ? clean : `91${clean}`;
    const greeting = `Hello ${data.lead.name || 'Client'}, this is regarding your enquiry at Skinssence Laser & Skincare Clinic.`;
    Linking.openURL(`whatsapp://send?phone=${phoneWithCode}&text=${encodeURIComponent(greeting)}`).catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed');
    });
  };

  const handleAddInteraction = async () => {
    if (!interactionSummary.trim() && !interactionNotes.trim()) {
      return Alert.alert('Missing Info', 'Please enter a summary or note');
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post(`${API_BASE}/${lead_id}/interactions`, {
        interaction_type: interactionType,
        summary: interactionSummary.trim() || interactionType,
        notes: interactionNotes.trim() || null
      }, { headers: { Authorization: `Bearer ${token}` } });

      setInteractionModal(false);
      setInteractionSummary('');
      setInteractionNotes('');
      fetchLeadDetails();
    } catch (e) {
      Alert.alert('Error', 'Failed to record interaction');
    }
  };

  const handleScheduleFollowup = async () => {
    if (!fDate.trim()) {
      return Alert.alert('Missing Date', 'Please enter follow-up date (YYYY-MM-DD)');
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post(`${API_BASE}/${lead_id}/followups`, {
        followup_date: fDate.trim(),
        followup_time: fTime.trim() || '11:00 AM',
        reason: fReason.trim() || 'Follow-up discussion'
      }, { headers: { Authorization: `Bearer ${token}` } });

      setFollowupModal(false);
      setFDate('');
      setFReason('');
      fetchLeadDetails();
    } catch (e) {
      Alert.alert('Error', 'Failed to schedule follow-up');
    }
  };

  const handleCompleteFollowup = async () => {
    if (!activeFollowupId) return;
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_BASE}/followups/${activeFollowupId}/complete`, {
        completion_notes: compNotes.trim() || 'Follow-up completed',
        next_followup_date: nextFDate.trim() || null,
        next_followup_time: nextFTime.trim() || null,
        next_followup_reason: nextFReason.trim() || null,
        lead_status: nextStatus || null
      }, { headers: { Authorization: `Bearer ${token}` } });

      setCompleteModal(false);
      setCompNotes('');
      setNextFDate('');
      setNextFReason('');
      fetchLeadDetails();
    } catch (e) {
      Alert.alert('Error', 'Failed to complete follow-up');
    }
  };


  const handleSelectOutcomeChip = (type) => {
    setCallOutcomeType(type);
    if (type === 'Spoke - Interested') {
      setCallOutcomeStatus('Interested');
      setNeedFollowup(true);
      if (!callFollowupDate) setCallFollowupDate(getTomorrowDateStr());
      setCallFollowupReason('Follow-up on treatment interest');
    } else if (type === 'Call Back Later') {
      setCallOutcomeStatus('Follow-up Due');
      setNeedFollowup(true);
      if (!callFollowupDate) setCallFollowupDate(getTomorrowDateStr());
      setCallFollowupReason('Client requested call back');
    } else if (type === 'Ringing / No Answer') {
      setCallOutcomeStatus('Contacted');
      setNeedFollowup(true);
      if (!callFollowupDate) setCallFollowupDate(getTomorrowDateStr());
      setCallFollowupReason('Retry calling - no answer earlier');
    } else if (type === 'Busy / Cut Call') {
      setCallOutcomeStatus('Contacted');
      setNeedFollowup(true);
      if (!callFollowupDate) setCallFollowupDate(getTomorrowDateStr());
      setCallFollowupReason('Retry calling - phone busy');
    } else if (type === 'Not Interested') {
      setCallOutcomeStatus('Cold');
      setNeedFollowup(false);
      setCallFollowupReason('');
    }
  };

  const handleSaveCallOutcome = async () => {
    setSavingOutcome(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

      // 1. Record Call Interaction
      await axios.post(`${API_BASE}/${lead_id}/interactions`, {
        interaction_type: 'Phone Call',
        summary: `Phone Call: ${callOutcomeType}`,
        notes: callOutcomeNotes.trim() || null
      }, authHeaders);

      // 2. Update Lead Status
      if (callOutcomeStatus) {
        await axios.put(`${API_BASE}/${lead_id}/status`, {
          status: callOutcomeStatus,
          reason: `Call outcome: ${callOutcomeType}`
        }, authHeaders);
      }

      // 3. Schedule Follow-up if requested
      if (needFollowup && callFollowupDate.trim()) {
        await axios.post(`${API_BASE}/${lead_id}/followups`, {
          followup_date: callFollowupDate.trim(),
          followup_time: callFollowupTime.trim() || '11:00 AM',
          reason: callFollowupReason.trim() || `Follow-up after ${callOutcomeType}`
        }, authHeaders);
      }

      setCallOutcomeModal(false);
      setCallOutcomeNotes('');
      Alert.alert('Call Recorded', 'Call outcome and details saved successfully.');
      fetchLeadDetails();
    } catch (e) {
      Alert.alert('Error', 'Failed to save call outcome');
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleConvertLead = async () => {
    setConvertLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        action: convertAction,
        existing_s_id: convertAction === 'LINK_EXISTING' ? existingSId.trim().toUpperCase() : null,
        patient_data: {
          name: data.lead.name,
          mobile: data.lead.mobile,
          city: 'Kota'
        }
      };

      const res = await axios.post(`${API_BASE}/${lead_id}/convert-to-patient`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setConvertModal(false);
      Alert.alert(
        'Success',
        res.data.message || 'Lead successfully converted to Patient',
        [{ text: 'OK', onPress: () => fetchLeadDetails() }]
      );
    } catch (e) {
      Alert.alert('Conversion Failed', e.response?.data?.error || 'Failed to convert lead');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleBookAppointment = () => {
    navigation.navigate('AppointmentCalendar', {
      lead: {
        lead_id: data.lead.lead_id,
        name: data.lead.name,
        mobile: data.lead.mobile
      }
    });
  };

  if (loading || !data) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#5C0B0B" />
        <Text style={styles.loadingText}>Loading lead profile...</Text>
      </View>
    );
  }

  const { lead, interactions, followups } = data;
  const pendingFollowup = followups.find(f => f.status === 'PENDING');

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{lead.lead_id} • {lead.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* TOP PROFILE CARD */}
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View>
              <Text style={styles.profileName}>{lead.name}</Text>
              <Text style={styles.profileMobile}>📞 {lead.mobile}</Text>
              {lead.alternate_mobile ? (
                <Text style={styles.profileSubMobile}>Alt: {lead.alternate_mobile}</Text>
              ) : null}
            </View>
            <View style={styles.badgeCol}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{lead.status}</Text>
              </View>
              <View style={[styles.tempBadge, { backgroundColor: lead.lead_temperature === 'Hot' ? '#fee2e2' : '#fef3c7' }]}>
                <Text style={[styles.tempText, { color: lead.lead_temperature === 'Hot' ? '#b91c1c' : '#b45309' }]}>
                  {lead.lead_temperature || 'Warm'}
                </Text>
              </View>
            </View>
          </View>

          {lead.converted_patient_s_id ? (
            <View style={styles.convertedAlert}>
              <Text style={styles.convertedAlertText}>
                ✓ Converted to Registered Patient: {lead.converted_patient_s_id}
              </Text>
            </View>
          ) : null}

          {/* QUICK ACTION BUTTONS */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#eff6ff' }]} onPress={handleCall}>
              <Text style={[styles.actionBtnText, { color: '#2563eb' }]}>📞 Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fef3c7' }]} onPress={handleOpenCallOutcomeModal}>
              <Text style={[styles.actionBtnText, { color: '#b45309' }]}>📋 Log Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#dcfce7' }]} onPress={handleWhatsApp}>
              <Text style={[styles.actionBtnText, { color: '#16a34a' }]}>💬 WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#ede9fe' }]} onPress={handleBookAppointment}>
              <Text style={[styles.actionBtnText, { color: '#6d28d9' }]}>🗓️ Appt</Text>
            </TouchableOpacity>
          </View>

          {!lead.converted_patient_s_id && (
            <TouchableOpacity style={styles.convertBtn} onPress={() => setConvertModal(true)}>
              <Text style={styles.convertBtnText}>👤 Convert to Patient S-Number</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ACTIVE FOLLOW-UP SECTION */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📅 Next Follow-up</Text>
            <TouchableOpacity onPress={() => setFollowupModal(true)}>
              <Text style={styles.sectionActionText}>+ Reschedule / Set</Text>
            </TouchableOpacity>
          </View>

          {pendingFollowup ? (
            <View style={styles.followupCard}>
              <Text style={styles.fDateText}>
                Due: {pendingFollowup.followup_date} at {pendingFollowup.followup_time || '11:00 AM'}
              </Text>
              <Text style={styles.fReasonText}>Reason: {pendingFollowup.reason || 'General check'}</Text>
              <Text style={styles.fStaffText}>Assigned: {pendingFollowup.assigned_staff || 'Reception'}</Text>
              
              <TouchableOpacity 
                style={styles.completeFBtn}
                onPress={() => {
                  setActiveFollowupId(pendingFollowup.id);
                  setCompleteModal(true);
                }}>
                <Text style={styles.completeFBtnText}>✓ Mark Follow-up Completed</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.noDataText}>No active follow-up scheduled.</Text>
          )}
        </View>

        {/* ENQUIRY DETAILS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Enquiry Information</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Source:</Text>
            <Text style={styles.detailVal}>{lead.source || 'Phone Call'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailKey}>Treatment Interest:</Text>
            <Text style={[styles.detailVal, { color: '#0369a1', fontWeight: 'bold' }]}>
              {lead.treatment_interest || 'General Consultation'}
            </Text>
          </View>
          {lead.skin_concern ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Skin Concern:</Text>
              <Text style={styles.detailVal}>{lead.skin_concern}</Text>
            </View>
          ) : null}
          {lead.hair_concern ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Hair Concern:</Text>
              <Text style={styles.detailVal}>{lead.hair_concern}</Text>
            </View>
          ) : null}
          {lead.preferred_visit_timing ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Preferred Timing:</Text>
              <Text style={styles.detailVal}>{lead.preferred_visit_timing}</Text>
            </View>
          ) : null}
          {lead.budget_info ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>Budget Info:</Text>
              <Text style={styles.detailVal}>{lead.budget_info}</Text>
            </View>
          ) : null}
          {lead.notes ? (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.detailKey}>Notes:</Text>
              <Text style={styles.notesBox}>{lead.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* INTERACTION HISTORY TIMELINE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🕒 Interaction History ({interactions.length})</Text>
          {interactions.map((item, idx) => (
            <View key={item.id || idx} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <View style={styles.timelineTop}>
                  <Text style={styles.timelineType}>{item.interaction_type}</Text>
                  <Text style={styles.timelineDate}>
                    {item.interaction_date ? String(item.interaction_date).split('T')[0] : ''}
                  </Text>
                </View>
                <Text style={styles.timelineSummary}>{item.summary}</Text>
                {item.notes ? <Text style={styles.timelineNotes}>{item.notes}</Text> : null}
                <Text style={styles.timelineStaff}>by {item.staff_name || 'Staff'}</Text>
              </View>
            </View>
          ))}
          {interactions.length === 0 && (
            <Text style={styles.noDataText}>No past interactions recorded.</Text>
          )}
        </View>
      </ScrollView>

      {/* MODAL 1: ADD INTERACTION */}
      <Modal visible={interactionModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>+ Record Interaction</Text>
            
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipRow}>
              {['Phone Call', 'WhatsApp', 'Follow-up', 'Walk-in', 'Note'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, interactionType === t && styles.chipSelected]}
                  onPress={() => setInteractionType(t)}>
                  <Text style={[styles.chipText, interactionType === t && styles.chipTextSelected]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Summary</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Spoke with client regarding HIFU quote"
              value={interactionSummary}
              onChangeText={setInteractionSummary}
            />

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              placeholder="Detailed notes (optional)..."
              value={interactionNotes}
              onChangeText={setInteractionNotes}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setInteractionModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleAddInteraction}>
                <Text style={styles.modalSubmitText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: SCHEDULE FOLLOW-UP */}
      <Modal visible={followupModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>📅 Schedule Follow-up</Text>

            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="YYYY-MM-DD"
              value={fDate}
              onChangeText={setFDate}
            />

            <Text style={styles.label}>Time</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="11:00 AM"
              value={fTime}
              onChangeText={setFTime}
            />

            <Text style={styles.label}>Reason / Objective</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Confirm package booking"
              value={fReason}
              onChangeText={setFReason}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setFollowupModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleScheduleFollowup}>
                <Text style={styles.modalSubmitText}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: COMPLETE FOLLOW-UP */}
      <Modal visible={completeModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>✓ Complete Follow-up</Text>

            <Text style={styles.label}>Outcome / Notes</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              placeholder="What happened during this follow-up?"
              value={compNotes}
              onChangeText={setCompNotes}
              multiline
            />

            <Text style={styles.label}>Next Follow-up Date (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="YYYY-MM-DD (Leave blank if none)"
              value={nextFDate}
              onChangeText={setNextFDate}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCompleteModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleCompleteFollowup}>
                <Text style={styles.modalSubmitText}>Complete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 4: CONVERT TO PATIENT */}
      <Modal visible={convertModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>👤 Convert Lead to Patient</Text>
            <Text style={styles.modalSubtitle}>
              Convert enquiry {lead.lead_id} into an official Skinssence patient record.
            </Text>

            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, convertAction === 'CREATE_NEW' && styles.chipSelected]}
                onPress={() => setConvertAction('CREATE_NEW')}>
                <Text style={[styles.chipText, convertAction === 'CREATE_NEW' && styles.chipTextSelected]}>
                  Create New S-Number
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, convertAction === 'LINK_EXISTING' && styles.chipSelected]}
                onPress={() => setConvertAction('LINK_EXISTING')}>
                <Text style={[styles.chipText, convertAction === 'LINK_EXISTING' && styles.chipTextSelected]}>
                  Link to Existing S-Number
                </Text>
              </TouchableOpacity>
            </View>

            {convertAction === 'LINK_EXISTING' ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.label}>Existing Patient S-Number</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. S3135"
                  autoCapitalize="characters"
                  value={existingSId}
                  onChangeText={setExistingSId}
                />
              </View>
            ) : (
              <View style={styles.convertNotice}>
                <Text style={styles.convertNoticeText}>
                  A new Patient record will be registered for {lead.name} ({lead.mobile}) with next sequential S-number. All enquiry history remains permanently linked.
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setConvertModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalSubmit, convertLoading && { opacity: 0.6 }]} 
                onPress={handleConvertLead}
                disabled={convertLoading}>
                {convertLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm Conversion</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    
      {/* MODAL 5: RECORD CALL OUTCOME */}
      <Modal visible={callOutcomeModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>📞 Record Call Outcome</Text>
              <Text style={styles.modalSubtitle}>
                Enquiry: {lead.name} • {lead.mobile}
              </Text>

              <View style={styles.recordingNoticeBox}>
                <Text style={styles.recordingNoticeText}>
                  ℹ️ Local Call Recording: If your phone auto-records calls, the audio is saved privately on your device. Skinssence records lead CRM notes and follow-ups only.
                </Text>
              </View>

              <Text style={styles.label}>Call Outcome</Text>
              <View style={styles.chipRow}>
                {[
                  'Spoke - Interested',
                  'Call Back Later',
                  'Ringing / No Answer',
                  'Busy / Cut Call',
                  'Not Interested'
                ].map(item => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.chip, callOutcomeType === item && styles.chipSelected]}
                    onPress={() => handleSelectOutcomeChip(item)}>
                    <Text style={[styles.chipText, callOutcomeType === item && styles.chipTextSelected]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Update Lead Status</Text>
              <View style={styles.chipRow}>
                {['Interested', 'Follow-up Due', 'Contacted', 'Cold'].map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.chip, callOutcomeStatus === st && styles.chipSelected]}
                    onPress={() => setCallOutcomeStatus(st)}>
                    <Text style={[styles.chipText, callOutcomeStatus === st && styles.chipTextSelected]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Conversation Notes (Optional)</Text>
              <TextInput
                style={[styles.modalInput, { height: 60 }]}
                placeholder="Key details discussed, treatment inquired about, pricing discussed..."
                value={callOutcomeNotes}
                onChangeText={setCallOutcomeNotes}
                multiline
              />

              <View style={styles.followupToggleRow}>
                <Text style={[styles.label, { marginBottom: 0 }]}>📅 Schedule Follow-up?</Text>
                <Switch
                  value={needFollowup}
                  onValueChange={setNeedFollowup}
                  trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
                  thumbColor={needFollowup ? '#2563eb' : '#f4f3f4'}
                />
              </View>

              {needFollowup && (
                <View style={styles.followupSubBox}>
                  <Text style={styles.subLabel}>Follow-up Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="YYYY-MM-DD"
                    value={callFollowupDate}
                    onChangeText={setCallFollowupDate}
                  />

                  <Text style={styles.subLabel}>Follow-up Time</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="11:00 AM"
                    value={callFollowupTime}
                    onChangeText={setCallFollowupTime}
                  />

                  <Text style={styles.subLabel}>Follow-up Objective</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g. Confirm package / follow-up call"
                    value={callFollowupReason}
                    onChangeText={setCallFollowupReason}
                  />
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => setCallOutcomeModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel / Skip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSubmit, savingOutcome && { opacity: 0.6 }]}
                  onPress={handleSaveCallOutcome}
                  disabled={savingOutcome}>
                  {savingOutcome ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalSubmitText}>Save Call Record</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({

  recordingNoticeBox: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  recordingNoticeText: {
    fontSize: 12,
    color: '#1e40af',
    lineHeight: 16,
  },
  followupToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    paddingVertical: 4,
  },
  followupSubBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },

  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: {
    backgroundColor: '#5C0B0B',
    paddingTop: 45,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  backText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  scrollContent: { padding: 16, paddingBottom: 50 },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  profileName: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  profileMobile: { fontSize: 15, color: '#475569', marginTop: 4, fontWeight: '500' },
  profileSubMobile: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  badgeCol: { alignItems: 'flex-end' },
  statusBadge: {
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  statusText: { color: '#0369a1', fontSize: 12, fontWeight: 'bold' },
  tempBadge: {
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  tempText: { fontSize: 11, fontWeight: 'bold' },
  convertedAlert: {
    backgroundColor: '#d1fae5',
    borderRadius: 8,
    padding: 8,
    marginTop: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  convertedAlertText: { color: '#065f46', fontSize: 12, fontWeight: 'bold' },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  actionBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 3,
  },
  actionBtnText: { fontSize: 12, fontWeight: 'bold' },
  convertBtn: {
    backgroundColor: '#5C0B0B',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  convertBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
  sectionActionText: { color: '#2563eb', fontSize: 12, fontWeight: '600' },
  followupCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  fDateText: { fontSize: 14, fontWeight: 'bold', color: '#92400e' },
  fReasonText: { fontSize: 12, color: '#78350f', marginTop: 4 },
  fStaffText: { fontSize: 11, color: '#a16207', marginTop: 2 },
  completeFBtn: {
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  completeFBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  noDataText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 4 },
  detailRow: { flexDirection: 'row', paddingVertical: 4 },
  detailKey: { width: 130, fontSize: 13, color: '#64748b', fontWeight: '500' },
  detailVal: { flex: 1, fontSize: 13, color: '#1e293b' },
  notesBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    color: '#334155',
    marginTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginTop: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#5C0B0B',
    marginTop: 4,
    marginRight: 10,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: '#e2e8f0',
  },
  timelineTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  timelineType: { fontSize: 12, fontWeight: 'bold', color: '#5C0B0B' },
  timelineDate: { fontSize: 11, color: '#94a3b8' },
  timelineSummary: { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  timelineNotes: { fontSize: 12, color: '#64748b', marginTop: 3 },
  timelineStaff: { fontSize: 10, color: '#94a3b8', marginTop: 4, textAlign: 'right' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#64748b' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    elevation: 5,
  },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 },
  modalSubtitle: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 4, marginTop: 8 },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1e293b',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 4 },
  chip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  chipSelected: { backgroundColor: '#5C0B0B' },
  chipText: { fontSize: 11, color: '#475569' },
  chipTextSelected: { color: '#fff', fontWeight: 'bold' },
  convertNotice: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  convertNoticeText: { fontSize: 12, color: '#1e40af' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  modalCancel: { paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 },
  modalCancelText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  modalSubmit: {
    backgroundColor: '#5C0B0B',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalSubmitText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});
