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
  Dimensions,
  Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import {
  sendBirthdayWhatsApp,
  sendFollowupWhatsApp,
  sendFeedbackRequestWhatsApp
} from '../utils/whatsappHelper';

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
  initialPatients = null,
  initialTab = 'followups',
  reportDate = null,
  onSummarySubmitted = null
}) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab || 'followups');

  // Follow-ups state
  const [followups, setFollowups] = useState(initialPatients || []);
  const [selectedPatientId, setSelectedPatientId] = useState(null);
  const [showNotRequiredForm, setShowNotRequiredForm] = useState(false);
  const [selectedReason, setSelectedReason] = useState(PRESET_REASONS[0]);
  const [customReasonNotes, setCustomReasonNotes] = useState('');
  const [submittingNotRequired, setSubmittingNotRequired] = useState(false);

  // Birthdays state
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayWishedMap, setBirthdayWishedMap] = useState({});

  // Reviews state (visiting patients)
  const [visitingPatients, setVisitingPatients] = useState([]);
  const [reviewSentMap, setReviewSentMap] = useState({});

  // Summary state
  const [callsCount, setCallsCount] = useState(0);
  const [followupWaCount, setFollowupWaCount] = useState(0);
  const [birthdayWaCount, setBirthdayWaCount] = useState(0);
  const [reviewsSentCount, setReviewsSentCount] = useState(0);
  const [totalVisited, setTotalVisited] = useState(0);
  const [summaryNotes, setSummaryNotes] = useState('');
  const [summarySubmitted, setSummarySubmitted] = useState(false);
  const [submittingSummary, setSubmittingSummary] = useState(false);
  const [lastSummaryInfo, setLastSummaryInfo] = useState(null);

  useEffect(() => {
    if (visible) {
      if (initialTab) setActiveTab(initialTab);
      loadAllDailyTasks();
    }
  }, [visible]);

  const getTodayDateStr = () => {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset).toISOString().split('T')[0];
  };

  const loadAllDailyTasks = async () => {
    setLoading(true);
    const today = reportDate || getTodayDateStr();

    // 1. Load cached activity counters for today
    try {
      const savedCalls = await AsyncStorage.getItem(`@staff_calls_${today}`);
      if (savedCalls) setCallsCount(parseInt(savedCalls, 10) || 0);

      const savedFollowupWa = await AsyncStorage.getItem(`@staff_fwa_${today}`);
      if (savedFollowupWa) setFollowupWaCount(parseInt(savedFollowupWa, 10) || 0);

      const savedBdayWa = await AsyncStorage.getItem(`@staff_bwa_${today}`);
      if (savedBdayWa) setBirthdayWaCount(parseInt(savedBdayWa, 10) || 0);

      const savedReviews = await AsyncStorage.getItem(`@staff_rev_${today}`);
      if (savedReviews) setReviewsSentCount(parseInt(savedReviews, 10) || 0);

      const bdaySent = await AsyncStorage.getItem(`@staff_bday_wished_${today}`);
      if (bdaySent) setBirthdayWishedMap(JSON.parse(bdaySent));
    } catch (e) {}

    // 2. Fetch from backend API
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`https://skinssence-api-1.onrender.com/api/staff/daily-tasks?date=${today}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });

      const data = res.data || {};
      const fList = data.followups || [];
      setFollowups(fList);
      if (fList.length > 0) setSelectedPatientId(fList[0].patient_id);

      setBirthdays(data.birthdays || []);
      const vList = data.visitingPatients || [];
      setVisitingPatients(vList);
      setTotalVisited(data.totalVisited || vList.length);

      // Build review sent map
      const revMap = {};
      vList.forEach(vp => {
        if (vp.review_sent) revMap[vp.patient_id] = true;
      });
      setReviewSentMap(revMap);

      setSummarySubmitted(!!data.dailySummarySubmitted);
      setLastSummaryInfo(data.lastSummary || null);
      if (data.lastSummary) {
        setCallsCount(data.lastSummary.followup_calls_count || 0);
        setFollowupWaCount(data.lastSummary.followup_whatsapp_count || 0);
        setBirthdayWaCount(data.lastSummary.birthday_messages_count || 0);
        setReviewsSentCount(data.lastSummary.reviews_collected_count || 0);
        if (data.lastSummary.summary_notes) setSummaryNotes(data.lastSummary.summary_notes);
      }
    } catch (err) {
      console.log('Error fetching staff daily tasks from skinssence-api-1:', err.message);
      // Fallback to legacy pending-followups if endpoint is still building
      try {
        const token = await AsyncStorage.getItem('userToken');
        const fallbackRes = await axios.get('https://skinssence-api-1.onrender.com/api/appointments/pending-followups', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const list = fallbackRes.data?.pendingPatients || [];
        setFollowups(list);
        if (list.length > 0) setSelectedPatientId(list[0].patient_id);
      } catch (fErr) {}
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

  // Follow-up Actions
  const handleCallPatient = (mobile, patientName) => {
    if (!mobile) {
      Alert.alert('No Number', 'Mobile number not available for this patient.');
      return;
    }
    const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
    Linking.openURL(`tel:${cleanMobile}`);

    // Increment and persist call counter
    const today = getTodayDateStr();
    const nextCalls = callsCount + 1;
    setCallsCount(nextCalls);
    AsyncStorage.setItem(`@staff_calls_${today}`, String(nextCalls)).catch(() => {});
  };

  const handleFollowupWhatsApp = (item) => {
    sendFollowupWhatsApp(item.mobile, `${item.first_name} ${item.last_name || ''}`, item.planned_procedures || '', Linking, Alert);

    // Increment and persist WhatsApp counter
    const today = getTodayDateStr();
    const nextWa = followupWaCount + 1;
    setFollowupWaCount(nextWa);
    AsyncStorage.setItem(`@staff_fwa_${today}`, String(nextWa)).catch(() => {});
  };

  const handleBookAppointment = (item) => {
    const pat = item || followups.find(p => p.patient_id === selectedPatientId);
    if (!pat) {
      Alert.alert('Select Patient', 'Please select a patient to book follow-up.');
      return;
    }
    AsyncStorage.setItem('@last_followup_reminder_time', Date.now().toString()).catch(() => {});
    onClose();
    navigation.navigate('AppointmentCalendar', {
      patient: {
        first_name: pat.first_name,
        last_name: pat.last_name || '',
        mobile: pat.mobile || '',
        skinssence_id: pat.skinssence_id || '',
        id: pat.patient_id
      }
    });
  };

  const handleMarkNotRequired = async () => {
    const selectedPatient = followups.find(p => p.patient_id === selectedPatientId);
    if (!selectedPatient) {
      Alert.alert('Select Patient', 'Please select a patient.');
      return;
    }
    if (selectedReason === 'Other' && !customReasonNotes.trim()) {
      Alert.alert('Reason Required', 'Please enter a note for why follow-up is not required.');
      return;
    }

    setSubmittingNotRequired(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        patient_id: selectedPatient.patient_id,
        visit_id: selectedPatient.latest_visit_id,
        reason: selectedReason,
        notes: customReasonNotes.trim()
      };

      await axios.post('https://skinssence-api-1.onrender.com/api/appointments/followup-not-required', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const updated = followups.filter(p => p.patient_id !== selectedPatient.patient_id);
      setFollowups(updated);
      setShowNotRequiredForm(false);
      setCustomReasonNotes('');

      if (updated.length > 0) {
        setSelectedPatientId(updated[0].patient_id);
      } else {
        setSelectedPatientId(null);
      }
      if (onUpdated) onUpdated();
    } catch (e) {
      Alert.alert('Error', 'Failed to update follow-up status.');
    } finally {
      setSubmittingNotRequired(false);
    }
  };

  // Birthday Actions
  const handleSendBirthday = (item) => {
    sendBirthdayWhatsApp(item.mobile, item.name, Linking, Alert);

    const today = getTodayDateStr();
    const updatedMap = { ...birthdayWishedMap, [item.id]: true };
    setBirthdayWishedMap(updatedMap);
    AsyncStorage.setItem(`@staff_bday_wished_${today}`, JSON.stringify(updatedMap)).catch(() => {});

    const nextCount = birthdayWaCount + 1;
    setBirthdayWaCount(nextCount);
    AsyncStorage.setItem(`@staff_bwa_${today}`, String(nextCount)).catch(() => {});
  };

  // Google Review Actions
  const handleSendReview = async (item) => {
    sendFeedbackRequestWhatsApp(item.mobile, `${item.first_name} ${item.last_name || ''}`, Linking, Alert);

    // Update UI sent map immediately
    const updatedMap = { ...reviewSentMap, [item.patient_id]: true };
    setReviewSentMap(updatedMap);

    const today = getTodayDateStr();
    const nextCount = reviewsSentCount + 1;
    setReviewsSentCount(nextCount);
    AsyncStorage.setItem(`@staff_rev_${today}`, String(nextCount)).catch(() => {});

    // Track on backend
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post('https://skinssence-api-1.onrender.com/api/staff/review-requested', {
        patient_id: item.patient_id,
        visit_id: item.visit_id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e) {
      console.log('Error recording review request on backend:', e);
    }
  };

  // Submit Day-End Summary
  const handleSubmitSummary = async () => {
    setSubmittingSummary(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const today = reportDate || getTodayDateStr();

      const payload = {
        report_date: today,
        followup_calls_count: callsCount,
        followup_whatsapp_count: followupWaCount,
        birthday_messages_count: birthdayWaCount,
        reviews_collected_count: reviewsSentCount,
        total_visiting_patients: totalVisited || visitingPatients.length,
        summary_notes: summaryNotes.trim()
      };

      const res = await axios.post('https://skinssence-api-1.onrender.com/api/staff/daily-summary', payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data?.success) {
        setSummarySubmitted(true);
        setLastSummaryInfo(res.data?.summary || payload);
        Alert.alert(
          'Daily Summary Submitted! ✅',
          `Thank you for concluding today's tasks!\n\n• Follow-up Calls: ${callsCount}\n• Follow-up WhatsApp: ${followupWaCount}\n• Birthday Wishes: ${birthdayWaCount}\n• Review Requests Sent: ${reviewsSentCount}\n• Total Visiting Patients: ${totalVisited || visitingPatients.length}`
        );
        if (onSummarySubmitted) onSummarySubmitted(res.data?.summary || payload);
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      console.error('Error submitting summary:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to submit daily summary. Please try again.');
    } finally {
      setSubmittingSummary(false);
    }
  };

  const todayBirthdays = birthdays.filter(b => b.is_today);
  const upcomingBirthdays = birthdays.filter(b => !b.is_today);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismissHourly}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>

          {/* TOP HEADER */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={styles.iconCircle}>
                <Ionicons name="clipboard-outline" size={20} color="#5C0B0B" />
              </View>
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.headerTitle}>Staff Daily Tasks & Reminders</Text>
                <Text style={styles.headerSub}>Follow-ups • Birthdays • Reviews • Day End</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleDismissHourly} style={styles.closeIconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* SEGMENTED TAB BAR */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'followups' && styles.activeTabItem]}
              onPress={() => setActiveTab('followups')}>
              <Text style={[styles.tabText, activeTab === 'followups' && styles.activeTabText]}>
                📞 Follow-ups ({followups.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'birthdays' && styles.activeTabItem]}
              onPress={() => setActiveTab('birthdays')}>
              <Text style={[styles.tabText, activeTab === 'birthdays' && styles.activeTabText]}>
                🎂 Birthdays ({birthdays.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'reviews' && styles.activeTabItem]}
              onPress={() => setActiveTab('reviews')}>
              <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>
                ⭐ Reviews ({visitingPatients.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'summary' && styles.activeTabItem]}
              onPress={() => setActiveTab('summary')}>
              <Text style={[styles.tabText, activeTab === 'summary' && styles.activeTabText]}>
                📝 Day End {summarySubmitted ? '✅' : '⚠️'}
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#5C0B0B" />
              <Text style={styles.loadingText}>Loading daily clinic tasks...</Text>
            </View>
          ) : (
            <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>

              {/* TAB 1: FOLLOW-UPS */}
              {activeTab === 'followups' && (
                <View style={{ paddingBottom: 15 }}>
                  <View style={styles.tabNoticeCard}>
                    <Ionicons name="information-circle-outline" size={18} color="#0369a1" />
                    <Text style={styles.tabNoticeText}>
                      Remind patients due for follow-ups via direct Call, WhatsApp, or schedule next appointment.
                    </Text>
                  </View>

                  {followups.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="checkmark-circle-outline" size={48} color="#10b981" />
                      <Text style={styles.emptyTitle}>All Follow-ups Complete</Text>
                      <Text style={styles.emptySub}>No pending follow-ups for today's visited patients.</Text>
                    </View>
                  ) : (
                    followups.map(item => {
                      const isSelected = item.patient_id === selectedPatientId;
                      return (
                        <View key={item.patient_id} style={[styles.cardContainer, isSelected && styles.selectedCard]}>
                          <TouchableOpacity
                            style={styles.cardHeaderRow}
                            onPress={() => {
                              setSelectedPatientId(item.patient_id);
                              setShowNotRequiredForm(false);
                            }}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.patientName}>{item.first_name} {item.last_name || ''}</Text>
                                {item.skinssence_id && (
                                  <View style={styles.sNumBadge}>
                                    <Text style={styles.sNumText}>{item.skinssence_id}</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.cardSubText}>
                                Visited: {item.visit_date ? item.visit_date.slice(0, 10) : 'Today'}
                                {item.planned_procedures ? ` • ${item.planned_procedures}` : ''}
                              </Text>
                              {item.mobile && (
                                <Text style={styles.mobileText}>📱 +91 {item.mobile}</Text>
                              )}
                            </View>
                          </TouchableOpacity>

                          {/* ACTION BUTTONS ROW */}
                          <View style={styles.actionButtonsRow}>
                            <TouchableOpacity
                              style={[styles.quickActionBtn, { backgroundColor: '#10b981' }]}
                              onPress={() => handleCallPatient(item.mobile, item.first_name)}>
                              <Ionicons name="call" size={14} color="#fff" />
                              <Text style={styles.quickActionBtnText}>Call</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.quickActionBtn, { backgroundColor: '#25D366' }]}
                              onPress={() => handleFollowupWhatsApp(item)}>
                              <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                              <Text style={styles.quickActionBtnText}>WhatsApp</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.quickActionBtn, { backgroundColor: '#0284c7' }]}
                              onPress={() => handleBookAppointment(item)}>
                              <Ionicons name="calendar" size={14} color="#fff" />
                              <Text style={styles.quickActionBtnText}>Book</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.quickActionBtn, { backgroundColor: '#64748b' }]}
                              onPress={() => {
                                setSelectedPatientId(item.patient_id);
                                setShowNotRequiredForm(true);
                              }}>
                              <Ionicons name="close-circle-outline" size={14} color="#fff" />
                              <Text style={styles.quickActionBtnText}>Not Needed</Text>
                            </TouchableOpacity>
                          </View>

                          {/* NOT REQUIRED SUB-FORM */}
                          {isSelected && showNotRequiredForm && (
                            <View style={styles.notRequiredCard}>
                              <Text style={styles.notRequiredHeader}>Select Reason for Not Requiring Follow-up:</Text>
                              <View style={styles.reasonsList}>
                                {PRESET_REASONS.map(r => (
                                  <TouchableOpacity
                                    key={r}
                                    style={[styles.reasonOption, selectedReason === r && styles.selectedReasonOption]}
                                    onPress={() => setSelectedReason(r)}>
                                    <Text style={[styles.reasonOptionText, selectedReason === r && styles.selectedReasonOptionText]}>
                                      {r}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                              {selectedReason === 'Other' && (
                                <TextInput
                                  style={styles.reasonNotesInput}
                                  placeholder="Enter specific note / reason..."
                                  value={customReasonNotes}
                                  onChangeText={setCustomReasonNotes}
                                />
                              )}
                              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                                <TouchableOpacity
                                  style={[styles.cancelBtn, { marginRight: 8 }]}
                                  onPress={() => setShowNotRequiredForm(false)}>
                                  <Text style={styles.cancelBtnText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.confirmBtn}
                                  onPress={handleMarkNotRequired}
                                  disabled={submittingNotRequired}>
                                  {submittingNotRequired ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                  ) : (
                                    <Text style={styles.confirmBtnText}>Save Status</Text>
                                  )}
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {/* TAB 2: BIRTHDAYS */}
              {activeTab === 'birthdays' && (
                <View style={{ paddingBottom: 15 }}>
                  <View style={[styles.tabNoticeCard, { backgroundColor: '#fef3c7', borderColor: '#fde68a' }]}>
                    <Ionicons name="gift-outline" size={18} color="#b45309" />
                    <Text style={[styles.tabNoticeText, { color: '#92400e' }]}>
                      Send personalized birthday blessings from Dr. Ashima & Team Skinssence with 1 tap.
                    </Text>
                  </View>

                  {/* TODAY'S BIRTHDAYS */}
                  <View style={styles.birthdaySectionHeader}>
                    <Text style={styles.birthdaySectionTitle}>🎉 Today's Birthdays ({todayBirthdays.length})</Text>
                  </View>

                  {todayBirthdays.length === 0 ? (
                    <Text style={styles.noItemNote}>No patient birthdays today.</Text>
                  ) : (
                    todayBirthdays.map(b => {
                      const wished = !!birthdayWishedMap[b.id];
                      return (
                        <View key={b.id} style={[styles.birthdayCard, { borderColor: '#f59e0b', backgroundColor: '#fffbeb' }]}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={styles.patientName}>{b.name}</Text>
                              {b.skinssence_id && (
                                <View style={[styles.sNumBadge, { backgroundColor: '#fef3c7' }]}>
                                  <Text style={[styles.sNumText, { color: '#b45309' }]}>{b.skinssence_id}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.birthdaySubText}>
                              🎂 Turning {b.turning_age ? `${b.turning_age} years old` : 'a year older'} Today!
                            </Text>
                            {b.mobile && <Text style={styles.mobileText}>📱 +91 {b.mobile}</Text>}
                          </View>

                          <TouchableOpacity
                            style={[styles.wishButton, wished && styles.wishedButton]}
                            onPress={() => handleSendBirthday(b)}>
                            <Ionicons name={wished ? "checkmark-circle" : "logo-whatsapp"} size={16} color="#fff" />
                            <Text style={styles.wishButtonText}>{wished ? 'Sent ✅' : 'Send Wish'}</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}

                  {/* UPCOMING BIRTHDAYS */}
                  <View style={[styles.birthdaySectionHeader, { marginTop: 16 }]}>
                    <Text style={styles.birthdaySectionTitle}>🎈 Upcoming in Next 3 Days ({upcomingBirthdays.length})</Text>
                  </View>

                  {upcomingBirthdays.length === 0 ? (
                    <Text style={styles.noItemNote}>No upcoming birthdays in next 3 days.</Text>
                  ) : (
                    upcomingBirthdays.map(b => {
                      const wished = !!birthdayWishedMap[b.id];
                      return (
                        <View key={b.id} style={styles.birthdayCard}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={styles.patientName}>{b.name}</Text>
                              {b.skinssence_id && (
                                <View style={styles.sNumBadge}>
                                  <Text style={styles.sNumText}>{b.skinssence_id}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.birthdaySubText}>
                              Birthday in {b.days_until} day{b.days_until > 1 ? 's' : ''} ({b.dob}) {b.turning_age ? `• Turning ${b.turning_age}` : ''}
                            </Text>
                            {b.mobile && <Text style={styles.mobileText}>📱 +91 {b.mobile}</Text>}
                          </View>

                          <TouchableOpacity
                            style={[styles.wishButton, { backgroundColor: '#25D366' }, wished && styles.wishedButton]}
                            onPress={() => handleSendBirthday(b)}>
                            <Ionicons name={wished ? "checkmark-circle" : "logo-whatsapp"} size={16} color="#fff" />
                            <Text style={styles.wishButtonText}>{wished ? 'Sent ✅' : 'Send Wish'}</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {/* TAB 3: GOOGLE REVIEWS */}
              {activeTab === 'reviews' && (
                <View style={{ paddingBottom: 15 }}>
                  <View style={[styles.tabNoticeCard, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                    <Ionicons name="star" size={18} color="#15803d" />
                    <Text style={[styles.tabNoticeText, { color: '#166534' }]}>
                      Request Google reviews from today's visiting patients. Review link is ready with pre-prepared text!
                    </Text>
                  </View>

                  {visitingPatients.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <Ionicons name="people-outline" size={48} color="#94a3b8" />
                      <Text style={styles.emptyTitle}>No Visited Patients Today</Text>
                      <Text style={styles.emptySub}>Visiting patients will automatically appear here to request reviews.</Text>
                    </View>
                  ) : (
                    visitingPatients.map(item => {
                      const isSent = !!reviewSentMap[item.patient_id];
                      return (
                        <View key={item.visit_id || item.patient_id} style={styles.reviewCard}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={styles.patientName}>{item.first_name} {item.last_name || ''}</Text>
                              {item.skinssence_id && (
                                <View style={styles.sNumBadge}>
                                  <Text style={styles.sNumText}>{item.skinssence_id}</Text>
                                </View>
                              )}
                              <View style={[styles.statusPill, isSent ? styles.statusPillSent : styles.statusPillPending]}>
                                <Text style={[styles.statusPillText, isSent ? { color: '#15803d' } : { color: '#b45309' }]}>
                                  {isSent ? 'Sent ✅' : 'Pending ⭐'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.cardSubText}>
                              {item.planned_procedures ? `Procedure: ${item.planned_procedures}` : 'Consultation'}
                              {item.net_payable ? ` • ₹${item.net_payable}` : ''}
                            </Text>
                            {item.mobile && <Text style={styles.mobileText}>📱 +91 {item.mobile}</Text>}
                          </View>

                          <TouchableOpacity
                            style={[styles.reviewButton, isSent && styles.reviewButtonSent]}
                            onPress={() => handleSendReview(item)}>
                            <Ionicons name={isSent ? "checkmark-done" : "star"} size={15} color="#fff" />
                            <Text style={styles.reviewButtonText}>
                              {isSent ? 'Resend' : 'Request Review'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </View>
              )}

              {/* TAB 4: DAY-END SUMMARY */}
              {activeTab === 'summary' && (
                <View style={{ paddingBottom: 25 }}>
                  {summarySubmitted && (
                    <View style={styles.submittedBanner}>
                      <Ionicons name="checkmark-circle" size={22} color="#15803d" />
                      <View style={{ marginLeft: 8, flex: 1 }}>
                        <Text style={styles.submittedBannerTitle}>Today's Summary Submitted! ✅</Text>
                        <Text style={styles.submittedBannerSub}>
                          Report recorded for {getTodayDateStr()}. You can update numbers or remarks below and resubmit anytime.
                        </Text>
                      </View>
                    </View>
                  )}

                  <Text style={styles.summarySectionTitle}>Daily Activity Counters</Text>
                  <Text style={styles.summarySectionSub}>
                    Counters update automatically as you call or message patients, or adjust manually below:
                  </Text>

                  {/* COUNTERS GRID */}
                  <View style={styles.counterRow}>
                    <View style={styles.counterCard}>
                      <Text style={styles.counterLabel}>📞 Follow-up Calls</Text>
                      <View style={styles.counterControls}>
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setCallsCount(Math.max(0, callsCount - 1))}>
                          <Text style={styles.counterBtnText}>-</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.counterInput}
                          keyboardType="numeric"
                          value={String(callsCount)}
                          onChangeText={t => setCallsCount(parseInt(t, 10) || 0)}
                        />
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setCallsCount(callsCount + 1)}>
                          <Text style={styles.counterBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.counterCard}>
                      <Text style={styles.counterLabel}>💬 Follow-up WA</Text>
                      <View style={styles.counterControls}>
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setFollowupWaCount(Math.max(0, followupWaCount - 1))}>
                          <Text style={styles.counterBtnText}>-</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.counterInput}
                          keyboardType="numeric"
                          value={String(followupWaCount)}
                          onChangeText={t => setFollowupWaCount(parseInt(t, 10) || 0)}
                        />
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setFollowupWaCount(followupWaCount + 1)}>
                          <Text style={styles.counterBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.counterRow}>
                    <View style={styles.counterCard}>
                      <Text style={styles.counterLabel}>🎂 Birthday Wishes</Text>
                      <View style={styles.counterControls}>
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setBirthdayWaCount(Math.max(0, birthdayWaCount - 1))}>
                          <Text style={styles.counterBtnText}>-</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.counterInput}
                          keyboardType="numeric"
                          value={String(birthdayWaCount)}
                          onChangeText={t => setBirthdayWaCount(parseInt(t, 10) || 0)}
                        />
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setBirthdayWaCount(birthdayWaCount + 1)}>
                          <Text style={styles.counterBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.counterCard}>
                      <Text style={styles.counterLabel}>⭐ Reviews Sent</Text>
                      <View style={styles.counterControls}>
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setReviewsSentCount(Math.max(0, reviewsSentCount - 1))}>
                          <Text style={styles.counterBtnText}>-</Text>
                        </TouchableOpacity>
                        <TextInput
                          style={styles.counterInput}
                          keyboardType="numeric"
                          value={String(reviewsSentCount)}
                          onChangeText={t => setReviewsSentCount(parseInt(t, 10) || 0)}
                        />
                        <TouchableOpacity
                          style={styles.counterBtn}
                          onPress={() => setReviewsSentCount(reviewsSentCount + 1)}>
                          <Text style={styles.counterBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* TOTAL PATIENTS VISITED */}
                  <View style={styles.totalPatientsBanner}>
                    <Text style={styles.totalPatientsLabel}>👥 Total Patients Visited Today:</Text>
                    <Text style={styles.totalPatientsVal}>{totalVisited || visitingPatients.length}</Text>
                  </View>

                  {/* SUMMARY NOTES */}
                  <Text style={[styles.summarySectionTitle, { marginTop: 15 }]}>
                    Staff Closing Remarks & Handover Notes
                  </Text>
                  <TextInput
                    style={styles.notesTextArea}
                    multiline
                    numberOfLines={4}
                    placeholder="Enter any clinic notes, patient feedback, inventory requirements, or reminders for tomorrow..."
                    value={summaryNotes}
                    onChangeText={setSummaryNotes}
                  />

                  {/* SUBMIT BUTTON */}
                  <TouchableOpacity
                    style={styles.submitSummaryBtn}
                    onPress={handleSubmitSummary}
                    disabled={submittingSummary}>
                    {submittingSummary ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="checkmark-done-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.submitSummaryBtnText}>
                          {summarySubmitted ? 'Update Daily Summary' : 'Submit Day-End Summary Report'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}

            </ScrollView>
          )}

          {/* BOTTOM DISMISS */}
          <View style={styles.footerBar}>
            <TouchableOpacity style={styles.snoozeBtn} onPress={handleDismissHourly}>
              <Text style={styles.snoozeBtnText}>⏰ Remind Me in 1 Hour</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14
  },
  modalContainer: {
    width: Math.min(width - 20, 520),
    maxHeight: '92%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  headerSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1
  },
  closeIconBtn: {
    padding: 4
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingTop: 6
  },
  tabItem: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  activeTabItem: {
    borderBottomColor: '#5C0B0B'
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b'
  },
  activeTabText: {
    color: '#5C0B0B',
    fontWeight: '700'
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b'
  },
  bodyScroll: {
    padding: 14,
    maxHeight: 460
  },
  tabNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  tabNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#0369a1',
    marginLeft: 8,
    lineHeight: 16
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center'
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 10
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4
  },
  cardContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10
  },
  selectedCard: {
    borderColor: '#5C0B0B',
    backgroundColor: '#fffdfd'
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  patientName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a'
  },
  sNumBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6
  },
  sNumText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569'
  },
  cardSubText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3
  },
  mobileText: {
    fontSize: 12,
    color: '#0284c7',
    fontWeight: '500',
    marginTop: 2
  },
  actionButtonsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 6
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 6,
    gap: 4
  },
  quickActionBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600'
  },
  notRequiredCard: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  notRequiredHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6
  },
  reasonsList: {
    gap: 4,
    marginBottom: 8
  },
  reasonOption: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  selectedReasonOption: {
    borderColor: '#5C0B0B',
    backgroundColor: '#fef2f2'
  },
  reasonOptionText: {
    fontSize: 11,
    color: '#475569'
  },
  selectedReasonOptionText: {
    color: '#5C0B0B',
    fontWeight: '600'
  },
  reasonNotesInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    padding: 8,
    fontSize: 12,
    marginBottom: 6
  },
  cancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  cancelBtnText: {
    fontSize: 12,
    color: '#64748b'
  },
  confirmBtn: {
    backgroundColor: '#5C0B0B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6
  },
  confirmBtnText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600'
  },
  birthdaySectionHeader: {
    marginBottom: 6
  },
  birthdaySectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  birthdayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  birthdaySubText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    fontWeight: '500'
  },
  noItemNote: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginBottom: 10
  },
  wishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#b45309',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4
  },
  wishedButton: {
    backgroundColor: '#10b981'
  },
  wishButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  reviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6
  },
  statusPillSent: {
    backgroundColor: '#dcfce7'
  },
  statusPillPending: {
    backgroundColor: '#fef3c7'
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '600'
  },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eab308',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 4
  },
  reviewButtonSent: {
    backgroundColor: '#10b981'
  },
  reviewButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14
  },
  submittedBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803d'
  },
  submittedBannerSub: {
    fontSize: 11,
    color: '#166534',
    marginTop: 2
  },
  summarySectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2
  },
  summarySectionSub: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 10
  },
  counterRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10
  },
  counterCard: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10
  },
  counterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6
  },
  counterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  counterBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  counterBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155'
  },
  counterInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    paddingVertical: 2
  },
  totalPatientsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 10,
    marginTop: 4
  },
  totalPatientsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155'
  },
  totalPatientsVal: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  notesTextArea: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    backgroundColor: '#ffffff',
    marginTop: 6,
    minHeight: 80,
    textAlignVertical: 'top'
  },
  submitSummaryBtn: {
    backgroundColor: '#5C0B0B',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14
  },
  submitSummaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  snoozeBtn: {
    paddingVertical: 6
  },
  snoozeBtnText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600'
  },
  closeBtn: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6
  },
  closeBtnText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600'
  }
});
