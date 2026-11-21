import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { Linking, Alert } from 'react-native';
import PharmacyCorrectionModal from '../components/PharmacyCorrectionModal';
import EditBillModal from '../components/EditBillModal';
import { sendFeedbackRequestWhatsApp } from '../utils/whatsappHelper';
import PendingFollowupReminderModal from '../components/PendingFollowupReminderModal';

export default function TodayPatientsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [visits, setVisits] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [correctingVisitId, setCorrectingVisitId] = useState(null);
  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);
  const [editingVisitId, setEditingVisitId] = useState(null);
  const [editBillModalVisible, setEditBillModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [selectedFollowupPatient, setSelectedFollowupPatient] = useState(null);
  const [billFilter, setBillFilter] = useState('ALL'); // 'ALL' | 'PENDING_BILL' | 'SENT_BILL'

  const fetchTodayVisits = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get('https://skinssence-api-1.onrender.com/api/dashboard/today-visits', {
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

  const handleMarkBillSent = async (visitId) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post(
        `https://skinssence-api-1.onrender.com/api/visits/${visitId}/mark-bill-sent`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setVisits(prev => prev.map(v => v.visit_id === visitId ? { ...v, bill_sent_at: new Date().toISOString() } : v));
      Alert.alert('✅ Bill Marked as Sent', 'Status updated successfully.');
    } catch(e) {
      Alert.alert('Error', 'Could not update bill status.');
    }
  };

  const handleDismissBill = (visitId, patientName) => {
    Alert.alert(
      'Dismiss Bill Requirement?',
      `Mark visit for "${patientName}" as "Bill Not Required / Free Visit"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('userToken');
              await axios.post(
                `https://skinssence-api-1.onrender.com/api/visits/${visitId}/dismiss-bill-sent`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
              );
              setVisits(prev => prev.map(v => v.visit_id === visitId ? { ...v, bill_sent_at: new Date().toISOString(), bill_sent_by: 'DISMISSED' } : v));
            } catch(e) {
              Alert.alert('Error', 'Could not dismiss bill requirement.');
            }
          }
        }
      ]
    );
  };

  const handleQuickSendBillWhatsApp = (item) => {
    const pName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Patient';
    const sId = item.skinssence_id || `ID: ${item.patient_id}`;
    const cleanMob = item.mobile ? item.mobile.replace(/\D/g, '').slice(-10) : '';

    if (!cleanMob || cleanMob.length !== 10) {
      return Alert.alert('Invalid Mobile', `Patient "${pName}" (${sId}) does not have a valid 10-digit mobile number in records.`);
    }

    const grandTotal = parseFloat(item.total_amount) || 0;
    const dateStr = item.visit_date ? new Date(item.visit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Today';

    const text = `*Skinssence Aesthetic Clinic & Pharmacy*\n` +
      `---------------------------------\n` +
      `*Receipt / Visit Summary*\n` +
      `Date: ${dateStr}\n` +
      `Patient: ${pName} (${sId})\n` +
      (item.consultation_fee > 0 ? `• Consultation Fee: ₹${item.consultation_fee}\n` : '') +
      (item.procedure_total > 0 ? `• Treatment/Procedure: ₹${item.procedure_total}\n` : '') +
      (item.medicine_total > 0 ? `• Pharmacy Medicines: ₹${item.medicine_total}\n` : '') +
      `*Total Paid: ₹${grandTotal.toFixed(0)}*\n` +
      `---------------------------------\n` +
      `Thank you for visiting Skinssence Clinic! For any questions or follow-up, feel free to WhatsApp us.\n` +
      `📞 Clinic Contact: +91 91791 79191`;

    const encoded = encodeURIComponent(text);
    const url = `whatsapp://send?phone=91${cleanMob}&text=${encoded}`;

    Alert.alert(
      'Send Bill on WhatsApp?',
      `Send visit receipt to ${pName} (${cleanMob}) for ₹${grandTotal.toFixed(0)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open WhatsApp',
          onPress: async () => {
            try {
              await Linking.openURL(url);
              if (item.visit_id) {
                handleMarkBillSent(item.visit_id);
              }
            } catch(e) {
              Alert.alert('Error', 'Could not open WhatsApp.');
            }
          }
        }
      ]
    );
  };

  const pendingBillsCount = visits.filter(v => (parseFloat(v.total_amount) || 0) > 0 && !v.bill_sent_at).length;
  const sentBillsCount = visits.filter(v => Boolean(v.bill_sent_at)).length;

  const currentHour = new Date().getHours();
  const showWrapupBanner = (currentHour >= 13 && pendingBillsCount > 0);

  const filteredVisits = visits.filter(v => {
    const grandTotal = parseFloat(v.total_amount) || 0;
    if (billFilter === 'PENDING_BILL' && (grandTotal <= 0 || v.bill_sent_at)) return false;
    if (billFilter === 'SENT_BILL' && !v.bill_sent_at) return false;

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
  const pendingFollowupsCount = visits.filter(v => (parseInt(v.future_appointments_count, 10) || 0) === 0 && v.followup_status !== 'NOT_REQUIRED').length;

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
            {grandTotal > 0 ? (
              item.bill_sent_at ? (
                <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, marginTop: 3, borderWidth: 1, borderColor: '#86efac' }}>
                  <Text style={{ fontSize: 9.5, color: '#166534', fontWeight: 'bold' }}>✓ WhatsApp Bill Sent</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4, marginTop: 3, borderWidth: 1, borderColor: '#fca5a5' }}>
                  <Text style={{ fontSize: 9.5, color: '#b91c1c', fontWeight: 'bold' }}>⚠️ Bill NOT Sent</Text>
                </View>
              )
            ) : null}
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

        {/* FOLLOW-UP STATUS STRIP - Only shown when follow-up is pending */}
        {item.computed_followup_status === 'PENDING' && (
          <View style={{ 
            marginTop: 8, 
            flexDirection: 'row', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            backgroundColor: '#f8fafc', 
            paddingHorizontal: 10, 
            paddingVertical: 6, 
            borderRadius: 6, 
            borderWidth: 1, 
            borderColor: '#e2e8f0' 
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Ionicons 
                name="calendar-outline" 
                size={14} 
                color="#475569" 
                style={{ marginRight: 5 }} 
              />
              <Text style={{ fontSize: 11.5, fontWeight: '500', color: '#1e293b' }}>
                Follow-up pending
              </Text>
            </View>
            <TouchableOpacity 
              style={{ backgroundColor: '#5C0B0B', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 4 }}
              onPress={() => {
                setSelectedFollowupPatient([item]);
                setReminderModalVisible(true);
              }}>
              <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: 'bold' }}>Book Follow-up ›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* BILL ACTIONS: SEND BILL, EDIT BILL, FEEDBACK, QUICK PAYMENT MODE */}
        {item.visit_id ? (
          <View style={{ marginTop: 8, flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 }}>
            {grandTotal > 0 && !item.bill_sent_at && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#15803d',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6
                }}
                onPress={() => handleQuickSendBillWhatsApp(item)}
              >
                <Ionicons name="logo-whatsapp" size={13} color="#fff" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#fff' }}>
                  📲 Send Bill
                </Text>
              </TouchableOpacity>
            )}

            {grandTotal > 0 && !item.bill_sent_at && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f1f5f9',
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: '#cbd5e1'
                }}
                onPress={() => handleDismissBill(item.visit_id, `${item.first_name || ''} ${item.last_name || ''}`.trim())}
              >
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#475569' }}>
                  Dismiss
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fef3c7',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#fcd34d'
              }}
              onPress={() => {
                setEditingVisitId(item.visit_id);
                setEditBillModalVisible(true);
              }}
            >
              <Ionicons name="pencil" size={13} color="#b45309" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#b45309' }}>
                ✏️ Edit Bill
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#e0e7ff',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#c7d2fe'
              }}
              onPress={() => {
                const pName = item.patient_name || (item.first_name ? (item.first_name + ' ' + (item.last_name || '')) : 'Patient');
                sendFeedbackRequestWhatsApp(item.mobile, pName, Linking, Alert);
              }}
            >
              <Ionicons name="star" size={13} color="#4338ca" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#4338ca' }}>
                ⭐ Feedback
              </Text>
            </TouchableOpacity>

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
                Cash ↔ UPI
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

          <View style={styles.metricBlockDivider} />

          <TouchableOpacity 
            style={[styles.metricBlock, { backgroundColor: pendingFollowupsCount > 0 ? '#fff1f2' : '#f0fdf4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }]}
            onPress={() => {
              setSelectedFollowupPatient(null);
              setReminderModalVisible(true);
            }}>
            <Text style={[styles.metricBlockLabel, { color: pendingFollowupsCount > 0 ? '#991b1b' : '#166534' }]}>
              FOLLOW-UPS PENDING
            </Text>
            <Text style={[styles.metricBlockVal, { color: pendingFollowupsCount > 0 ? '#b91c1c' : '#15803d' }]}>
              {pendingFollowupsCount} {pendingFollowupsCount > 0 ? '›' : '✓'}
            </Text>
          </TouchableOpacity>
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

      {/* 1:00 PM / 7:00 PM WRAP-UP BANNER */}
      {showWrapupBanner && (
        <View style={{
          marginHorizontal: 16,
          marginTop: 8,
          marginBottom: 4,
          padding: 10,
          backgroundColor: currentHour >= 19 ? '#fdf4ff' : '#fffbeb',
          borderWidth: 1.5,
          borderColor: currentHour >= 19 ? '#e879f9' : '#f59e0b',
          borderRadius: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <Ionicons name={currentHour >= 19 ? 'moon' : 'time'} size={20} color={currentHour >= 19 ? '#7e22ce' : '#b45309'} style={{ marginRight: 6 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: currentHour >= 19 ? '#7e22ce' : '#b45309' }}>
                {currentHour >= 19 ? '⏰ 7:00 PM Evening Wrap-Up' : '⏰ 1:00 PM Morning Wrap-Up'}
              </Text>
              <Text style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>
                {pendingBillsCount} patient bill(s) still unsent on WhatsApp!
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: currentHour >= 19 ? '#7e22ce' : '#b45309',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6
            }}
            onPress={() => setBillFilter('PENDING_BILL')}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>View Unsent ›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* BILL STATUS FILTER PILLS */}
      <View style={{ backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          style={[
            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
            billFilter === 'ALL' && { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' }
          ]}
          onPress={() => setBillFilter('ALL')}
        >
          <Text style={[{ fontSize: 12, color: '#4b5563', fontWeight: '600' }, billFilter === 'ALL' && { color: '#fff', fontWeight: 'bold' }]}>
            All ({visits.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fca5a5' },
            billFilter === 'PENDING_BILL' && { backgroundColor: '#b91c1c', borderColor: '#b91c1c' }
          ]}
          onPress={() => setBillFilter('PENDING_BILL')}
        >
          <Text style={[{ fontSize: 12, color: '#b91c1c', fontWeight: '600' }, billFilter === 'PENDING_BILL' && { color: '#fff', fontWeight: 'bold' }]}>
            ⚠️ Unsent Bills ({pendingBillsCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
            billFilter === 'SENT_BILL' && { backgroundColor: '#15803d', borderColor: '#15803d' }
          ]}
          onPress={() => setBillFilter('SENT_BILL')}
        >
          <Text style={[{ fontSize: 12, color: '#166534', fontWeight: '600' }, billFilter === 'SENT_BILL' && { color: '#fff', fontWeight: 'bold' }]}>
            ✅ Sent ({sentBillsCount})
          </Text>
        </TouchableOpacity>
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

      <EditBillModal
        visible={editBillModalVisible}
        visitId={editingVisitId}
        initialVisit={visits.find(v => v.visit_id === editingVisitId)}
        onClose={() => {
          setEditBillModalVisible(false);
          setEditingVisitId(null);
        }}
        onUpdated={fetchTodayVisits}
      />

      <PharmacyCorrectionModal
        visible={correctionModalVisible}
        visitId={correctingVisitId}
        onClose={() => setCorrectionModalVisible(false)}
        onUpdated={fetchTodayVisits}
      />

      <PendingFollowupReminderModal
        visible={reminderModalVisible}
        onClose={() => setReminderModalVisible(false)}
        navigation={navigation}
        onUpdated={fetchTodayVisits}
        initialPatients={selectedFollowupPatient}
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
