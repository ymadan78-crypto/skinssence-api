import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import PharmacyCorrectionModal from '../components/PharmacyCorrectionModal';

export default function TodayPatientsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visits, setVisits] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [correctingVisitId, setCorrectingVisitId] = useState(null);
  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);

  const fetchTodayVisits = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get('https://skinssence-api.onrender.com/api/dashboard/today-visits', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVisits(res.data || []);
    } catch (e) {
      console.log('Error fetching today visits', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTodayVisits();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchTodayVisits();
  };

  const filteredVisits = visits.filter(v => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const name = `${v.first_name || ''} ${v.last_name || ''}`.toLowerCase();
    const sNum = (v.skinssence_id || '').toLowerCase();
    const mob = (v.mobile || '').toLowerCase();
    const procs = (v.procedures || []).map(p => (p.name || '').toLowerCase()).join(' ');
    const meds = (v.medicines || []).map(m => (m.details || '').toLowerCase()).join(' ');
    return name.includes(q) || sNum.includes(q) || mob.includes(q) || procs.includes(q) || meds.includes(q);
  });

  // Aggregations for summary bar
  const totalPatientsCount = visits.length;
  const totalConsultationFees = visits.reduce((sum, v) => sum + (parseFloat(v.consultation_fee) || 0), 0);
  const totalProcedureRevenue = visits.reduce((sum, v) => sum + (parseFloat(v.procedure_total) || 0), 0);
  const totalPharmacyRevenue = visits.reduce((sum, v) => sum + (parseFloat(v.medicine_total) || 0), 0);
  const totalGrandBilled = visits.reduce((sum, v) => sum + (parseFloat(v.total_amount) || 0), 0);
  const totalCollectedPaid = visits.reduce((sum, v) => sum + (parseFloat(v.amount_paid) || 0), 0);

  const formatVisitTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return '';
    }
  };

  const getVisitStatusBadge = (cFee, procsCount, medsCount, isPharmacyOnly, plannedProcs) => {
    if (cFee === 0 && procsCount === 0 && medsCount === 0) {
      if ((plannedProcs || '').includes('REPORT')) return { label: '🔬 Report Review (₹0)', bg: '#f0fdf4', text: '#166534', border: '#86efac' };
      return { label: '📋 Follow-up / Check (₹0)', bg: '#f8fafc', text: '#475569', border: '#cbd5e1' };
    }
    if (isPharmacyOnly && cFee === 0 && procsCount === 0) return { label: '💊 Pharmacy Only', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' };
    if (cFee > 0 && procsCount === 0 && medsCount === 0) return { label: '🩺 Consultation Only', bg: '#f0fdf4', text: '#166534', border: '#86efac' };
    if (cFee > 0 && procsCount > 0 && medsCount === 0) return { label: '🩺+🏥 Consultation & Procedure', bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
    if (cFee === 0 && procsCount > 0 && medsCount === 0) return { label: '🏥 Procedure Only', bg: '#faf5ff', text: '#6b21a8', border: '#d8b4fe' };
    if (cFee > 0 && procsCount === 0 && medsCount > 0) return { label: '🩺+💊 Consultation & Pharmacy', bg: '#ecfeff', text: '#155e75', border: '#a5f3fc' };
    if (cFee > 0 && procsCount > 0 && medsCount > 0) return { label: '🌟 Full Service (All 3)', bg: '#fdf2f8', text: '#9d174d', border: '#fbcfe8' };
    if (cFee === 0 && procsCount > 0 && medsCount > 0) return { label: '🏥+💊 Procedure & Pharmacy', bg: '#fff7ed', text: '#9a3412', border: '#ffedd5' };
    return { label: '📋 General Visit', bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
  };

  const renderVisitCard = ({ item, index }) => {
    const isPharmacyOnly = item.planned_procedures === 'PHARMACY SALE';
    const cFee = parseFloat(item.consultation_fee) || 0;
    const procs = item.procedures || [];
    const meds = item.medicines || [];
    const pays = item.payments || [];
    const procTotal = parseFloat(item.procedure_total) || 0;
    const medTotal = parseFloat(item.medicine_total) || 0;
    const grandTotal = parseFloat(item.total_amount) || (cFee + procTotal + medTotal);
    const amountPaid = parseFloat(item.amount_paid) || 0;

    const statusBadge = getVisitStatusBadge(cFee, procs.length, meds.length, isPharmacyOnly, item.planned_procedures);
    const payModes = pays.map(p => `${p.mode}: ₹${parseFloat(p.amount_received || 0).toFixed(0)}`).join(' + ') || 'Paid';

    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('PatientProfile', { 
          patient: { 
            id: item.patient_id, 
            skinssence_id: item.skinssence_id, 
            first_name: item.first_name, 
            last_name: item.last_name, 
            mobile: item.mobile 
          } 
        })}>
        
        {/* ROW 1: S.NO / ID, NAME & STATUS BADGE */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.patientMeta}>
            <View style={styles.sNumBadge}>
              <Text style={styles.sNumText}>{item.skinssence_id || `ID: ${item.patient_id}`}</Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.patientName}>{item.first_name} {item.last_name || ''}</Text>
              <Text style={styles.patientMobile}>📞 {item.mobile || 'N/A'}</Text>
            </View>
          </View>
          
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg, borderColor: statusBadge.border }]}>
              <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>{statusBadge.label}</Text>
            </View>
            <Text style={styles.timeText}>{formatVisitTime(item.visit_date)}</Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        {/* COMPONENT BREAKDOWN TABLE */}
        <View style={styles.tableContainer}>
          {/* Header */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableColHeader, { flex: 2 }]}>Component / Description</Text>
            <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'right' }]}>Billed Amount</Text>
          </View>

          {/* 1. Consultation Fee */}
          <View style={styles.tableDataRow}>
            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ marginRight: 6 }}>🩺</Text>
              <Text style={styles.componentName}>Consultation Fee</Text>
            </View>
            <Text style={[styles.componentAmount, { color: cFee > 0 ? '#111827' : '#9ca3af' }]}>
              ₹ {cFee.toFixed(0)}
            </Text>
          </View>

          {/* 2. Procedures */}
          {procs.length > 0 ? (
            procs.map((p, pIdx) => (
              <View key={pIdx} style={styles.tableDataRow}>
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ marginRight: 6 }}>🏥</Text>
                  <Text style={styles.componentName}>
                    {p.name}{p.area ? ` (${p.area})` : ''}
                  </Text>
                </View>
                <Text style={styles.componentAmount}>₹ {parseFloat(p.amount || 0).toFixed(0)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.tableDataRow}>
              <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ marginRight: 6 }}>🏥</Text>
                <Text style={[styles.componentName, { color: '#9ca3af', fontStyle: 'italic' }]}>Procedures / Services</Text>
              </View>
              <Text style={[styles.componentAmount, { color: '#9ca3af' }]}>₹ 0</Text>
            </View>
          )}

          {/* 3. Medicines / Pharmacy */}
          {meds.length > 0 ? (
            meds.map((m, mIdx) => (
              <View key={mIdx} style={styles.tableDataRow}>
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ marginRight: 6 }}>💊</Text>
                  <Text style={[styles.componentName, { color: '#0369a1' }]}>{m.details}</Text>
                </View>
                <Text style={styles.componentAmount}>₹ {parseFloat(m.amount || 0).toFixed(0)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.tableDataRow}>
              <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ marginRight: 6 }}>💊</Text>
                <Text style={[styles.componentName, { color: '#9ca3af', fontStyle: 'italic' }]}>Pharmacy Medicines</Text>
              </View>
              <Text style={[styles.componentAmount, { color: '#9ca3af' }]}>₹ 0</Text>
            </View>
          )}
        </View>

        {/* FOOTER: TOTAL & PAID STATUS */}
        <View style={styles.cardFooter}>
          <View style={{ flex: 1 }}>
            <Text style={styles.payStatusText}>
              ✓ Paid: <Text style={{ fontWeight: 'bold', color: '#15803d' }}>{payModes}</Text>
            </Text>
          </View>
          <View style={styles.grandTotalBox}>
            <Text style={styles.grandTotalLabel}>TOTAL BILLED</Text>
            <Text style={styles.grandTotalVal}>₹ {grandTotal.toFixed(0)}</Text>
          </View>
        </View>

        {/* PAYMENT EDIT BUTTON FOR PHARMACY / VISIT */}
        {item.visit_id ? (
          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#eff6ff',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#bfdbfe'
              }}
              onPress={() => {
                setCorrectingVisitId(item.visit_id);
                setCorrectionModalVisible(true);
              }}
            >
              <Ionicons name="create-outline" size={13} color="#1d4ed8" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>
                Edit Payment Mode (Cash ↔ UPI)
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* TAP HINT */}
        <View style={styles.tapHintRow}>
          <Text style={styles.tapHintText}>Tap to open patient medical profile & history ›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Today's Patients & Visits</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* METRICS SUMMARY TAPE */}
      <View style={styles.metricsTape}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 12, alignItems: 'center' }}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricBlockLabel}>VISITED PATIENTS</Text>
            <Text style={[styles.metricBlockVal, { color: '#5C0B0B' }]}>{totalPatientsCount}</Text>
          </View>

          <View style={styles.metricBlockDivider} />

          <View style={styles.metricBlock}>
            <Text style={styles.metricBlockLabel}>CONSULTATION FEES</Text>
            <Text style={[styles.metricBlockVal, { color: '#15803d' }]}>₹ {totalConsultationFees.toFixed(0)}</Text>
          </View>

          <View style={styles.metricBlockDivider} />

          <View style={styles.metricBlock}>
            <Text style={styles.metricBlockLabel}>PROCEDURES TOTAL</Text>
            <Text style={[styles.metricBlockVal, { color: '#7c3aed' }]}>₹ {totalProcedureRevenue.toFixed(0)}</Text>
          </View>

          <View style={styles.metricBlockDivider} />

          <View style={styles.metricBlock}>
            <Text style={styles.metricBlockLabel}>PHARMACY TOTAL</Text>
            <Text style={[styles.metricBlockVal, { color: '#0284c7' }]}>₹ {totalPharmacyRevenue.toFixed(0)}</Text>
          </View>

          <View style={styles.metricBlockDivider} />

          <View style={styles.metricBlock}>
            <Text style={styles.metricBlockLabel}>GRAND BILLED TOTAL</Text>
            <Text style={[styles.metricBlockVal, { color: '#b91c1c' }]}>₹ {totalGrandBilled.toFixed(0)}</Text>
          </View>

          <View style={styles.metricBlockDivider} />

          <View style={styles.metricBlock}>
            <Text style={styles.metricBlockLabel}>TOTAL COLLECTED</Text>
            <Text style={[styles.metricBlockVal, { color: '#166534' }]}>₹ {totalCollectedPaid.toFixed(0)}</Text>
          </View>
        </ScrollView>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color="#6b7280" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, S-number, phone, procedure..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* LIST CONTENT */}
      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filteredVisits}
          keyExtractor={(item) => item.visit_id.toString()}
          renderItem={renderVisitCard}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🩺</Text>
              <Text style={styles.emptyTitle}>No Patient Visits Recorded Today</Text>
              <Text style={styles.emptySub}>
                Patients visiting the clinic today for consultation, procedures, or pharmacy will automatically appear in this table.
              </Text>
            </View>
          }
        />
      )}

      <PharmacyCorrectionModal
        visible={correctionModalVisible}
        visitId={correctingVisitId}
        onClose={() => setCorrectionModalVisible(false)}
        onUpdated={fetchTodayVisits}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: '#5C0B0B', 
    padding: 20, 
    paddingTop: 50 
  },
  backBtn: { padding: 4 },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refreshBtn: { padding: 4 },
  metricsTape: {
    backgroundColor: '#fff',
    elevation: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0'
  },
  metricBlock: { alignItems: 'center', minWidth: 100, paddingHorizontal: 8 },
  metricBlockLabel: { fontSize: 10, fontWeight: 'bold', color: '#64748b', letterSpacing: 0.5 },
  metricBlockVal: { fontSize: 16, fontWeight: 'bold', marginTop: 3 },
  metricBlockDivider: { width: 1, height: 26, backgroundColor: '#e2e8f0', marginHorizontal: 4 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  patientMeta: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  sNumBadge: { backgroundColor: '#5C0B0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  sNumText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  patientName: { fontSize: 16, fontWeight: 'bold', color: '#0f172a' },
  patientMobile: { fontSize: 12, color: '#64748b', marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: 'bold' },
  timeText: { fontSize: 11, color: '#64748b', marginTop: 3 },
  cardDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },
  tableContainer: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 5, marginBottom: 5 },
  tableColHeader: { fontSize: 11, fontWeight: 'bold', color: '#64748b', letterSpacing: 0.5 },
  tableDataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  componentName: { fontSize: 13, color: '#334155', fontWeight: '500' },
  componentAmount: { fontSize: 13, fontWeight: 'bold', color: '#1e293b', textAlign: 'right' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9'
  },
  payStatusText: { fontSize: 12, color: '#475569' },
  grandTotalBox: { alignItems: 'flex-end' },
  grandTotalLabel: { fontSize: 9, fontWeight: 'bold', color: '#64748b' },
  grandTotalVal: { fontSize: 17, fontWeight: 'bold', color: '#5C0B0B' },
  tapHintRow: { marginTop: 6, alignItems: 'center' },
  tapHintText: { fontSize: 11, color: '#3b82f6', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 30 },
  emptyIcon: { fontSize: 50, marginBottom: 15 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 18 }
});
