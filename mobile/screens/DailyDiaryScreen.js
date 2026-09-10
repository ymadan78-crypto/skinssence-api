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

export default function DailyDiaryScreen({ navigation, route }) {
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

  const fetchDiary = async (dateToFetch) => {
    const target = dateToFetch || selectedDate;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      // Use configured render API
      const res = await axios.get(`https://skinssence-api.onrender.com/api/admin/diary?date=${target}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDiaryData(res.data);
    } catch (e) {
      console.log('Error fetching diary data from cloud:', e?.response?.data || e.message);
      // Fallback local API if testing locally
      try {
        const token = await AsyncStorage.getItem('userToken');
        const fallbackRes = await axios.get(`http://localhost:3000/api/admin/diary?date=${target}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDiaryData(fallbackRes.data);
      } catch (err2) {
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

  // Filtering Timeline items
  const timelineItems = diaryData?.timeline || [];
  const filteredTimeline = timelineItems.filter(item => {
    // 1. Category Filter
    if (selectedFilter !== 'ALL') {
      if (selectedFilter === 'VISITS' && item.category !== 'VISIT' && item.category !== 'CONSULTATION') return false;
      if (selectedFilter === 'PROCEDURES' && item.category !== 'PROCEDURES') return false;
      if (selectedFilter === 'MEDICINES' && item.category !== 'MEDICINES') return false;
      if (selectedFilter === 'PACKAGES' && item.category !== 'PACKAGES') return false;
      if (selectedFilter === 'PAYMENTS' && item.category !== 'PAYMENTS') return false;
      if (selectedFilter === 'EXPENSES' && item.category !== 'EXPENSES') return false;
      if (selectedFilter === 'APPOINTMENTS' && item.category !== 'APPOINTMENTS') return false;
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

  const renderTimelineItem = ({ item }) => {
    const isClickable = !!item.patient_id;

    return (
      <TouchableOpacity
        style={styles.entryCard}
        activeOpacity={isClickable ? 0.7 : 1}
        onPress={() => {
          if (item.patient_id) {
            navigation.navigate('PatientProfile', { patientId: item.patient_id });
          }
        }}
      >
        <View style={styles.entryHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {item.time ? (
              <View style={styles.timeBadge}>
                <Ionicons name="time-outline" size={13} color="#475569" />
                <Text style={styles.timeBadgeText}>{item.time}</Text>
              </View>
            ) : null}
            <View style={[styles.categoryBadge, { backgroundColor: item.badge_color ? `${item.badge_color}18` : '#f1f5f9' }]}>
              <Text style={[styles.categoryBadgeText, { color: item.badge_color || '#334155' }]}>
                {item.badge}
              </Text>
            </View>
          </View>
          {item.amount !== null && item.amount !== undefined ? (
            <Text style={[styles.entryAmount, item.is_debit ? styles.debitAmount : styles.creditAmount]}>
              {item.is_debit ? '-' : ''}₹{item.amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
            </Text>
          ) : null}
        </View>

        <Text style={styles.entryTitle}>{item.title}</Text>
        {item.subtitle ? <Text style={styles.entrySubtitle}>{item.subtitle}</Text> : null}

        <View style={styles.entryFooter}>
          {isClickable ? (
            <TouchableOpacity onPress={() => navigation.navigate('PatientProfile', { patientId: item.patient_id })}>
              <Text style={styles.viewProfileLink}>View Patient Profile ›</Text>
            </TouchableOpacity>
          ) : <View />}

          {item.visit_id ? (
            <TouchableOpacity
              style={styles.correctActionBtn}
              onPress={() => {
                setCorrectingVisitId(item.visit_id);
                setCorrectionModalVisible(true);
              }}
            >
              <Ionicons name="build-outline" size={13} color="#5C0B0B" style={{ marginRight: 4 }} />
              <Text style={styles.correctActionBtnText}>Edit / Correct Sale</Text>
            </TouchableOpacity>
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
            <Text style={styles.headerTitle}>Daily Diary / Day Book</Text>
            <Text style={styles.headerSubtitle}>Skinssence Clinic Daily Ledger</Text>
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
            placeholder="Search diary (patient, procedure, vendor)..."
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
            { id: 'ALL', label: 'All Activities' },
            { id: 'VISITS', label: `Visits (${summary.total_visits})` },
            { id: 'PROCEDURES', label: 'Procedures' },
            { id: 'MEDICINES', label: 'Medicines' },
            { id: 'PACKAGES', label: 'Packages' },
            { id: 'PAYMENTS', label: 'Collections' },
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
              {/* TOP FINANCIAL OVERVIEW CARD */}
              <View style={styles.heroFinancialCard}>
                <View style={styles.finHeader}>
                  <Text style={styles.finHeaderTitle}>Daily Financial Position</Text>
                  <Text style={styles.finDateBadge}>{selectedDate}</Text>
                </View>

                <View style={styles.finRow}>
                  <View style={styles.finCol}>
                    <Text style={styles.finLabel}>Total Sales/Billed</Text>
                    <Text style={styles.finValBilled}>₹{summary.total_sales.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.finCol}>
                    <Text style={styles.finLabel}>Actual Collected</Text>
                    <Text style={styles.finValCollected}>₹{summary.total_collection.toLocaleString('en-IN')}</Text>
                  </View>
                </View>

                <View style={styles.finDivider} />

                <View style={styles.finRow}>
                  <View style={styles.finCol}>
                    <Text style={styles.finLabel}>Total Expenses</Text>
                    <Text style={styles.finValExpense}>₹{summary.total_expenses.toLocaleString('en-IN')}</Text>
                  </View>
                  <View style={styles.finCol}>
                    <Text style={styles.finLabel}>Net Cash Balance</Text>
                    <Text style={[styles.finValNet, summary.net_balance >= 0 ? styles.posNet : styles.negNet]}>
                      {summary.net_balance >= 0 ? '+' : ''}₹{summary.net_balance.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                {/* MODE-WISE COLLECTION BADGES */}
                {Object.keys(summary.collection_by_mode || {}).length > 0 && (
                  <View style={styles.modeContainer}>
                    <Text style={styles.modeHeading}>Collection Modes:</Text>
                    <View style={styles.modeChipsRow}>
                      {Object.entries(summary.collection_by_mode).map(([mode, amt]) => (
                        <View key={mode} style={styles.modeChip}>
                          <Text style={styles.modeChipText}>
                            {mode}: ₹{amt.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* OPERATIONAL BREAKDOWN SUMMARY */}
              <View style={styles.opSummaryRow}>
                <View style={styles.opCard}>
                  <Text style={styles.opVal}>{summary.total_visits}</Text>
                  <Text style={styles.opLabel}>Patients</Text>
                </View>
                <View style={styles.opCard}>
                  <Text style={styles.opVal}>₹{summary.consultation_revenue.toLocaleString('en-IN')}</Text>
                  <Text style={styles.opLabel}>Consultation</Text>
                </View>
                <View style={styles.opCard}>
                  <Text style={styles.opVal}>₹{summary.procedure_revenue.toLocaleString('en-IN')}</Text>
                  <Text style={styles.opLabel}>Procedures</Text>
                </View>
                <View style={styles.opCard}>
                  <Text style={styles.opVal}>₹{summary.medicine_revenue.toLocaleString('en-IN')}</Text>
                  <Text style={styles.opLabel}>Pharmacy</Text>
                </View>
              </View>

              <View style={styles.timelineSectionHeader}>
                <Text style={styles.timelineSectionTitle}>
                  Day Activity Log ({filteredTimeline.length} Entries)
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="book-outline" size={54} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No Entries for this Date</Text>
              <Text style={styles.emptySubtitle}>
                No visits, procedures, payments, expenses, or appointments recorded on {selectedDate}.
              </Text>
            </View>
          }
        />
      )}

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

      {/* PHARMACY & SALE CORRECTION MODAL */}
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
  heroFinancialCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 3, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  finHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  finHeaderTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b' },
  finDateBadge: { fontSize: 11, fontWeight: 'bold', color: '#5C0B0B', backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  finRow: { flexDirection: 'row', justifyContent: 'space-between' },
  finCol: { flex: 1 },
  finLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 2 },
  finValBilled: { fontSize: 17, fontWeight: 'bold', color: '#0f172a' },
  finValCollected: { fontSize: 17, fontWeight: 'bold', color: '#16a34a' },
  finValExpense: { fontSize: 17, fontWeight: 'bold', color: '#dc2626' },
  finValNet: { fontSize: 17, fontWeight: 'bold' },
  posNet: { color: '#16a34a' },
  negNet: { color: '#dc2626' },
  finDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 },
  modeContainer: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  modeHeading: { fontSize: 11, color: '#64748b', fontWeight: 'bold', marginBottom: 6 },
  modeChipsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  modeChip: { backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 6, marginBottom: 4, borderWidth: 1, borderColor: '#bbf7d0' },
  modeChipText: { fontSize: 11, color: '#166534', fontWeight: 'bold' },
  opSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  opCard: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, marginHorizontal: 3, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', elevation: 1 },
  opVal: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
  opLabel: { fontSize: 10, color: '#64748b', marginTop: 2 },
  timelineSectionHeader: { marginTop: 6, marginBottom: 8 },
  timelineSectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#334155' },
  entryCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', elevation: 2 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  timeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 6 },
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
  modalContent: { backgroundColor: '#fff', width: '100%', maxWidth: 340, borderRadius: 12, padding: 20, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 },
  modalHelp: { fontSize: 12, color: '#64748b', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 16, textAlign: 'center', fontWeight: 'bold', color: '#1e293b' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
  modalBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginHorizontal: 4 }
});
