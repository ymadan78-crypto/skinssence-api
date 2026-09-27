import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import PendingFollowupReminderModal from '../components/PendingFollowupReminderModal';

export default function DoctorReportsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState('overview'); // 'overview', 'procedures', 'medicines', 'clinic_use'
  const [reportData, setReportData] = useState(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [procSubTab, setProcSubTab] = useState('sessions'); // 'sessions', 'revenue', 'daily'
  const [medSubTab, setMedSubTab] = useState('qty'); // 'qty', 'revenue', 'history'
  const [followupModalVisible, setFollowupModalVisible] = useState(false);

  const API_URL = 'https://skinssence-api.onrender.com/api/admin/reports';

  useEffect(() => {
    fetchReports();
  }, []);

  const transformToHalfCollection = (data) => {
    if (!data) return data;
    const halve = (n) => (typeof n === 'number' && !isNaN(n) ? n / 2 : (parseFloat(n) || 0) / 2);

    const today = data.today ? {
      ...data.today,
      totalClinicSale: halve(data.today.totalClinicSale),
      consultationRevenue: halve(data.today.consultationRevenue),
      procedureRevenue: halve(data.today.procedureRevenue),
      medicineRevenue: halve(data.today.medicineRevenue),
      packageRedemptionValue: halve(data.today.packageRedemptionValue)
    } : data.today;

    const transformMonth = (m) => {
      if (!m) return m;
      const procedureRevenue = halve(m.procedureRevenue);
      const medicineRevenue = halve(m.medicineRevenue);
      const consultationRevenue = halve(m.consultationRevenue || 0);
      const totalSale = halve(m.totalSale !== undefined ? m.totalSale : (m.procedureRevenue + m.medicineRevenue));
      const totalClinicSale = halve(m.totalClinicSale !== undefined ? m.totalClinicSale : totalSale);
      const avgMedicineSale = halve(m.avgMedicineSale);

      const topProceduresBySessions = (m.topProceduresBySessions || []).map(p => ({
        ...p,
        revenue: halve(p.revenue),
        avgRevenuePerSession: halve(p.avgRevenuePerSession)
      }));

      const topProceduresByRevenue = (m.topProceduresByRevenue || []).map(p => ({
        ...p,
        revenue: halve(p.revenue),
        avgRevenuePerSession: halve(p.avgRevenuePerSession)
      }));

      const topMedicinesByQty = (m.topMedicinesByQty || []).map(item => ({
        ...item,
        revenue: halve(item.revenue)
      }));

      const topMedicinesByRevenue = (m.topMedicinesByRevenue || []).map(item => ({
        ...item,
        revenue: halve(item.revenue)
      }));

      const dailySalesList = (m.dailySalesList || []).map(d => ({
        ...d,
        consultationSale: halve(d.consultationSale),
        procedureSale: halve(d.procedureSale),
        medicineSale: halve(d.medicineSale),
        totalSale: halve(d.totalSale)
      }));

      return {
        ...m,
        procedureRevenue,
        medicineRevenue,
        consultationRevenue,
        totalSale,
        totalClinicSale,
        avgMedicineSale,
        topProceduresBySessions,
        topProceduresByRevenue,
        topMedicinesByQty,
        topMedicinesByRevenue,
        dailySalesList
      };
    };

    const currentMonth = transformMonth(data.currentMonth);
    const previousMonth = transformMonth(data.previousMonth);
    const monthWiseSales = (data.monthWiseSales || []).map(transformMonth);

    const calcChange = (curr, prev) => {
      const diff = curr - prev;
      const pct = prev > 0 ? ((diff / prev) * 100).toFixed(1) : 'N/A';
      return { diff, pct };
    };

    const comparison = {
      ...(data.comparison || {}),
      totalSale: {
        curr: currentMonth?.totalClinicSale || 0,
        prev: previousMonth?.totalClinicSale || 0,
        ...calcChange(currentMonth?.totalClinicSale || 0, previousMonth?.totalClinicSale || 0)
      },
      procedureRevenue: {
        curr: currentMonth?.procedureRevenue || 0,
        prev: previousMonth?.procedureRevenue || 0,
        ...calcChange(currentMonth?.procedureRevenue || 0, previousMonth?.procedureRevenue || 0)
      },
      medicineRevenue: {
        curr: currentMonth?.medicineRevenue || 0,
        prev: previousMonth?.medicineRevenue || 0,
        ...calcChange(currentMonth?.medicineRevenue || 0, previousMonth?.medicineRevenue || 0)
      }
    };

    return {
      ...data,
      today,
      currentMonth,
      previousMonth,
      monthWiseSales,
      comparison
    };
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const processed = transformToHalfCollection(response.data);
      setReportData(processed);
      if (processed && processed.currentMonth) {
        setSelectedMonthKey(processed.currentMonth.monthKey);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch collection and turnover analytics.');
    } finally {
      setLoading(false);
    }
  };

  const selectedMonthData = (reportData?.monthWiseSales || []).find(m => m.monthKey === selectedMonthKey) || reportData?.currentMonth || {
    monthKey: '',
    monthLabel: 'Selected Month',
    procedureRevenue: 0,
    procedureSessions: 0,
    totalPatients: 0,
    newPatients: 0,
    returningPatients: 0,
    medicineRevenue: 0,
    medicineTransactions: 0,
    medicineUnitsSold: 0,
    totalSale: 0,
    topProceduresBySessions: [],
    topProceduresByRevenue: [],
    topMedicinesByQty: [],
    topMedicinesByRevenue: [],
    dailySalesList: []
  };

  const renderComparisonRow = (label, compObj, isCurrency = true) => {
    const isPositive = compObj.diff >= 0;
    const diffDisplay = isCurrency 
      ? `${isPositive ? '+' : ''}₹${Math.abs(compObj.diff).toFixed(2)}`
      : `${isPositive ? '+' : ''}${compObj.diff}`;
    const pctDisplay = compObj.pct === 'N/A' ? 'N/A' : `${isPositive ? '+' : ''}${compObj.pct}%`;
    const color = isPositive ? '#16a34a' : '#dc2626';

    return (
      <View style={styles.compRow}>
        <Text style={styles.compLabel}>{label}</Text>
        <View style={styles.compValues}>
          <Text style={styles.compCurr}>
            {isCurrency ? `₹${compObj.curr.toFixed(0)}` : compObj.curr}
          </Text>
          <Text style={styles.compPrev}>
            (Prev: {isCurrency ? `₹${compObj.prev.toFixed(0)}` : compObj.prev})
          </Text>
          <View style={[styles.compBadge, { backgroundColor: isPositive ? '#dcfce7' : '#fee2e2' }]}>
            <Text style={[styles.compBadgeText, { color }]}>
              {pctDisplay}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clinic Collection & Turnover</Text>
        <TouchableOpacity onPress={fetchReports} style={styles.refreshBtn}>
          <Ionicons name="reload" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* MAIN TOP TABS */}
      <View style={styles.mainTabWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mainTabScrollContent}>
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'overview' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('overview')}>
            <Text style={activeMainTab === 'overview' ? styles.activeMainTabText : styles.mainTabText}>
              📊 Collection / Turnover
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'patients' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('patients')}>
            <Text style={activeMainTab === 'patients' ? styles.activeMainTabText : styles.mainTabText}>
              👥 Patients / Footfall
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'procedures' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('procedures')}>
            <Text style={activeMainTab === 'procedures' ? styles.activeMainTabText : styles.mainTabText}>
              🏥 Procedures
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'medicines' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('medicines')}>
            <Text style={activeMainTab === 'medicines' ? styles.activeMainTabText : styles.mainTabText}>
              💊 Pharmacy
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, activeMainTab === 'clinic_use' && styles.activeMainTab]}
            onPress={() => setActiveMainTab('clinic_use')}>
            <Text style={activeMainTab === 'clinic_use' ? styles.activeMainTabText : styles.mainTabText}>
              🧪 Clinic Use
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {loading || !reportData ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 50 }}>
          
          {/* ============================================================
              TAB 1: OVERVIEW & TOTAL CLINIC SALES
             ============================================================ */}
          {activeMainTab === 'overview' && (
            <>
              {/* 1. TODAY's COLLECTION CARD */}
              <View style={[styles.card, styles.todayCard]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>TODAY'S TOTAL CLINIC COLLECTION</Text>
                  <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● LIVE</Text></View>
                </View>

                <Text style={styles.grandTotalHero}>
                  ₹ {reportData.today.totalClinicSale.toFixed(2)}
                </Text>

                <View style={styles.breakdownGrid}>
                  <View style={[styles.breakdownBox, { backgroundColor: '#fef3c7', borderColor: '#fde68a', marginBottom: 8, width: '100%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#92400e' }]}>🩺 Consultation Collection</Text>
                    <Text style={[styles.breakdownValue, { color: '#78350f' }]}>₹ {(reportData.today.consultationRevenue || 0).toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.consultationCount || 0} consultations recorded</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', width: '48%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#1e40af' }]}>🏥 Procedure Collection</Text>
                    <Text style={[styles.breakdownValue, { color: '#1e3a8a' }]}>₹ {reportData.today.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.procedureSessions} sessions recorded</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', width: '48%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#15803d' }]}>💊 Medicine Collection</Text>
                    <Text style={[styles.breakdownValue, { color: '#14532d' }]}>₹ {reportData.today.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.medicineTransactions} bills ({reportData.today.medicineUnitsSold} units)</Text>
                  </View>

                  {/* TODAY'S PATIENT FOOTFALL */}
                  <View style={[styles.breakdownBox, { backgroundColor: '#f0fdfa', borderColor: '#99f6e4', marginTop: 8, width: '100%' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.breakdownLabel, { color: '#0f766e', fontWeight: 'bold' }]}>👥 TODAY'S PATIENT FOOTFALL</Text>
                      <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#134e4a' }}>
                        {reportData.today.totalPatients || 0} Total Patients
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#ccfbf1' }}>
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#059669' }}>
                        🌟 {reportData.today.newPatients || 0} New (First Time)
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#0f766e' }}>
                        🔄 {reportData.today.returningPatients || 0} Returning
                      </Text>
                    </View>

                    {/* FOLLOW-UP PENDING INDICATOR */}
                    <TouchableOpacity 
                      style={{ 
                        flexDirection: 'row', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginTop: 6, 
                        paddingTop: 6, 
                        borderTopWidth: 1, 
                        borderTopColor: '#ccfbf1' 
                      }}
                      onPress={() => setFollowupModalVisible(true)}>
                      <Text style={{ fontSize: 12, fontWeight: 'bold', color: (reportData.today.pendingFollowupsCount || 0) > 0 ? '#b91c1c' : '#047857' }}>
                        📅 Follow-up appointments pending: {reportData.today.pendingFollowupsCount || 0}
                      </Text>
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: (reportData.today.pendingFollowupsCount || 0) > 0 ? '#dc2626' : '#059669' }}>
                        {(reportData.today.pendingFollowupsCount || 0) > 0 ? 'Review & Book ›' : '✓ All Booked'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* 2. CURRENT MONTH CARD */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>CURRENT MONTH — {reportData.currentMonth.monthLabel.toUpperCase()}</Text>
                
                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Total Clinic Collection:</Text>
                  <Text style={styles.heroValue}>₹ {reportData.currentMonth.totalClinicSale.toFixed(2)}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Procedure Collection</Text>
                    <Text style={styles.statValue}>₹ {reportData.currentMonth.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.currentMonth.procedureSessions} sessions</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Medicine Collection</Text>
                    <Text style={styles.statValue}>₹ {reportData.currentMonth.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.currentMonth.medicineTransactions} bills ({reportData.currentMonth.medicineUnitsSold} units)</Text>
                  </View>
                </View>

                {/* CURRENT MONTH PATIENT FOOTFALL */}
                <View style={{ backgroundColor: '#f0fdfa', borderRadius: 8, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#ccfbf1' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0f766e', textTransform: 'uppercase' }}>
                      👥 Monthly Patient Footfall
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#134e4a' }}>
                      {reportData.currentMonth.totalPatients || 0} Patients
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#ccfbf1' }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#059669' }}>
                      🌟 {reportData.currentMonth.newPatients || 0} New (First Time)
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#0f766e' }}>
                      🔄 {reportData.currentMonth.returningPatients || 0} Returning
                    </Text>
                  </View>
                </View>
              </View>

              {/* 3. PREVIOUS MONTH CARD */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>PREVIOUS MONTH — {reportData.previousMonth.monthLabel.toUpperCase()}</Text>
                
                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Total Clinic Collection:</Text>
                  <Text style={[styles.heroValue, { color: '#4b5563' }]}>₹ {reportData.previousMonth.totalClinicSale.toFixed(2)}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Procedure Collection</Text>
                    <Text style={styles.statValue}>₹ {reportData.previousMonth.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.previousMonth.procedureSessions} sessions</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Medicine Collection</Text>
                    <Text style={styles.statValue}>₹ {reportData.previousMonth.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.previousMonth.medicineTransactions} bills ({reportData.previousMonth.medicineUnitsSold} units)</Text>
                  </View>
                </View>

                {/* PREVIOUS MONTH PATIENT FOOTFALL */}
                <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                      👥 Monthly Patient Footfall
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1e293b' }}>
                      {reportData.previousMonth.totalPatients || 0} Patients
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#059669' }}>
                      🌟 {reportData.previousMonth.newPatients || 0} New (First Time)
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#475569' }}>
                      🔄 {reportData.previousMonth.returningPatients || 0} Returning
                    </Text>
                  </View>
                </View>
              </View>

              {/* 4. MONTHLY COLLECTION COMPARISON */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>MONTHLY COLLECTION & TURNOVER COMPARISON</Text>
                <Text style={styles.cardSubtitle}>
                  {reportData.currentMonth.monthLabel} vs {reportData.previousMonth.monthLabel}
                </Text>

                {renderComparisonRow('Total Clinic Collection', reportData.comparison.totalSale, true)}
                {renderComparisonRow('Procedure Collection', reportData.comparison.procedureRevenue, true)}
                {renderComparisonRow('Medicine Collection', reportData.comparison.medicineRevenue, true)}
                {reportData.comparison?.totalPatients ? renderComparisonRow('Total Patients Visited', reportData.comparison.totalPatients, false) : null}
                {reportData.comparison?.newPatients ? renderComparisonRow('New (First-Time) Patients', reportData.comparison.newPatients, false) : null}
                {renderComparisonRow('Procedure Sessions', reportData.comparison.procedureSessions, false)}
                {renderComparisonRow('Medicine Transactions', reportData.comparison.medicineTransactions, false)}
              </View>

              {/* 5. HISTORICAL MONTH-WISE COLLECTION TABLE */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>MONTH-WISE TOTAL COLLECTION HISTORY</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ marginTop: 10 }}>
                  <View>
                    {/* TABLE HEADER */}
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.thCell, { width: 90 }]}>Month</Text>
                      <Text style={[styles.thCell, { width: 85, textAlign: 'center' }]}>Patients</Text>
                      <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>New</Text>
                      <Text style={[styles.thCell, { width: 105, textAlign: 'right' }]}>Procedure (₹)</Text>
                      <Text style={[styles.thCell, { width: 105, textAlign: 'right' }]}>Medicine (₹)</Text>
                      <Text style={[styles.thCell, { width: 105, textAlign: 'right' }]}>Total Coll. (₹)</Text>
                      <Text style={[styles.thCell, { width: 75, textAlign: 'center' }]}>Sessions</Text>
                      <Text style={[styles.thCell, { width: 75, textAlign: 'center' }]}>Med Bills</Text>
                    </View>

                    {/* TABLE BODY */}
                    {reportData.monthWiseSales.map((m, idx) => (
                      <View key={m.monthKey || idx} style={[styles.tableRow, idx % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                        <Text style={[styles.tdCell, { width: 90, fontWeight: 'bold' }]}>{m.monthLabel}</Text>
                        <Text style={[styles.tdCell, { width: 85, textAlign: 'center', fontWeight: 'bold', color: '#0f766e' }]}>{m.totalPatients || 0}</Text>
                        <Text style={[styles.tdCell, { width: 80, textAlign: 'center', fontWeight: 'bold', color: '#059669' }]}>+{m.newPatients || 0}</Text>
                        <Text style={[styles.tdCell, { width: 105, textAlign: 'right', color: '#1e40af' }]}>₹ {m.procedureRevenue.toFixed(0)}</Text>
                        <Text style={[styles.tdCell, { width: 105, textAlign: 'right', color: '#15803d' }]}>₹ {m.medicineRevenue.toFixed(0)}</Text>
                        <Text style={[styles.tdCell, { width: 105, textAlign: 'right', fontWeight: 'bold', color: '#5C0B0B' }]}>₹ {m.totalSale.toFixed(0)}</Text>
                        <Text style={[styles.tdCell, { width: 75, textAlign: 'center' }]}>{m.procedureSessions}</Text>
                        <Text style={[styles.tdCell, { width: 75, textAlign: 'center' }]}>{m.medicineTransactions}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </>
          )}

          {/* ============================================================
              TAB: 👥 PATIENTS & FOOTFALL TAB (DEDICATED TAB)
             ============================================================ */}
          {activeMainTab === 'patients' && (
            <>
              {/* MONTH SELECTOR */}
              <View style={styles.monthSelectorBar}>
                <Text style={styles.monthSelectorLabel}>Select Month:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {reportData.availableMonths.map(m => (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.monthChip, selectedMonthKey === m.key && styles.monthChipActive]}
                      onPress={() => setSelectedMonthKey(m.key)}>
                      <Text style={[styles.monthChipText, selectedMonthKey === m.key && styles.monthChipTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* MONTHLY PATIENT FOOTFALL HERO CARD */}
              <View style={[styles.card, { borderLeftColor: '#0f766e', borderLeftWidth: 5 }]}>
                <Text style={styles.cardTitle}>👥 PATIENT FOOTFALL — {selectedMonthData.monthLabel.toUpperCase()}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                  Monthly patient footfall, new client acquisition & repeat visit analytics
                </Text>

                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Total Patients Visited:</Text>
                  <Text style={[styles.heroValue, { color: '#0f766e', fontSize: 26 }]}>
                    {selectedMonthData.totalPatients || 0} Patients
                  </Text>
                </View>

                <View style={styles.divider} />

                {/* BREAKDOWN BOXES */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                  <View style={[styles.breakdownBox, { flex: 1, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#166534' }]}>🌟 New Patients</Text>
                    <Text style={[styles.breakdownValue, { color: '#15803d', fontSize: 24 }]}>
                      {selectedMonthData.newPatients || 0}
                    </Text>
                    <Text style={styles.breakdownSub}>
                      S-number created in {selectedMonthData.monthLabel}
                    </Text>
                  </View>

                  <View style={[styles.breakdownBox, { flex: 1, backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#1e40af' }]}>🔄 Returning Patients</Text>
                    <Text style={[styles.breakdownValue, { color: '#1d4ed8', fontSize: 24 }]}>
                      {selectedMonthData.returningPatients || 0}
                    </Text>
                    <Text style={styles.breakdownSub}>
                      Previously registered clients
                    </Text>
                  </View>
                </View>

                {selectedMonthData.totalRegistrations ? (
                  <View style={{ backgroundColor: '#f8fafc', padding: 8, borderRadius: 6, marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 11, color: '#475569', fontWeight: 'bold' }}>
                      📝 Total New S-Numbers Created:
                    </Text>
                    <Text style={{ fontSize: 13, color: '#0f766e', fontWeight: 'bold' }}>
                      {selectedMonthData.totalRegistrations} Registrations
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* TODAY'S LIVE FOOTFALL CARD */}
              <View style={[styles.card, { borderTopWidth: 4, borderTopColor: '#0d9488' }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardHeaderTitle, { color: '#0f766e' }]}>TODAY'S PATIENT FOOTFALL</Text>
                  <View style={[styles.liveBadge, { backgroundColor: '#ccfbf1' }]}>
                    <Text style={[styles.liveBadgeText, { color: '#0f766e' }]}>● LIVE</Text>
                  </View>
                </View>

                <Text style={[styles.grandTotalHero, { color: '#134e4a', fontSize: 28 }]}>
                  {reportData.today.totalPatients || 0} Patients Seen Today
                </Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f0fdfa', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ccfbf1', marginTop: 8 }}>
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#0f766e', fontWeight: 'bold' }}>🌟 NEW TODAY</Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#059669', marginTop: 2 }}>
                      {reportData.today.newPatients || 0}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#059669', marginTop: 1 }}>S-number created today</Text>
                  </View>
                  <View style={{ width: 1, height: '100%', backgroundColor: '#99f6e4' }} />
                  <View style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={{ fontSize: 11, color: '#0f766e', fontWeight: 'bold' }}>🔄 RETURNING TODAY</Text>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#0284c7', marginTop: 2 }}>
                      {reportData.today.returningPatients || 0}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#0284c7', marginTop: 1 }}>Registered previously</Text>
                  </View>
                </View>
              </View>

              {/* MONTHLY COMPARISON CARD */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📈 FOOTFALL COMPARISON (vs Previous Month)</Text>
                <Text style={styles.cardSubtitle}>
                  {reportData.currentMonth.monthLabel} vs {reportData.previousMonth.monthLabel}
                </Text>

                {reportData.comparison?.totalPatients ? renderComparisonRow('Total Patients Visited', reportData.comparison.totalPatients, false) : null}
                {reportData.comparison?.newPatients ? renderComparisonRow('New (First-Time) Patients', reportData.comparison.newPatients, false) : null}
              </View>

              {/* MONTH-WISE PATIENT FOOTFALL HISTORY TABLE */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>MONTH-WISE PATIENT FOOTFALL HISTORY</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ marginTop: 10 }}>
                  <View>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.thCell, { width: 95 }]}>Month</Text>
                      <Text style={[styles.thCell, { width: 95, textAlign: 'center' }]}>Total Patients</Text>
                      <Text style={[styles.thCell, { width: 95, textAlign: 'center' }]}>New (1st Time)</Text>
                      <Text style={[styles.thCell, { width: 95, textAlign: 'center' }]}>Returning</Text>
                      <Text style={[styles.thCell, { width: 85, textAlign: 'center' }]}>% New</Text>
                    </View>

                    {reportData.monthWiseSales.map((m, idx) => {
                      const tot = m.totalPatients || 0;
                      const nw = m.newPatients || 0;
                      const ret = m.returningPatients || 0;
                      const pctNew = tot > 0 ? ((nw / tot) * 100).toFixed(0) + '%' : '0%';

                      return (
                        <View key={m.monthKey || idx} style={[styles.tableRow, idx % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                          <Text style={[styles.tdCell, { width: 95, fontWeight: 'bold' }]}>{m.monthLabel}</Text>
                          <Text style={[styles.tdCell, { width: 95, textAlign: 'center', fontWeight: 'bold', color: '#0f766e' }]}>{tot}</Text>
                          <Text style={[styles.tdCell, { width: 95, textAlign: 'center', fontWeight: 'bold', color: '#059669' }]}>🌟 {nw}</Text>
                          <Text style={[styles.tdCell, { width: 95, textAlign: 'center', fontWeight: 'bold', color: '#0284c7' }]}>🔄 {ret}</Text>
                          <Text style={[styles.tdCell, { width: 85, textAlign: 'center', fontWeight: 'bold', color: '#4b5563' }]}>{pctNew}</Text>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            </>
          )}

          {/* ============================================================
              TAB 2: PROCEDURE PERFORMANCE
             ============================================================ */}
          {activeMainTab === 'procedures' && (
            <>
              {/* MONTH SELECTOR */}
              <View style={styles.monthSelectorBar}>
                <Text style={styles.monthSelectorLabel}>Select Month:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {reportData.availableMonths.map(m => (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.monthChip, selectedMonthKey === m.key && styles.monthChipActive]}
                      onPress={() => setSelectedMonthKey(m.key)}>
                      <Text style={[styles.monthChipText, selectedMonthKey === m.key && styles.monthChipTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* PROCEDURE SUMMARY FOR SELECTED MONTH */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>PROCEDURES & FOOTFALL — {selectedMonthData.monthLabel.toUpperCase()}</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Total Procedure Collection</Text>
                    <Text style={[styles.statValue, { color: '#1e40af' }]}>₹ {selectedMonthData.procedureRevenue.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Total Sessions</Text>
                    <Text style={styles.statValue}>{selectedMonthData.procedureSessions}</Text>
                  </View>
                </View>
                <View style={{ backgroundColor: '#f0fdfa', borderRadius: 6, padding: 8, marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ccfbf1' }}>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#0f766e' }}>
                    👥 {selectedMonthData.totalPatients || 0} Total Patients Visited
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#059669' }}>
                    🌟 {selectedMonthData.newPatients || 0} New • 🔄 {selectedMonthData.returningPatients || 0} Returning
                  </Text>
                </View>
              </View>

              {/* SUB TABS FOR PROCEDURES */}
              <View style={styles.subTabContainer}>
                <TouchableOpacity
                  style={[styles.subTab, procSubTab === 'sessions' && styles.subTabActive]}
                  onPress={() => setProcSubTab('sessions')}>
                  <Text style={[styles.subTabText, procSubTab === 'sessions' && styles.subTabTextActive]}>
                    🏆 By Sessions
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subTab, procSubTab === 'revenue' && styles.subTabActive]}
                  onPress={() => setProcSubTab('revenue')}>
                  <Text style={[styles.subTabText, procSubTab === 'revenue' && styles.subTabTextActive]}>
                    💰 By Collection
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subTab, procSubTab === 'daily' && styles.subTabActive]}
                  onPress={() => setProcSubTab('daily')}>
                  <Text style={[styles.subTabText, procSubTab === 'daily' && styles.subTabTextActive]}>
                    📅 Daily Breakdown
                  </Text>
                </TouchableOpacity>
              </View>

              {/* RANKING A: BY SESSIONS */}
              {procSubTab === 'sessions' && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>TOP PROCEDURES BY SESSIONS ({selectedMonthData.monthLabel})</Text>
                  {(!selectedMonthData.topProceduresBySessions || selectedMonthData.topProceduresBySessions.length === 0) ? (
                    <Text style={styles.emptyText}>No procedure sales recorded for this period.</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: 45, textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { flex: 1 }]}>Procedure Name</Text>
                        <Text style={[styles.thCell, { width: 70, textAlign: 'center' }]}>Sessions</Text>
                        <Text style={[styles.thCell, { width: 90, textAlign: 'right' }]}>Collection</Text>
                        <Text style={[styles.thCell, { width: 90, textAlign: 'right' }]}>Avg/Sess</Text>
                      </View>
                      {selectedMonthData.topProceduresBySessions.map((p) => (
                        <View key={p.name} style={styles.tableRow}>
                          <Text style={[styles.tdCell, { width: 45, textAlign: 'center', fontWeight: 'bold' }]}>{p.rank}</Text>
                          <Text style={[styles.tdCell, { flex: 1, fontWeight: '600' }]}>{p.name}</Text>
                          <Text style={[styles.tdCell, { width: 70, textAlign: 'center', fontWeight: 'bold', color: '#1e40af' }]}>{p.sessions}</Text>
                          <Text style={[styles.tdCell, { width: 90, textAlign: 'right', fontWeight: 'bold', color: '#5C0B0B' }]}>₹ {p.revenue.toFixed(0)}</Text>
                          <Text style={[styles.tdCell, { width: 90, textAlign: 'right', color: '#6b7280' }]}>₹ {p.avgRevenuePerSession.toFixed(0)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* RANKING B: BY REVENUE */}
              {procSubTab === 'revenue' && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>TOP PROCEDURES BY COLLECTION ({selectedMonthData.monthLabel})</Text>
                  {(!selectedMonthData.topProceduresByRevenue || selectedMonthData.topProceduresByRevenue.length === 0) ? (
                    <Text style={styles.emptyText}>No procedure sales recorded for this period.</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: 45, textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { flex: 1 }]}>Procedure Name</Text>
                        <Text style={[styles.thCell, { width: 95, textAlign: 'right' }]}>Collection</Text>
                        <Text style={[styles.thCell, { width: 70, textAlign: 'center' }]}>Sessions</Text>
                        <Text style={[styles.thCell, { width: 90, textAlign: 'right' }]}>Avg/Sess</Text>
                      </View>
                      {selectedMonthData.topProceduresByRevenue.map((p) => (
                        <View key={p.name} style={styles.tableRow}>
                          <Text style={[styles.tdCell, { width: 45, textAlign: 'center', fontWeight: 'bold' }]}>{p.rank}</Text>
                          <Text style={[styles.tdCell, { flex: 1, fontWeight: '600' }]}>{p.name}</Text>
                          <Text style={[styles.tdCell, { width: 95, textAlign: 'right', fontWeight: 'bold', color: '#5C0B0B' }]}>₹ {p.revenue.toFixed(0)}</Text>
                          <Text style={[styles.tdCell, { width: 70, textAlign: 'center', fontWeight: 'bold', color: '#1e40af' }]}>{p.sessions}</Text>
                          <Text style={[styles.tdCell, { width: 90, textAlign: 'right', color: '#6b7280' }]}>₹ {p.avgRevenuePerSession.toFixed(0)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* DAILY SALES BREAKDOWN */}
              {procSubTab === 'daily' && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>DAILY COLLECTION IN {selectedMonthData.monthLabel.toUpperCase()}</Text>
                  {(!selectedMonthData.dailySalesList || selectedMonthData.dailySalesList.length === 0) ? (
                    <Text style={styles.emptyText}>No daily sales recorded for this period.</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: 80 }]}>Date</Text>
                        <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Procedure (₹)</Text>
                        <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Medicine (₹)</Text>
                        <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Total (₹)</Text>
                      </View>
                      {selectedMonthData.dailySalesList.map((dItem) => (
                        <View key={dItem.date} style={styles.tableRow}>
                          <Text style={[styles.tdCell, { width: 80, fontWeight: 'bold' }]}>{dItem.dateLabel}</Text>
                          <Text style={[styles.tdCell, { flex: 1, textAlign: 'right', color: '#1e40af' }]}>₹ {dItem.procedureSale.toFixed(0)}</Text>
                          <Text style={[styles.tdCell, { flex: 1, textAlign: 'right', color: '#15803d' }]}>₹ {dItem.medicineSale.toFixed(0)}</Text>
                          <Text style={[styles.tdCell, { flex: 1, textAlign: 'right', fontWeight: 'bold', color: '#5C0B0B' }]}>₹ {dItem.totalSale.toFixed(0)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </>
          )}

          {/* ============================================================
              TAB 3: MEDICINE SALES & TOP ITEMS
             ============================================================ */}
          {activeMainTab === 'medicines' && (
            <>
              {/* MEDICINE DAILY & MONTHLY OVERVIEW */}
              <View style={[styles.card, { borderLeftColor: '#15803d', borderLeftWidth: 5 }]}>
                <Text style={styles.cardTitle}>💊 PHARMACY & MEDICINE COLLECTION OVERVIEW</Text>
                
                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Today's Medicine Collection:</Text>
                  <Text style={[styles.heroValue, { color: '#15803d' }]}>₹ {reportData.today.medicineRevenue.toFixed(2)}</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
                  {reportData.today.medicineTransactions} transactions • {reportData.today.medicineUnitsSold} units sold today
                </Text>

                <View style={styles.divider} />

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>{reportData.currentMonth.monthLabel} (Current)</Text>
                    <Text style={[styles.statValue, { color: '#15803d' }]}>₹ {reportData.currentMonth.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.currentMonth.medicineUnitsSold} units • Avg ₹{reportData.currentMonth.avgMedicineSale.toFixed(0)}/bill</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>{reportData.previousMonth.monthLabel} (Previous)</Text>
                    <Text style={styles.statValue}>₹ {reportData.previousMonth.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.previousMonth.medicineUnitsSold} units • Avg ₹{reportData.previousMonth.avgMedicineSale.toFixed(0)}/bill</Text>
                  </View>
                </View>
              </View>

              {/* MONTH SELECTOR FOR MEDICINE RANKINGS */}
              <View style={styles.monthSelectorBar}>
                <Text style={styles.monthSelectorLabel}>Select Month for Rankings:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {reportData.availableMonths.map(m => (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.monthChip, selectedMonthKey === m.key && styles.monthChipActive]}
                      onPress={() => setSelectedMonthKey(m.key)}>
                      <Text style={[styles.monthChipText, selectedMonthKey === m.key && styles.monthChipTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* MEDICINE SUB TABS */}
              <View style={styles.subTabContainer}>
                <TouchableOpacity
                  style={[styles.subTab, medSubTab === 'qty' && styles.subTabActive]}
                  onPress={() => setMedSubTab('qty')}>
                  <Text style={[styles.subTabText, medSubTab === 'qty' && styles.subTabTextActive]}>
                    📦 Top by Quantity
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subTab, medSubTab === 'revenue' && styles.subTabActive]}
                  onPress={() => setMedSubTab('revenue')}>
                  <Text style={[styles.subTabText, medSubTab === 'revenue' && styles.subTabTextActive]}>
                    💰 Top by Collection
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.subTab, medSubTab === 'history' && styles.subTabActive]}
                  onPress={() => setMedSubTab('history')}>
                  <Text style={[styles.subTabText, medSubTab === 'history' && styles.subTabTextActive]}>
                    📈 Month-wise Table
                  </Text>
                </TouchableOpacity>
              </View>

              {/* RANKING A: BY QUANTITY */}
              {medSubTab === 'qty' && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>TOP MEDICINES BY QUANTITY SOLD ({selectedMonthData.monthLabel})</Text>
                  {(!selectedMonthData.topMedicinesByQty || selectedMonthData.topMedicinesByQty.length === 0) ? (
                    <Text style={styles.emptyText}>No medicine sales recorded for this period.</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: 45, textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { flex: 1 }]}>Medicine Name</Text>
                        <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>Units Sold</Text>
                        <Text style={[styles.thCell, { width: 95, textAlign: 'right' }]}>Collection</Text>
                      </View>
                      {selectedMonthData.topMedicinesByQty.map((m) => (
                        <View key={m.name} style={styles.tableRow}>
                          <Text style={[styles.tdCell, { width: 45, textAlign: 'center', fontWeight: 'bold' }]}>{m.rank}</Text>
                          <Text style={[styles.tdCell, { flex: 1, fontWeight: '600' }]}>{m.name}</Text>
                          <Text style={[styles.tdCell, { width: 80, textAlign: 'center', fontWeight: 'bold', color: '#15803d' }]}>{m.unitsSold}</Text>
                          <Text style={[styles.tdCell, { width: 95, textAlign: 'right', fontWeight: 'bold', color: '#5C0B0B' }]}>₹ {m.revenue.toFixed(0)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* RANKING B: BY REVENUE */}
              {medSubTab === 'revenue' && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>TOP MEDICINES BY COLLECTION ({selectedMonthData.monthLabel})</Text>
                  {(!selectedMonthData.topMedicinesByRevenue || selectedMonthData.topMedicinesByRevenue.length === 0) ? (
                    <Text style={styles.emptyText}>No medicine sales recorded for this period.</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: 45, textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { flex: 1 }]}>Medicine Name</Text>
                        <Text style={[styles.thCell, { width: 95, textAlign: 'right' }]}>Collection</Text>
                        <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>Units Sold</Text>
                      </View>
                      {selectedMonthData.topMedicinesByRevenue.map((m) => (
                        <View key={m.name} style={styles.tableRow}>
                          <Text style={[styles.tdCell, { width: 45, textAlign: 'center', fontWeight: 'bold' }]}>{m.rank}</Text>
                          <Text style={[styles.tdCell, { flex: 1, fontWeight: '600' }]}>{m.name}</Text>
                          <Text style={[styles.tdCell, { width: 95, textAlign: 'right', fontWeight: 'bold', color: '#5C0B0B' }]}>₹ {m.revenue.toFixed(0)}</Text>
                          <Text style={[styles.tdCell, { width: 80, textAlign: 'center', fontWeight: 'bold', color: '#15803d' }]}>{m.unitsSold}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* HISTORICAL MEDICINE SALES TABLE */}
              {medSubTab === 'history' && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>MONTH-WISE MEDICINE COLLECTION TABLE</Text>
                  <View style={{ marginTop: 10 }}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.thCell, { width: 90 }]}>Month</Text>
                      <Text style={[styles.thCell, { flex: 1, textAlign: 'center' }]}>Bills / Txns</Text>
                      <Text style={[styles.thCell, { flex: 1, textAlign: 'center' }]}>Units Sold</Text>
                      <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Collection (₹)</Text>
                    </View>
                    {reportData.monthWiseSales.map((m, idx) => (
                      <View key={m.monthKey || idx} style={[styles.tableRow, idx % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                        <Text style={[styles.tdCell, { width: 90, fontWeight: 'bold' }]}>{m.monthLabel}</Text>
                        <Text style={[styles.tdCell, { flex: 1, textAlign: 'center' }]}>{m.medicineTransactions}</Text>
                        <Text style={[styles.tdCell, { flex: 1, textAlign: 'center' }]}>{m.medicineUnitsSold}</Text>
                        <Text style={[styles.tdCell, { flex: 1, textAlign: 'right', fontWeight: 'bold', color: '#15803d' }]}>₹ {m.medicineRevenue.toFixed(0)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {/* ============================================================
              TAB 4: 🧪 CLINIC / IN-HOUSE CONSUMPTION TAB
             ============================================================ */}
          {activeMainTab === 'clinic_use' && (
            <>
              {/* MONTH SELECTOR */}
              <View style={styles.monthSelectorBar}>
                <Text style={styles.monthSelectorLabel}>Select Month:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {reportData.availableMonths.map(m => (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.monthChip, selectedMonthKey === m.key && styles.monthChipActive]}
                      onPress={() => setSelectedMonthKey(m.key)}>
                      <Text style={[styles.monthChipText, selectedMonthKey === m.key && styles.monthChipTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* MONTHLY SUMMARY CARD */}
              <View style={[styles.card, { borderLeftColor: '#6d28d9', borderLeftWidth: 5 }]}>
                <Text style={styles.cardTitle}>🧪 IN-HOUSE CLINIC CONSUMPTION — {selectedMonthData.monthLabel.toUpperCase()}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                  Items used from pharmacy stock for clinic procedures & in-house treatments (Non-sale)
                </Text>

                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Total Consumed Value:</Text>
                  <Text style={[styles.heroValue, { color: '#6d28d9' }]}>
                    ₹ {(selectedMonthData.clinicUseAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Total Units Used</Text>
                    <Text style={[styles.statValue, { color: '#6d28d9' }]}>
                      {selectedMonthData.clinicUseQty || 0} units
                    </Text>
                    <Text style={styles.statSub}>Consumables & injectables</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Consumption Events</Text>
                    <Text style={[styles.statValue, { color: '#1e293b' }]}>
                      {selectedMonthData.clinicUseList?.length || 0}
                    </Text>
                    <Text style={styles.statSub}>Logged records</Text>
                  </View>
                </View>
              </View>

              {/* ITEM CONSUMPTION DETAILS LIST */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  CONSUMPTION DETAILS ({selectedMonthData.monthLabel})
                </Text>

                {(!selectedMonthData.clinicUseList || selectedMonthData.clinicUseList.length === 0) ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>🧪</Text>
                    <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', fontWeight: 'bold' }}>
                      No clinic consumption logged for {selectedMonthData.monthLabel}.
                    </Text>
                    <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 6, lineHeight: 16, paddingHorizontal: 10 }}>
                      When staff or doctors use medicines for treatments, go to Manage Stock ➔ select item ➔ tap "⚖️ Adjust Stock" ➔ choose "🏥 Clinic Use".
                    </Text>
                  </View>
                ) : (
                  selectedMonthData.clinicUseList.map((item, idx) => (
                    <View
                      key={item.id || idx}
                      style={{
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: '#f1f5f9',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1e293b' }}>
                          {item.medicine_name}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          📅 {item.date} {item.batch_number ? ('• Batch: ' + item.batch_number) : ''}
                        </Text>
                        {item.notes ? (
                          <Text style={{ fontSize: 11, color: '#6d28d9', fontStyle: 'italic', marginTop: 1 }}>
                            {item.notes}
                          </Text>
                        ) : null}
                        <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                          Logged by: {item.user_name || 'Doctor/Staff'}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#6d28d9' }}>
                          ₹ {Math.round(item.total_amount || 0).toLocaleString('en-IN')}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#dc2626' }}>
                          -{Math.abs(item.quantity)} units
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </>
          )}

        </ScrollView>
      )}

      <PendingFollowupReminderModal
        visible={followupModalVisible}
        onClose={() => setFollowupModalVisible(false)}
        navigation={navigation}
        onUpdated={fetchReports}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { padding: 4 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  refreshBtn: { padding: 4 },
  mainTabWrapper: { backgroundColor: '#fff', elevation: 2, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  mainTabScrollContent: { flexDirection: 'row', alignItems: 'center' },
  mainTabContainer: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  mainTab: { paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeMainTab: { borderBottomColor: '#5C0B0B' },
  mainTabText: { fontSize: 13, fontWeight: 'bold', color: '#6b7280' },
  activeMainTabText: { fontSize: 13, fontWeight: 'bold', color: '#5C0B0B' },
  scrollContent: { padding: 15 },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 10, elevation: 2, marginBottom: 15 },
  todayCard: { borderTopWidth: 4, borderTopColor: '#5C0B0B' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardHeaderTitle: { fontSize: 13, fontWeight: 'bold', color: '#5C0B0B', letterSpacing: 0.5 },
  liveBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  liveBadgeText: { color: '#b91c1c', fontSize: 10, fontWeight: 'bold' },
  grandTotalHero: { fontSize: 32, fontWeight: 'bold', color: '#111827', marginVertical: 8 },
  breakdownGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, gap: 10 },
  breakdownBox: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1 },
  breakdownLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  breakdownValue: { fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
  breakdownSub: { fontSize: 11, color: '#6b7280' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 6 },
  cardSubtitle: { fontSize: 12, color: '#6b7280', marginBottom: 12 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  heroLabel: { fontSize: 15, color: '#374151', fontWeight: '600' },
  heroValue: { fontSize: 22, fontWeight: 'bold', color: '#5C0B0B' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statCol: { flex: 1, alignItems: 'center' },
  statColDivider: { width: 1, height: 40, backgroundColor: '#e5e7eb' },
  statLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 4 },
  statValue: { fontSize: 17, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
  statSub: { fontSize: 11, color: '#9ca3af' },
  compRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  compLabel: { fontSize: 13, color: '#374151', fontWeight: '600', flex: 1 },
  compValues: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compCurr: { fontSize: 14, fontWeight: 'bold', color: '#111827' },
  compPrev: { fontSize: 11, color: '#9ca3af' },
  compBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  compBadgeText: { fontSize: 11, fontWeight: 'bold' },
  monthSelectorBar: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 12, elevation: 1 },
  monthSelectorLabel: { fontSize: 12, fontWeight: 'bold', color: '#374151' },
  monthChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', marginRight: 6 },
  monthChipActive: { backgroundColor: '#5C0B0B' },
  monthChipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  monthChipTextActive: { color: '#fff', fontWeight: 'bold' },
  subTabContainer: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 8, padding: 3, marginBottom: 12 },
  subTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  subTabActive: { backgroundColor: '#fff', elevation: 1 },
  subTabText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  subTabTextActive: { color: '#5C0B0B', fontWeight: 'bold' },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 4, marginBottom: 4 },
  thCell: { fontSize: 11, fontWeight: 'bold', color: '#4b5563', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', paddingVertical: 9, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', alignItems: 'center' },
  tdCell: { fontSize: 12, color: '#374151' },
  emptyText: { textAlign: 'center', color: '#9ca3af', fontSize: 14, fontStyle: 'italic', marginVertical: 15 }
});
