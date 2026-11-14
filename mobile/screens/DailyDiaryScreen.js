import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  ScrollView,
  Modal,
  Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import PharmacyCorrectionModal from '../components/PharmacyCorrectionModal';
import EditBillModal from '../components/EditBillModal';
import PendingFollowupReminderModal from '../components/PendingFollowupReminderModal';

const API_BASE_URL = 'https://skinssence-api-1.onrender.com';

function DailyDiaryScreenContent({ navigation, route }) {
  // Safe currency / number formatter
  const formatCurrency = (val) => {
    if (val === null || val === undefined) return '0';
    const num = parseFloat(val);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  // Helper to format Date to YYYY-MM-DD
  const formatDateToYMD = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Helper for human-readable display date
  const formatDisplayDate = (ymdStr) => {
    if (!ymdStr) return '';
    const parts = ymdStr.split('-');
    if (parts.length !== 3) return ymdStr;
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return dt.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTimeOnly = (isoStr) => {
    if (!isoStr) return '';
    try {
      const dt = new Date(isoStr);
      return dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return '';
    }
  };

  // Initial date from route params or today
  const initialDate = route?.params?.date || formatDateToYMD(new Date());
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [diaryData, setDiaryData] = useState(null);
  const [selectedFilter, setSelectedFilter] = useState('ALL'); // ALL, VISITS, PROCEDURES, MEDICINES, PACKAGES, PAYMENTS, EXPENSES, APPOINTMENTS
  const [searchQuery, setSearchQuery] = useState('');
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [customDateInput, setCustomDateInput] = useState(initialDate);
  const [userRole, setUserRole] = useState('');
  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);
  const [correctingVisitId, setCorrectingVisitId] = useState(null);
  const [editBillModalVisible, setEditBillModalVisible] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState(null);

  // --- SESSION CONTROLS & 2-CATEGORY REPORT VIEWS ---
  // Views: 'SESSION_1' | 'SESSION_2' | 'FULL_DAY'
  const [selectedSessionView, setSelectedSessionView] = useState('FULL_DAY');
  const [confirmEndModal, setConfirmEndModal] = useState({ visible: false, sessionNum: 1 });
  const [reopenModal, setReopenModal] = useState({ visible: false, sessionNum: 1, reason: '' });
  const [actionLoading, setActionLoading] = useState(false);

  // Existing Staff Submission Report Form Modal
  const [staffReportModalVisible, setStaffReportModalVisible] = useState(false);

  const fetchDiary = async (dateToFetch) => {
    const target = dateToFetch || selectedDate;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_BASE_URL}/api/admin/diary?date=${target}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDiaryData(res.data);
    } catch (e) {
      console.log('Error fetching diary data from cloud:', e?.response?.data || e.message);
      if (e?.response && e.response.status === 403) {
        Alert.alert(
          'Access Restricted',
          e.response.data?.error || 'Daily Diary viewing is disabled for your staff account. Please ask Doctor / Admin to enable it in Manage Staff Accounts.',
          [{ text: 'Go Back', onPress: () => navigation.goBack() }]
        );
        return;
      }
      // Fallback local API if testing locally
      try {
        const token = await AsyncStorage.getItem('userToken');
        const fallbackRes = await axios.get(`http://localhost:3000/api/admin/diary?date=${target}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDiaryData(fallbackRes.data);
      } catch (err2) {
        if (err2?.response && err2.response.status === 403) {
          Alert.alert(
            'Access Restricted',
            err2.response.data?.error || 'Daily Diary viewing is disabled for your staff account. Please ask Doctor / Admin to enable it in Manage Staff Accounts.',
            [{ text: 'Go Back', onPress: () => navigation.goBack() }]
          );
          return;
        }
        Alert.alert('Error', 'Unable to fetch Daily Diary data. Please check your network connection.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem('userRole').then(r => setUserRole(r ? r.toUpperCase() : ''));
      fetchDiary(selectedDate);
    }, [selectedDate])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDiary(selectedDate);
  };

  // Date Shift Helpers
  const shiftDate = (days) => {
    const parts = selectedDate.split('-');
    const current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    current.setDate(current.getDate() + days);
    const newYmd = formatDateToYMD(current);
    setSelectedDate(newYmd);
    setCustomDateInput(newYmd);
  };

  const goToToday = () => {
    const todayYmd = formatDateToYMD(new Date());
    setSelectedDate(todayYmd);
    setCustomDateInput(todayYmd);
  };

  const applyCustomDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDateInput.trim())) {
      Alert.alert('Invalid Format', 'Please enter date in YYYY-MM-DD format (e.g. 2026-08-05)');
      return;
    }
    setSelectedDate(customDateInput.trim());
    setShowDatePickerModal(false);
  };

  // --- SESSION ACTION HANDLERS ---
  const executeEndSession = async (sessionNum) => {
    setActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const url = `${API_BASE_URL}/api/sessions/end`;
      const res = await axios.post(
        url,
        { date: selectedDate, session_number: sessionNum },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setConfirmEndModal({ visible: false, sessionNum: 1 });

      if (sessionNum === 1) {
        Alert.alert(
          'Session 1 Closed',
          'Session 1 (Morning) has ended successfully! Its financial reports are now locked. Session 2 (Evening) is now active.',
          [{ text: 'OK' }]
        );
        fetchDiary(selectedDate);
      } else {
        // Step 2 complete: Session 2 financial totals locked!
        // Step 3 triggered automatically: Open the existing Staff Submission Report form
        await fetchDiary(selectedDate);
        setStaffReportModalVisible(true);
      }
    } catch (err) {
      console.error('Error ending session:', err?.response?.data || err.message);
      Alert.alert('Error', err?.response?.data?.error || `Failed to end Session ${sessionNum}. Please try again.`);
    } finally {
      setActionLoading(false);
    }
  };

  const executeReopenSession = async () => {
    const reason = (reopenModal.reason || '').trim();
    if (!reason) {
      Alert.alert('Reason Required', 'Please enter a clear mandatory reason for reopening this closed session.');
      return;
    }

    setActionLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const url = `${API_BASE_URL}/api/sessions/reopen`;
      const res = await axios.post(
        url,
        {
          date: selectedDate,
          session_number: reopenModal.sessionNum,
          reason: reason
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReopenModal({ visible: false, sessionNum: 1, reason: '' });
      Alert.alert(
        'Session Reopened',
        `Session ${reopenModal.sessionNum} has been reopened by Administrator. Audit record saved.`,
        [{ text: 'OK' }]
      );
      fetchDiary(selectedDate);
    } catch (err) {
      console.error('Error reopening session:', err?.response?.data || err.message);
      Alert.alert('Error', err?.response?.data?.error || 'Failed to reopen session. Only Admin can reopen.');
    } finally {
      setActionLoading(false);
    }
  };

  // Financial Reports data
  const finReports = diaryData?.financial_reports || {
    session_1: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 },
    session_2: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 },
    full_day: { procedure_collection: 0, medicine_collection: 0, grand_total: 0, count: 0 }
  };

  const s1Status = diaryData?.session_1 || { status: 'OPEN' };
  const s2Status = diaryData?.session_2 || { status: 'NOT_STARTED' };
  const isAdminOrDoc = userRole === 'ADMIN' || userRole === 'DOCTOR';
  const staffSubmission = diaryData?.staff_submission || { submitted: false, report: null };
  const isSession2Closed = s2Status.status === 'CLOSED';
  const isStaffReportSubmitted = !!staffSubmission.submitted;

  // Current active report view data
  const activeReport = selectedSessionView === 'SESSION_1'
    ? finReports.session_1
    : (selectedSessionView === 'SESSION_2' ? finReports.session_2 : finReports.full_day);

  // Filtering Timeline items: ALL shows only money/medicine transactions & complimentary consultations
  const isApptFilter = selectedFilter === 'APPOINTMENTS';
  const timelineItems = isApptFilter
    ? (diaryData?.appointments || []).map(a => {
        const pId = a.skinssence_id || a.patient_id || '';
        const status = (a.status || 'SCHEDULED').toUpperCase();
        return {
          id: `appt-${a.id}`,
          category: 'APPOINTMENTS',
          category_label: 'Appointment Booking',
          title: `${a.patient_name || 'Patient'} (${pId || 'Appt #' + a.id})`,
          subtitle: `Time: ${a.appointment_time || 'Not Set'} • Mobile: ${a.mobile || 'N/A'} ${a.notes ? '• Notes: ' + a.notes : ''}`,
          amount: null,
          is_debit: false,
          badge: status,
          badge_color: status === 'COMPLETED' ? '#16a34a' : (status === 'CANCELLED' || status === 'NO-SHOW' ? '#dc2626' : '#f59e0b'),
          time: a.appointment_time || '',
          patient_id: a.patient_id,
          appointment_id: a.id
        };
      })
    : (diaryData?.timeline || []);

  const filteredTimeline = timelineItems.filter(item => {
    // 0. Session Filter (Session 1 vs Session 2 vs Full Day)
    if (selectedSessionView === 'SESSION_1' && item.session_num && item.session_num !== 1) return false;
    if (selectedSessionView === 'SESSION_2' && item.session_num && item.session_num !== 2) return false;

    // 1. Category Filter
    if (selectedFilter !== 'ALL' && selectedFilter !== 'APPOINTMENTS') {
      if (selectedFilter === 'VISITS' && item.category !== 'VISIT' && item.category !== 'CONSULTATION') return false;
      if (selectedFilter === 'PROCEDURES' && item.category !== 'PROCEDURES') return false;
      if (selectedFilter === 'MEDICINES' && item.category !== 'MEDICINES') return false;
      if (selectedFilter === 'PACKAGES' && item.category !== 'PACKAGES') return false;
      if (selectedFilter === 'PAYMENTS' && item.category !== 'PAYMENTS') return false;
      if (selectedFilter === 'EXPENSES' && item.category !== 'EXPENSES') return false;
    }

    // 2. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const title = (item.title || '').toLowerCase();
      const sub = (item.subtitle || '').toLowerCase();
      const badge = (item.badge || '').toLowerCase();
      return title.includes(q) || sub.includes(q) || badge.includes(q);
    }

    return true;
  });

  const summary = diaryData?.summary || {
    total_visits: 0,
    consultation_revenue: 0,
    procedure_revenue: 0,
    medicine_revenue: 0,
    package_revenue: 0,
    total_sales: 0,
    total_collection: 0,
    collection_by_mode: {},
    total_expenses: 0,
    expenses_by_category: {},
    net_balance: 0,
    appointments_count: 0
  };

  const isToday = selectedDate === formatDateToYMD(new Date());

  const navigateToPatient = (item) => {
    if (!item?.patient_id) return;
    const fallbackPatient = {
      id: item.patient_id,
      first_name: item.first_name || item.patient_name?.split(' ')[0] || 'Patient',
      last_name: item.last_name || item.patient_name?.split(' ').slice(1).join(' ') || '',
      skinssence_id: item.skinssence_id || '',
      mobile: item.mobile || ''
    };
    navigation.navigate('PatientProfile', {
      patientId: item.patient_id,
      patient: fallbackPatient
    });
  };

  const renderTimelineItem = ({ item }) => {
    const isClickable = !!item.patient_id;

    return (
      <TouchableOpacity
        style={styles.entryCard}
        activeOpacity={isClickable ? 0.7 : 1}
        onPress={() => {
          navigateToPatient(item);
        }}
      >
        <View style={styles.entryHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap', gap: 4 }}>
            {item.session_num ? (
              <View style={[styles.sessionTag, { backgroundColor: item.session_num === 1 ? '#eff6ff' : '#faf5ff', borderColor: item.session_num === 1 ? '#bfdbfe' : '#e9d5ff' }]}>
                <Text style={[styles.sessionTagText, { color: item.session_num === 1 ? '#1d4ed8' : '#7e22ce' }]}>
                  {item.session_num === 1 ? '🌅 S1' : '🌆 S2'}
                </Text>
              </View>
            ) : null}

            {item.time ? (
              <View style={styles.timeBadge}>
                <Ionicons name="time-outline" size={12} color="#475569" />
                <Text style={styles.timeBadgeText}>{item.time}</Text>
              </View>
            ) : null}

            <View style={[styles.categoryBadge, { backgroundColor: (item.badge_color && item.badge_color.startsWith('#') && item.badge_color.length === 7) ? `${item.badge_color}18` : '#f1f5f9' }]}>
              <Text style={[styles.categoryBadgeText, { color: item.badge_color || '#334155' }]}>
                {item.badge}
              </Text>
            </View>
          </View>

          {item.amount !== null && item.amount !== undefined ? (
            <Text style={[styles.entryAmount, item.is_debit ? styles.debitAmount : styles.creditAmount]}>
              {item.is_debit ? '-' : ''}₹{formatCurrency(item.amount)}
            </Text>
          ) : null}
        </View>

        <Text style={styles.entryTitle}>{item.title}</Text>
        {item.subtitle ? <Text style={styles.entrySubtitle}>{item.subtitle}</Text> : null}

        <View style={styles.entryFooter}>
          {isClickable ? (
            <TouchableOpacity onPress={() => navigateToPatient(item)}>
              <Text style={styles.viewProfileLink}>View Patient Profile ›</Text>
            </TouchableOpacity>
          ) : <View />}

          {item.visit_id ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={[styles.correctActionBtn, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}
                onPress={() => {
                  setEditingVisitId(item.visit_id);
                  setEditBillModalVisible(true);
                }}
              >
                <Ionicons name="pencil" size={13} color="#b45309" style={{ marginRight: 4 }} />
                <Text style={[styles.correctActionBtnText, { color: '#b45309' }]}>✏️ Edit Bill</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.correctActionBtn}
                onPress={() => {
                  setCorrectingVisitId(item.visit_id);
                  setCorrectionModalVisible(true);
                }}
              >
                <Ionicons name="build-outline" size={13} color="#5C0B0B" style={{ marginRight: 4 }} />
                <Text style={styles.correctActionBtnText}>Pharmacy / Refund</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Daily Diary & Sessions</Text>
            <Text style={styles.headerSubtitle}>Skinssence Day Book & Financial Ledger</Text>
          </View>
          <TouchableOpacity onPress={goToToday} style={[styles.todayBtn, isToday && styles.todayBtnActive]}>
            <Text style={[styles.todayBtnText, isToday && styles.todayBtnTextActive]}>Today</Text>
          </TouchableOpacity>
        </View>

        {/* DATE SELECTOR BAR */}
        <View style={styles.dateBar}>
          <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.dateNavBtn}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
            <Text style={styles.dateNavBtnText}>Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dateDisplayContainer}
            onPress={() => {
              setCustomDateInput(selectedDate);
              setShowDatePickerModal(true);
            }}
          >
            <Ionicons name="calendar" size={18} color="#fde047" style={{ marginRight: 6 }} />
            <Text style={styles.dateDisplayText}>{formatDisplayDate(selectedDate)}</Text>
            <Ionicons name="pencil" size={13} color="#fef08a" style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => shiftDate(1)} style={styles.dateNavBtn}>
            <Text style={styles.dateNavBtnText}>Next</Text>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* FILTER TABS & SEARCH */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search diary (patient, medicine, procedure)..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
          {[
            { id: 'ALL', label: 'All Transactions' },
            { id: 'VISITS', label: `Consultations (${summary.total_visits})` },
            { id: 'PROCEDURES', label: 'Procedures' },
            { id: 'MEDICINES', label: 'Pharmacy' },
            { id: 'PACKAGES', label: 'Packages' },
            { id: 'EXPENSES', label: 'Expenses' },
            { id: 'APPOINTMENTS', label: `Appts (${summary.appointments_count})` }
          ].map(pill => (
            <TouchableOpacity
              key={pill.id}
              style={[styles.pill, selectedFilter === pill.id && styles.pillActive]}
              onPress={() => setSelectedFilter(pill.id)}
            >
              <Text style={[styles.pillText, selectedFilter === pill.id && styles.pillTextActive]}>
                {pill.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* MAIN CONTENT */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5C0B0B" />
          <Text style={{ marginTop: 12, color: '#64748b' }}>Loading Daily Diary for {selectedDate}...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredTimeline}
          keyExtractor={(item) => item.id}
          renderItem={renderTimelineItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.summaryContainer}>
              {/* STAFF-CONTROLLED SESSION CONTROL CARD */}
              <View style={styles.sessionControlCard}>
                <View style={styles.sessionControlHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="timer-outline" size={18} color="#5C0B0B" style={{ marginRight: 6 }} />
                    <Text style={styles.sessionControlTitle}>Clinic Operating Sessions</Text>
                  </View>
                  <Text style={styles.sessionSubtitleDate}>{selectedDate}</Text>
                </View>

                {/* Session 1 Status Row */}
                <View style={styles.sessionStatusRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.sessionRowName}>🌅 Session 1 (Morning)</Text>
                      <View style={[styles.statusBadgeSmall, s1Status.status === 'CLOSED' ? styles.statusBadgeClosed : styles.statusBadgeOpen]}>
                        <Text style={[styles.statusBadgeSmallText, s1Status.status === 'CLOSED' ? styles.textClosed : styles.textOpen]}>
                          {s1Status.status === 'CLOSED' ? 'CLOSED' : 'OPEN / ACTIVE'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sessionMetaText}>
                      {s1Status.status === 'CLOSED'
                        ? `Ended by ${s1Status.closed_by_name || 'Staff'} at ${formatTimeOnly(s1Status.closed_at)}`
                        : 'Morning transactions active (Day start to closing)'}
                    </Text>
                  </View>

                  {/* Actions for Session 1 */}
                  {s1Status.status !== 'CLOSED' ? (
                    <TouchableOpacity
                      style={styles.endSessionBtn}
                      onPress={() => setConfirmEndModal({ visible: true, sessionNum: 1 })}
                    >
                      <Ionicons name="checkmark-done" size={14} color="#78350f" style={{ marginRight: 4 }} />
                      <Text style={styles.endSessionBtnText}>End Session 1</Text>
                    </TouchableOpacity>
                  ) : (
                    isAdminOrDoc ? (
                      <TouchableOpacity
                        style={styles.reopenBtn}
                        onPress={() => setReopenModal({ visible: true, sessionNum: 1, reason: '' })}
                      >
                        <Ionicons name="lock-open-outline" size={14} color="#1d4ed8" style={{ marginRight: 4 }} />
                        <Text style={styles.reopenBtnText}>Reopen S1</Text>
                      </TouchableOpacity>
                    ) : null
                  )}
                </View>

                {/* Session 2 Status Row */}
                <View style={[styles.sessionStatusRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8, paddingTop: 8 }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.sessionRowName}>🌆 Session 2 (Evening)</Text>
                      <View style={[
                        styles.statusBadgeSmall,
                        s2Status.status === 'CLOSED' ? styles.statusBadgeClosed : (s2Status.status === 'OPEN' ? styles.statusBadgeOpen : styles.statusBadgePending)
                      ]}>
                        <Text style={[
                          styles.statusBadgeSmallText,
                          s2Status.status === 'CLOSED' ? styles.textClosed : (s2Status.status === 'OPEN' ? styles.textOpen : styles.textPending)
                        ]}>
                          {s2Status.status === 'CLOSED' ? 'CLOSED' : (s2Status.status === 'OPEN' ? 'OPEN / ACTIVE' : 'NOT STARTED')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.sessionMetaText}>
                      {s2Status.status === 'CLOSED'
                        ? `Ended by ${s2Status.closed_by_name || 'Staff'} at ${formatTimeOnly(s2Status.closed_at)}`
                        : (s2Status.status === 'OPEN' ? 'Evening transactions active until day closing' : 'Starts automatically when Session 1 ends')}
                    </Text>
                  </View>

                  {/* Actions for Session 2 */}
                  {s2Status.status === 'OPEN' ? (
                    <TouchableOpacity
                      style={[styles.endSessionBtn, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}
                      onPress={() => setConfirmEndModal({ visible: true, sessionNum: 2 })}
                    >
                      <Ionicons name="checkmark-done" size={14} color="#78350f" style={{ marginRight: 4 }} />
                      <Text style={styles.endSessionBtnText}>End Session 2</Text>
                    </TouchableOpacity>
                  ) : (
                    s2Status.status === 'CLOSED' && isAdminOrDoc ? (
                      <TouchableOpacity
                        style={styles.reopenBtn}
                        onPress={() => setReopenModal({ visible: true, sessionNum: 2, reason: '' })}
                      >
                        <Ionicons name="lock-open-outline" size={14} color="#1d4ed8" style={{ marginRight: 4 }} />
                        <Text style={styles.reopenBtnText}>Reopen S2</Text>
                      </TouchableOpacity>
                    ) : null
                  )}
                </View>

                {/* Staff Submission Status Row (When Session 2 is closed) */}
                {isSession2Closed && (
                  <View style={styles.staffSubmissionBannerRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons
                          name={isStaffReportSubmitted ? "checkmark-circle" : "alert-circle"}
                          size={16}
                          color={isStaffReportSubmitted ? "#15803d" : "#b45309"}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.staffSubBannerTitle, isStaffReportSubmitted ? { color: '#15803d' } : { color: '#b45309' }]}>
                          {isStaffReportSubmitted
                            ? `Staff Day-End Report: Submitted by ${staffSubmission.staff_name || 'Staff'} ✅`
                            : 'Staff Day-End Report: PENDING ⚠️'}
                        </Text>
                      </View>
                      <Text style={styles.staffSubBannerSub}>
                        {isStaffReportSubmitted
                          ? 'Review requests, follow-ups, birthdays & handover remarks recorded.'
                          : 'Required step after Session 2 to unlock Final Full Day Summary.'}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.openReportActionBtn, isStaffReportSubmitted ? styles.openReportActionBtnDone : styles.openReportActionBtnPending]}
                      onPress={() => setStaffReportModalVisible(true)}
                    >
                      <Ionicons
                        name={isStaffReportSubmitted ? "eye-outline" : "clipboard-outline"}
                        size={13}
                        color={isStaffReportSubmitted ? "#15803d" : "#fff"}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.openReportActionBtnText, isStaffReportSubmitted ? { color: '#15803d' } : { color: '#fff' }]}>
                        {isStaffReportSubmitted ? 'View / Revise' : 'Complete Report'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* THREE-VIEW REPORT SWITCHER */}
              <View style={styles.reportSelectorSection}>
                <Text style={styles.reportSelectorTitle}>Financial Collection View:</Text>
                <View style={styles.segmentedButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.segmentBtn, selectedSessionView === 'SESSION_1' && styles.segmentBtnActive]}
                    onPress={() => setSelectedSessionView('SESSION_1')}
                  >
                    <Text style={[styles.segmentBtnText, selectedSessionView === 'SESSION_1' && styles.segmentBtnTextActive]}>
                      🌅 Session 1
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.segmentBtn, selectedSessionView === 'SESSION_2' && styles.segmentBtnActive]}
                    onPress={() => setSelectedSessionView('SESSION_2')}
                  >
                    <Text style={[styles.segmentBtnText, selectedSessionView === 'SESSION_2' && styles.segmentBtnTextActive]}>
                      🌆 Session 2
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.segmentBtn, selectedSessionView === 'FULL_DAY' && styles.segmentBtnActive]}
                    onPress={() => setSelectedSessionView('FULL_DAY')}
                  >
                    <Text style={[styles.segmentBtnText, selectedSessionView === 'FULL_DAY' && styles.segmentBtnTextActive]}>
                      📅 Full Day {isSession2Closed && !isStaffReportSubmitted ? '🔒' : '(S1+S2)'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* VIEW DISPLAY: CHECK IF FULL DAY IS PREMATURELY LOCKED */}
              {selectedSessionView === 'FULL_DAY' && isSession2Closed && !isStaffReportSubmitted ? (
                /* PREVENT PREMATURE FULL DAY SUMMARY DISPLAY */
                <View style={styles.pendingSubmissionLockCard}>
                  <View style={styles.lockIconCircle}>
                    <Ionicons name="lock-closed" size={32} color="#b45309" />
                  </View>
                  <Text style={styles.lockCardTitle}>Full Day Final Summary Locked</Text>
                  <Text style={styles.lockCardSub}>
                    Evening Session 2 is closed and financial totals are safely locked.
                    As per clinical protocol, staff must complete and submit the <Text style={{ fontWeight: 'bold' }}>Staff Daily Submission Report</Text> (Follow-up calls, birthday messages, Google review requests & handover notes) before the final Full Day Summary can be displayed.
                  </Text>
                  <TouchableOpacity
                    style={styles.completeReportBigBtn}
                    onPress={() => setStaffReportModalVisible(true)}
                  >
                    <Ionicons name="clipboard-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.completeReportBigBtnText}>📝 Complete & Submit Staff Report Now</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* 2-CATEGORY FINANCIAL REPORT TABLE */
                <View style={styles.twoCategoryReportCard}>
                  <View style={styles.repCardHeader}>
                    <View>
                      <Text style={styles.repCardHeaderTitle}>
                        {selectedSessionView === 'SESSION_1' ? '🌅 Session 1 Collection (Morning)' : (selectedSessionView === 'SESSION_2' ? '🌆 Session 2 Collection (Evening)' : '📅 Full Day Collection Summary')}
                      </Text>
                      <Text style={styles.repCardSub}>Two standardized collection categories</Text>
                    </View>
                    <View style={styles.repStatusTag}>
                      <Text style={styles.repStatusTagText}>
                        {selectedSessionView === 'SESSION_1'
                          ? (s1Status.status === 'CLOSED' ? 'LOCKED' : 'IN PROGRESS')
                          : (selectedSessionView === 'SESSION_2'
                              ? (s2Status.status === 'CLOSED' ? 'LOCKED' : (s2Status.status === 'OPEN' ? 'IN PROGRESS' : 'PENDING'))
                              : (s1Status.status === 'CLOSED' && s2Status.status === 'CLOSED' && isStaffReportSubmitted ? 'FINALIZED & VERIFIED' : 'LIVE'))}
                      </Text>
                    </View>
                  </View>

                  {/* CATEGORY 1: PROCEDURE */}
                  <View style={styles.categoryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.categoryTitle}>1. Procedure Collection</Text>
                      <Text style={styles.categoryDetails}>Includes consultation fees + all procedure charges + prepaid packages</Text>
                    </View>
                    <Text style={styles.categoryAmount}>
                      ₹{formatCurrency(activeReport.procedure_collection)}
                    </Text>
                  </View>

                  <View style={styles.rowDivider} />

                  {/* CATEGORY 2: MEDICINE */}
                  <View style={styles.categoryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.categoryTitle}>2. Medicine Collection</Text>
                      <Text style={styles.categoryDetails}>Includes pharmacy medicines dispensed & OTC sales</Text>
                    </View>
                    <Text style={styles.categoryAmount}>
                      ₹{formatCurrency(activeReport.medicine_collection)}
                    </Text>
                  </View>

                  <View style={[styles.rowDivider, { height: 2, backgroundColor: '#cbd5e1' }]} />

                  {/* GRAND TOTAL */}
                  <View style={[styles.categoryRow, styles.grandTotalRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.grandTotalTitle}>Grand Total Collection</Text>
                      <Text style={styles.grandTotalSubtitle}>Procedure + Medicine Total</Text>
                    </View>
                    <Text style={styles.grandTotalAmount}>
                      ₹{formatCurrency(activeReport.grand_total)}
                    </Text>
                  </View>

                  {/* RECONCILIATION AUDIT FOOTER */}
                  <View style={styles.reconciliationCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="shield-checkmark" size={15} color="#16a34a" style={{ marginRight: 6 }} />
                      <Text style={styles.reconcileText}>
                        Reconciled: ₹{formatCurrency(activeReport.procedure_collection)} + ₹{formatCurrency(activeReport.medicine_collection)} = ₹{formatCurrency(activeReport.grand_total)}
                      </Text>
                    </View>
                    {selectedSessionView === 'FULL_DAY' && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={styles.reconcileSubText}>
                          • Session 1: ₹{formatCurrency(finReports.session_1.procedure_collection)} (Proc) + ₹{formatCurrency(finReports.session_1.medicine_collection)} (Med) = ₹{formatCurrency(finReports.session_1.grand_total)}
                        </Text>
                        <Text style={styles.reconcileSubText}>
                          • Session 2: ₹{formatCurrency(finReports.session_2.procedure_collection)} (Proc) + ₹{formatCurrency(finReports.session_2.medicine_collection)} (Med) = ₹{formatCurrency(finReports.session_2.grand_total)}
                        </Text>
                        <Text style={[styles.reconcileSubText, { fontWeight: 'bold', color: '#15803d', marginTop: 2 }]}>
                          • Full Day Total: Session 1 (₹{formatCurrency(finReports.session_1.grand_total)}) + Session 2 (₹{formatCurrency(finReports.session_2.grand_total)}) = ₹{formatCurrency(finReports.full_day.grand_total)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* PART B: STAFF SUBMISSION STATUS & DETAILS (Shown in Full Day view when submitted) */}
                  {selectedSessionView === 'FULL_DAY' && isStaffReportSubmitted && (
                    <View style={styles.staffSubmissionFullSection}>
                      <View style={styles.staffSubmissionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Ionicons name="checkmark-circle" size={18} color="#15803d" style={{ marginRight: 6 }} />
                          <Text style={styles.staffSubmissionHeaderTitle}>Staff Daily Report Concluded</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.reviseBtn}
                          onPress={() => setStaffReportModalVisible(true)}
                        >
                          <Ionicons name="create-outline" size={12} color="#1d4ed8" style={{ marginRight: 3 }} />
                          <Text style={styles.reviseBtnText}>Revise</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.staffMetaRow}>
                        <Text style={styles.staffMetaLabel}>Staff Member:</Text>
                        <Text style={styles.staffMetaVal}>{staffSubmission.staff_name || 'Staff'}</Text>
                      </View>
                      <View style={styles.staffMetaRow}>
                        <Text style={styles.staffMetaLabel}>Submitted At:</Text>
                        <Text style={styles.staffMetaVal}>{formatDisplayDate(selectedDate)} {formatTimeOnly(staffSubmission.submission_date)}</Text>
                      </View>
                      <View style={styles.staffMetaRow}>
                        <Text style={styles.staffMetaLabel}>Report Status:</Text>
                        <Text style={[styles.staffMetaVal, { color: '#15803d', fontWeight: 'bold' }]}>Completed & Finalized ✅</Text>
                      </View>

                      {/* TASK SUMMARY CHIPS */}
                      <View style={styles.tasksChipsGrid}>
                        <View style={styles.taskChip}>
                          <Text style={styles.taskChipVal}>{staffSubmission.report?.followup_calls_count ?? 0}</Text>
                          <Text style={styles.taskChipLabel}>📞 Calls</Text>
                        </View>
                        <View style={styles.taskChip}>
                          <Text style={styles.taskChipVal}>{staffSubmission.report?.followup_whatsapp_count ?? 0}</Text>
                          <Text style={styles.taskChipLabel}>💬 WA Followup</Text>
                        </View>
                        <View style={styles.taskChip}>
                          <Text style={styles.taskChipVal}>{staffSubmission.report?.birthday_messages_count ?? 0}</Text>
                          <Text style={styles.taskChipLabel}>🎂 Birthdays</Text>
                        </View>
                        <View style={styles.taskChip}>
                          <Text style={styles.taskChipVal}>{staffSubmission.report?.reviews_collected_count ?? 0}</Text>
                          <Text style={styles.taskChipLabel}>⭐ Reviews</Text>
                        </View>
                        <View style={styles.taskChip}>
                          <Text style={styles.taskChipVal}>{staffSubmission.report?.total_visiting_patients ?? summary.total_visits}</Text>
                          <Text style={styles.taskChipLabel}>👥 Visited</Text>
                        </View>
                      </View>

                      {staffSubmission.report?.summary_notes ? (
                        <View style={styles.notesContainer}>
                          <Text style={styles.notesLabel}>Staff Handover Remarks:</Text>
                          <Text style={styles.notesContent}>"{staffSubmission.report.summary_notes}"</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              )}

              {/* TIMELINE SECTION HEADER */}
              <View style={styles.timelineSectionHeader}>
                <Text style={styles.timelineSectionTitle}>
                  Day Activity Log ({filteredTimeline.length} Entries
                  {selectedSessionView === 'SESSION_1' ? ' • Morning Session 1' : (selectedSessionView === 'SESSION_2' ? ' • Evening Session 2' : ' • Full Day')}
                  )
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={54} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No Entries Found</Text>
              <Text style={styles.emptySubtitle}>
                No transactions or activities matching this filter on {selectedDate}.
              </Text>
            </View>
          }
        />
      )}

      {/* CONFIRMATION MODAL TO END SESSION */}
      <Modal visible={confirmEndModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="alert-circle" size={24} color="#d97706" style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>End Session {confirmEndModal.sessionNum}?</Text>
            </View>

            <Text style={styles.modalBodyText}>
              Are you sure you want to end <Text style={{ fontWeight: 'bold' }}>Session {confirmEndModal.sessionNum} ({confirmEndModal.sessionNum === 1 ? 'Morning' : 'Evening'})</Text>?
            </Text>

            <View style={styles.modalSummaryBox}>
              <Text style={styles.modalSummaryRow}>• Procedure: ₹{formatCurrency(confirmEndModal.sessionNum === 1 ? finReports.session_1.procedure_collection : finReports.session_2.procedure_collection)}</Text>
              <Text style={styles.modalSummaryRow}>• Medicine: ₹{formatCurrency(confirmEndModal.sessionNum === 1 ? finReports.session_1.medicine_collection : finReports.session_2.medicine_collection)}</Text>
              <Text style={[styles.modalSummaryRow, { fontWeight: 'bold', color: '#16a34a' }]}>
                • Grand Total: ₹{formatCurrency(confirmEndModal.sessionNum === 1 ? finReports.session_1.grand_total : finReports.session_2.grand_total)}
              </Text>
            </View>

            <Text style={[styles.modalHelp, { marginTop: 8 }]}>
              {confirmEndModal.sessionNum === 1
                ? 'Session 1 will be closed and locked. All subsequent transactions will automatically belong to Session 2.'
                : 'Session 2 financial summary will be locked. Next, the existing Staff Submission Report form will open automatically to conclude daily activities.'}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#e2e8f0' }]}
                disabled={actionLoading}
                onPress={() => setConfirmEndModal({ visible: false, sessionNum: 1 })}
              >
                <Text style={{ color: '#475569', fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#5C0B0B' }]}
                disabled={actionLoading}
                onPress={() => executeEndSession(confirmEndModal.sessionNum)}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                    {confirmEndModal.sessionNum === 1 ? 'Confirm & End S1' : 'Confirm & Proceed to Report'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ADMIN-ONLY REOPEN SESSION MODAL (WITH MANDATORY REASON) */}
      <Modal visible={reopenModal.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="lock-open" size={24} color="#1d4ed8" style={{ marginRight: 8 }} />
              <Text style={styles.modalTitle}>Admin: Reopen Session {reopenModal.sessionNum}</Text>
            </View>

            <Text style={styles.modalBodyText}>
              You are reopening <Text style={{ fontWeight: 'bold' }}>Session {reopenModal.sessionNum}</Text> for {selectedDate}.
              A mandatory reason is required for compliance audit logs.
            </Text>

            <Text style={[styles.modalHelp, { marginTop: 10, marginBottom: 4, fontWeight: 'bold' }]}>
              Enter Mandatory Reason:
            </Text>
            <TextInput
              style={[styles.modalInput, { height: 70, textAlignVertical: 'top', textAlign: 'left', fontWeight: 'normal', fontSize: 14 }]}
              multiline
              placeholder="e.g. Doctor added late evening laser procedure or corrected billing error..."
              value={reopenModal.reason}
              onChangeText={(text) => setReopenModal(prev => ({ ...prev, reason: text }))}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#e2e8f0' }]}
                disabled={actionLoading}
                onPress={() => setReopenModal({ visible: false, sessionNum: 1, reason: '' })}
              >
                <Text style={{ color: '#475569', fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#1d4ed8' }]}
                disabled={actionLoading}
                onPress={executeReopenSession}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Reopen Session</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* EXISTING STAFF SUBMISSION REPORT FORM MODAL (INTEGRATED AFTER END SESSION 2) */}
      <PendingFollowupReminderModal
        visible={staffReportModalVisible}
        onClose={() => setStaffReportModalVisible(false)}
        navigation={navigation}
        initialTab="summary"
        reportDate={selectedDate}
        onSummarySubmitted={(summaryData) => {
          setStaffReportModalVisible(false);
          fetchDiary(selectedDate);
          Alert.alert(
            'Full Day Finalized! 🎉',
            'Staff Daily Submission Report recorded successfully. The final Full Day Summary is now unlocked.'
          );
        }}
        onUpdated={() => {
          fetchDiary(selectedDate);
        }}
      />

      {/* DATE PICKER MODAL */}
      <Modal visible={showDatePickerModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Diary Date</Text>
            <Text style={styles.modalHelp}>Enter date in YYYY-MM-DD format (e.g., 2026-08-05):</Text>
            <TextInput
              style={styles.modalInput}
              value={customDateInput}
              onChangeText={setCustomDateInput}
              placeholder="YYYY-MM-DD"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#e2e8f0' }]}
                onPress={() => setShowDatePickerModal(false)}
              >
                <Text style={{ color: '#475569', fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#5C0B0B' }]}
                onPress={applyCustomDate}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Go to Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* EDIT BILL MODAL */}
      <EditBillModal
        visible={editBillModalVisible}
        visitId={editingVisitId}
        initialVisit={diaryData?.timeline?.find(t => t.visit_id === editingVisitId)}
        onClose={() => {
          setEditBillModalVisible(false);
          setEditingVisitId(null);
        }}
        onUpdated={() => {
          fetchDiary(selectedDate);
        }}
      />

      {/* PHARMACY CORRECTION MODAL */}
      <PharmacyCorrectionModal
        visible={correctionModalVisible}
        visitId={correctingVisitId}
        onClose={() => {
          setCorrectionModalVisible(false);
          setCorrectingVisitId(null);
        }}
        onUpdated={() => {
          fetchDiary(selectedDate);
        }}
      />
    </View>
  );
}

class DailyDiaryErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[DailyDiary] Error caught by boundary:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' }}>
          <Ionicons name="alert-circle-outline" size={60} color="#dc2626" />
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginTop: 14, marginBottom: 8, textAlign: 'center' }}>
            Daily Diary Error
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 12, lineHeight: 18 }}>
            An unexpected error occurred while loading this date's timeline.
          </Text>
          {this.state.error ? (
            <View style={{ backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5', padding: 10, borderRadius: 8, marginBottom: 20, width: '100%' }}>
              <Text style={{ fontSize: 12, color: '#991b1b', fontWeight: 'bold', textAlign: 'center' }}>
                {this.state.error?.name || 'Error'}: {this.state.error?.message || String(this.state.error)}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity 
            style={{ backgroundColor: '#5C0B0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => this.props.navigation?.goBack()}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>← Go Back Safely</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function DailyDiaryScreen(props) {
  return (
    <DailyDiaryErrorBoundary navigation={props.navigation}>
      <DailyDiaryScreenContent {...props} />
    </DailyDiaryErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#5C0B0B', paddingTop: 45, paddingBottom: 12, paddingHorizontal: 16 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSubtitle: { color: '#fca5a5', fontSize: 12, marginTop: 1 },
  todayBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  todayBtnActive: { backgroundColor: '#fde047' },
  todayBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  todayBtnTextActive: { color: '#713f12' },
  dateBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 6 },
  dateNavBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  dateNavBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  dateDisplayContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  dateDisplayText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  filterSection: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 10, height: 38, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 13, color: '#1e293b' },
  pillsScroll: { flexDirection: 'row' },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f1f5f9', marginRight: 8 },
  pillActive: { backgroundColor: '#5C0B0B' },
  pillText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  pillTextActive: { color: '#fff', fontWeight: 'bold' },
  listContent: { padding: 12, paddingBottom: 40 },
  summaryContainer: { marginBottom: 12 },

  // --- SESSION CONTROLS STYLES ---
  sessionControlCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, elevation: 3, borderWidth: 1, borderColor: '#fed7aa', marginBottom: 12 },
  sessionControlHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sessionControlTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
  sessionSubtitleDate: { fontSize: 11, fontWeight: 'bold', color: '#78350f', backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sessionStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionRowName: { fontSize: 13, fontWeight: 'bold', color: '#1e293b', marginRight: 6 },
  statusBadgeSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  statusBadgeOpen: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  statusBadgeClosed: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  statusBadgePending: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  statusBadgeSmallText: { fontSize: 10, fontWeight: 'bold' },
  textOpen: { color: '#15803d' },
  textClosed: { color: '#64748b' },
  textPending: { color: '#94a3b8' },
  sessionMetaText: { fontSize: 11, color: '#64748b', marginTop: 2 },
  endSessionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fed7aa', borderWidth: 1, borderColor: '#fdba74', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  endSessionBtnText: { fontSize: 11, fontWeight: 'bold', color: '#78350f' },
  reopenBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  reopenBtnText: { fontSize: 11, fontWeight: 'bold', color: '#1d4ed8' },

  // --- STAFF SUBMISSION BANNER IN SESSION CARD ---
  staffSubmissionBannerRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  staffSubBannerTitle: { fontSize: 12, fontWeight: 'bold' },
  staffSubBannerSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  openReportActionBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  openReportActionBtnPending: { backgroundColor: '#b45309' },
  openReportActionBtnDone: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  openReportActionBtnText: { fontSize: 11, fontWeight: 'bold' },

  // --- THREE-VIEW SELECTOR STYLES ---
  reportSelectorSection: { marginBottom: 10 },
  reportSelectorTitle: { fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 6 },
  segmentedButtonsContainer: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 10, padding: 3 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentBtnActive: { backgroundColor: '#5C0B0B', elevation: 2 },
  segmentBtnText: { fontSize: 11, fontWeight: 'bold', color: '#475569' },
  segmentBtnTextActive: { color: '#fff' },

  // --- PREVENT PREMATURE FULL DAY SUMMARY CARD (LOCKED STATE) ---
  pendingSubmissionLockCard: { backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fde68a', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 14, elevation: 2 },
  lockIconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  lockCardTitle: { fontSize: 16, fontWeight: 'bold', color: '#92400e', marginBottom: 6 },
  lockCardSub: { fontSize: 12, color: '#78350f', textAlign: 'center', lineHeight: 18, marginBottom: 16, paddingHorizontal: 10 },
  completeReportBigBtn: { backgroundColor: '#b45309', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 8, elevation: 2 },
  completeReportBigBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },

  // --- TWO-CATEGORY REPORT CARD ---
  twoCategoryReportCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, elevation: 3, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 12 },
  repCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  repCardHeaderTitle: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  repCardSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  repStatusTag: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  repStatusTagText: { fontSize: 10, fontWeight: 'bold', color: '#475569' },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  categoryTitle: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
  categoryDetails: { fontSize: 11, color: '#64748b', marginTop: 1 },
  categoryAmount: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  rowDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 6 },
  grandTotalRow: { backgroundColor: '#f8fafc', padding: 8, borderRadius: 8, marginTop: 4 },
  grandTotalTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e293b' },
  grandTotalSubtitle: { fontSize: 10, color: '#64748b' },
  grandTotalAmount: { fontSize: 18, fontWeight: 'bold', color: '#15803d' },
  reconciliationCard: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  reconcileText: { fontSize: 11, fontWeight: 'bold', color: '#15803d' },
  reconcileSubText: { fontSize: 11, color: '#475569', marginTop: 2 },

  // --- FULL DAY STAFF SUBMISSION DETAILS SECTION ---
  staffSubmissionFullSection: { marginTop: 14, paddingTop: 12, borderTopWidth: 2, borderTopColor: '#e2e8f0', backgroundColor: '#f0fdf4', marginHorizontal: -14, marginBottom: -14, padding: 14, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  staffSubmissionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  staffSubmissionHeaderTitle: { fontSize: 13, fontWeight: 'bold', color: '#166534' },
  reviseBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  reviseBtnText: { fontSize: 11, fontWeight: 'bold', color: '#1d4ed8' },
  staffMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  staffMetaLabel: { fontSize: 11, color: '#475569' },
  staffMetaVal: { fontSize: 11, fontWeight: '600', color: '#1e293b' },
  tasksChipsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
  taskChip: { flex: 1, backgroundColor: '#fff', borderRadius: 6, paddingVertical: 6, alignItems: 'center', marginHorizontal: 2, borderWidth: 1, borderColor: '#bbf7d0' },
  taskChipVal: { fontSize: 13, fontWeight: 'bold', color: '#15803d' },
  taskChipLabel: { fontSize: 9, color: '#475569', marginTop: 1 },
  notesContainer: { backgroundColor: '#fff', borderRadius: 6, padding: 8, marginTop: 6, borderWidth: 1, borderColor: '#bbf7d0' },
  notesLabel: { fontSize: 10, fontWeight: 'bold', color: '#166534', marginBottom: 2 },
  notesContent: { fontSize: 11, color: '#334155', fontStyle: 'italic' },

  timelineSectionHeader: { marginTop: 6, marginBottom: 8 },
  timelineSectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
  entryCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  sessionTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, marginRight: 4 },
  sessionTagText: { fontSize: 10, fontWeight: 'bold' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 4 },
  timeBadgeText: { fontSize: 11, color: '#475569', fontWeight: '600', marginLeft: 3 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  categoryBadgeText: { fontSize: 11, fontWeight: 'bold' },
  entryAmount: { fontSize: 15, fontWeight: 'bold' },
  creditAmount: { color: '#16a34a' },
  debitAmount: { color: '#dc2626' },
  entryTitle: { fontSize: 14, fontWeight: 'bold', color: '#0f172a', marginBottom: 4 },
  entrySubtitle: { fontSize: 12, color: '#64748b', lineHeight: 17 },
  entryFooter: { marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewProfileLink: { fontSize: 11, fontWeight: 'bold', color: '#3b82f6' },
  correctActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  correctActionBtnText: { color: '#5C0B0B', fontSize: 11, fontWeight: 'bold' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40, marginTop: 20 },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: '#475569', marginTop: 12 },
  emptySubtitle: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: 360, borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1e293b' },
  modalBodyText: { fontSize: 13, color: '#334155', lineHeight: 18, marginBottom: 8 },
  modalSummaryBox: { backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginVertical: 6 },
  modalSummaryRow: { fontSize: 12, color: '#334155', marginVertical: 2 },
  modalHelp: { fontSize: 11, color: '#64748b', marginBottom: 12 },
  modalInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 16, color: '#1e293b' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 }
});
