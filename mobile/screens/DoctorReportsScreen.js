import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export default function DoctorReportsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [activeMainTab, setActiveMainTab] = useState('overview'); // 'overview', 'procedures', 'medicines'
  const [reportData, setReportData] = useState(null);
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [procSubTab, setProcSubTab] = useState('sessions'); // 'sessions', 'revenue', 'daily'
  const [medSubTab, setMedSubTab] = useState('qty'); // 'qty', 'revenue', 'history'

  const API_URL = 'https://skinssence-api.onrender.com/api/admin/reports';

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReportData(response.data);
      if (response.data && response.data.currentMonth) {
        setSelectedMonthKey(response.data.currentMonth.monthKey);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to fetch sales and revenue analytics.');
    } finally {
      setLoading(false);
    }
  };

  const selectedMonthData = (reportData?.monthWiseSales || []).find(m => m.monthKey === selectedMonthKey) || reportData?.currentMonth || {
    monthKey: '',
    monthLabel: 'Selected Month',
    procedureRevenue: 0,
    procedureSessions: 0,
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
        <Text style={styles.headerTitle}>Clinic Sales & Revenue</Text>
        <TouchableOpacity onPress={fetchReports} style={styles.refreshBtn}>
          <Ionicons name="reload" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* MAIN TOP TABS */}
      <View style={styles.mainTabContainer}>
        <TouchableOpacity
          style={[styles.mainTab, activeMainTab === 'overview' && styles.activeMainTab]}
          onPress={() => setActiveMainTab('overview')}>
          <Text style={activeMainTab === 'overview' ? styles.activeMainTabText : styles.mainTabText}>
            📊 Total Sales
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
              {/* 1. TODAY's SALES CARD */}
              <View style={[styles.card, styles.todayCard]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardHeaderTitle}>TODAY'S TOTAL CLINIC SALE</Text>
                  <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● LIVE</Text></View>
                </View>

                <Text style={styles.grandTotalHero}>
                  ₹ {reportData.today.totalClinicSale.toFixed(2)}
                </Text>

                <View style={styles.breakdownGrid}>
                  <View style={[styles.breakdownBox, { backgroundColor: '#fef3c7', borderColor: '#fde68a', marginBottom: 8, width: '100%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#92400e' }]}>🩺 Consultation Fees</Text>
                    <Text style={[styles.breakdownValue, { color: '#78350f' }]}>₹ {(reportData.today.consultationRevenue || 0).toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.consultationCount || 0} consultations recorded</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', width: '48%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#1e40af' }]}>🏥 Procedures / Services</Text>
                    <Text style={[styles.breakdownValue, { color: '#1e3a8a' }]}>₹ {reportData.today.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.procedureSessions} sessions recorded</Text>
                  </View>

                  <View style={[styles.breakdownBox, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', width: '48%' }]}>
                    <Text style={[styles.breakdownLabel, { color: '#15803d' }]}>💊 Medicine Sales</Text>
                    <Text style={[styles.breakdownValue, { color: '#14532d' }]}>₹ {reportData.today.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.breakdownSub}>{reportData.today.medicineTransactions} bills ({reportData.today.medicineUnitsSold} units)</Text>
                  </View>
                </View>
              </View>

              {/* 2. CURRENT MONTH CARD */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>CURRENT MONTH — {reportData.currentMonth.monthLabel.toUpperCase()}</Text>
                
                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Total Clinic Revenue:</Text>
                  <Text style={styles.heroValue}>₹ {reportData.currentMonth.totalClinicSale.toFixed(2)}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Procedure Revenue</Text>
                    <Text style={styles.statValue}>₹ {reportData.currentMonth.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.currentMonth.procedureSessions} sessions</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Medicine Revenue</Text>
                    <Text style={styles.statValue}>₹ {reportData.currentMonth.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.currentMonth.medicineTransactions} bills ({reportData.currentMonth.medicineUnitsSold} units)</Text>
                  </View>
                </View>
              </View>

              {/* 3. PREVIOUS MONTH CARD */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>PREVIOUS MONTH — {reportData.previousMonth.monthLabel.toUpperCase()}</Text>
                
                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Total Clinic Revenue:</Text>
                  <Text style={[styles.heroValue, { color: '#4b5563' }]}>₹ {reportData.previousMonth.totalClinicSale.toFixed(2)}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Procedure Revenue</Text>
                    <Text style={styles.statValue}>₹ {reportData.previousMonth.procedureRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.previousMonth.procedureSessions} sessions</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Medicine Revenue</Text>
                    <Text style={styles.statValue}>₹ {reportData.previousMonth.medicineRevenue.toFixed(2)}</Text>
                    <Text style={styles.statSub}>{reportData.previousMonth.medicineTransactions} bills ({reportData.previousMonth.medicineUnitsSold} units)</Text>
                  </View>
                </View>
              </View>

              {/* 4. MONTHLY REVENUE COMPARISON */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>MONTHLY REVENUE COMPARISON</Text>
                <Text style={styles.cardSubtitle}>
                  {reportData.currentMonth.monthLabel} vs {reportData.previousMonth.monthLabel}
                </Text>

                {renderComparisonRow('Total Clinic Sale', reportData.comparison.totalSale, true)}
                {renderComparisonRow('Procedure Revenue', reportData.comparison.procedureRevenue, true)}
                {renderComparisonRow('Medicine Revenue', reportData.comparison.medicineRevenue, true)}
                {renderComparisonRow('Procedure Sessions', reportData.comparison.procedureSessions, false)}
                {renderComparisonRow('Medicine Transactions', reportData.comparison.medicineTransactions, false)}
              </View>

              {/* 5. HISTORICAL MONTH-WISE SALES TABLE */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>MONTH-WISE TOTAL SALES HISTORY</Text>
                
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ marginTop: 10 }}>
                  <View>
                    {/* TABLE HEADER */}
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.thCell, { width: 90 }]}>Month</Text>
                      <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>Procedure (₹)</Text>
                      <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>Medicine (₹)</Text>
                      <Text style={[styles.thCell, { width: 110, textAlign: 'right' }]}>Total Sale (₹)</Text>
                      <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>Sessions</Text>
                      <Text style={[styles.thCell, { width: 80, textAlign: 'center' }]}>Med Bills</Text>
                    </View>

                    {/* TABLE BODY */}
                    {reportData.monthWiseSales.map((m, idx) => (
                      <View key={m.monthKey || idx} style={[styles.tableRow, idx % 2 === 1 && { backgroundColor: '#f9fafb' }]}>
                        <Text style={[styles.tdCell, { width: 90, fontWeight: 'bold' }]}>{m.monthLabel}</Text>
                        <Text style={[styles.tdCell, { width: 110, textAlign: 'right', color: '#1e40af' }]}>₹ {m.procedureRevenue.toFixed(0)}</Text>
                        <Text style={[styles.tdCell, { width: 110, textAlign: 'right', color: '#15803d' }]}>₹ {m.medicineRevenue.toFixed(0)}</Text>
                        <Text style={[styles.tdCell, { width: 110, textAlign: 'right', fontWeight: 'bold', color: '#5C0B0B' }]}>₹ {m.totalSale.toFixed(0)}</Text>
                        <Text style={[styles.tdCell, { width: 80, textAlign: 'center' }]}>{m.procedureSessions}</Text>
                        <Text style={[styles.tdCell, { width: 80, textAlign: 'center' }]}>{m.medicineTransactions}</Text>
                      </View>
                    ))}
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
                <Text style={styles.cardTitle}>PROCEDURES — {selectedMonthData.monthLabel.toUpperCase()}</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Total Procedure Revenue</Text>
                    <Text style={[styles.statValue, { color: '#1e40af' }]}>₹ {selectedMonthData.procedureRevenue.toFixed(2)}</Text>
                  </View>
                  <View style={styles.statColDivider} />
                  <View style={styles.statCol}>
                    <Text style={styles.statLabel}>Total Sessions</Text>
                    <Text style={styles.statValue}>{selectedMonthData.procedureSessions}</Text>
                  </View>
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
                    💰 By Revenue
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
                        <Text style={[styles.thCell, { width: 90, textAlign: 'right' }]}>Revenue</Text>
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
                  <Text style={styles.cardTitle}>TOP PROCEDURES BY REVENUE ({selectedMonthData.monthLabel})</Text>
                  {(!selectedMonthData.topProceduresByRevenue || selectedMonthData.topProceduresByRevenue.length === 0) ? (
                    <Text style={styles.emptyText}>No procedure sales recorded for this period.</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: 45, textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { flex: 1 }]}>Procedure Name</Text>
                        <Text style={[styles.thCell, { width: 95, textAlign: 'right' }]}>Revenue</Text>
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
                  <Text style={styles.cardTitle}>DAILY SALES IN {selectedMonthData.monthLabel.toUpperCase()}</Text>
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
                <Text style={styles.cardTitle}>💊 PHARMACY & MEDICINE SALES OVERVIEW</Text>
                
                <View style={styles.heroRow}>
                  <Text style={styles.heroLabel}>Today's Medicine Sale:</Text>
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
                    💰 Top by Revenue
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
                        <Text style={[styles.thCell, { width: 95, textAlign: 'right' }]}>Revenue</Text>
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
                  <Text style={styles.cardTitle}>TOP MEDICINES BY REVENUE ({selectedMonthData.monthLabel})</Text>
                  {(!selectedMonthData.topMedicinesByRevenue || selectedMonthData.topMedicinesByRevenue.length === 0) ? (
                    <Text style={styles.emptyText}>No medicine sales recorded for this period.</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.thCell, { width: 45, textAlign: 'center' }]}>#</Text>
                        <Text style={[styles.thCell, { flex: 1 }]}>Medicine Name</Text>
                        <Text style={[styles.thCell, { width: 95, textAlign: 'right' }]}>Revenue</Text>
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
                  <Text style={styles.cardTitle}>MONTH-WISE MEDICINE SALES TABLE</Text>
                  <View style={{ marginTop: 10 }}>
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.thCell, { width: 90 }]}>Month</Text>
                      <Text style={[styles.thCell, { flex: 1, textAlign: 'center' }]}>Bills / Txns</Text>
                      <Text style={[styles.thCell, { flex: 1, textAlign: 'center' }]}>Units Sold</Text>
                      <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>Revenue (₹)</Text>
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

        </ScrollView>
      )}
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
  mainTabContainer: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  mainTab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeMainTab: { borderBottomColor: '#5C0B0B' },
  mainTabText: { fontSize: 14, fontWeight: 'bold', color: '#6b7280' },
  activeMainTabText: { fontSize: 14, fontWeight: 'bold', color: '#5C0B0B' },
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
