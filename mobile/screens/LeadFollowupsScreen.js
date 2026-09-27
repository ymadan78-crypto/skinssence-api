import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Modal,
  TextInput
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';

const API_BASE = 'https://skinssence-api.onrender.com/api/leads';

export default function LeadFollowupsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('TODAY'); // 'TODAY', 'OVERDUE', 'UPCOMING'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    today: [],
    overdue: [],
    upcoming: [],
    counts: { today: 0, overdue: 0, upcoming: 0, total_pending: 0 }
  });

  // Complete Follow-up Modal State
  const [completeModal, setCompleteModal] = useState(false);
  const [selectedFollowup, setSelectedFollowup] = useState(null);
  const [compNotes, setCompNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [nextReason, setNextReason] = useState('');

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_BASE}/followups/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setDashboardData(res.data);
      }
    } catch (e) {
      console.error('Error fetching followup dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDashboard();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard();
  };

  const handleCall = (mobile) => {
    if (!mobile) return Alert.alert('No Number', 'Mobile number not found');
    const clean = String(mobile).replace(/\D/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => Alert.alert('Error', 'Unable to open phone dialer'));
  };

  const handleWhatsApp = (item) => {
    if (!item.mobile) return Alert.alert('No Number', 'Mobile number not found');
    const clean = String(item.mobile).replace(/\D/g, '');
    const phoneWithCode = clean.startsWith('91') ? clean : `91${clean}`;
    const msg = `Hello ${item.name || 'Client'}, this is a reminder from Skinssence Laser & Skincare Clinic regarding your follow-up consultation.`;
    Linking.openURL(`whatsapp://send?phone=${phoneWithCode}&text=${encodeURIComponent(msg)}`).catch(() => {
      Alert.alert('Error', 'WhatsApp is not installed');
    });
  };

  const submitCompleteFollowup = async () => {
    if (!selectedFollowup) return;
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.put(`${API_BASE}/followups/${selectedFollowup.id}/complete`, {
        completion_notes: compNotes.trim() || 'Follow-up completed',
        next_followup_date: nextDate.trim() || null,
        next_followup_reason: nextReason.trim() || null
      }, { headers: { Authorization: `Bearer ${token}` } });

      setCompleteModal(false);
      setCompNotes('');
      setNextDate('');
      setNextReason('');
      fetchDashboard();
    } catch (e) {
      Alert.alert('Error', 'Failed to complete follow-up');
    }
  };

  const getListForTab = () => {
    switch (activeTab) {
      case 'TODAY': return dashboardData.today || [];
      case 'OVERDUE': return dashboardData.overdue || [];
      case 'UPCOMING': return dashboardData.upcoming || [];
      default: return [];
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.leadIdBadge}>
          <Text style={styles.leadIdText}>{item.lead_id}</Text>
        </View>
        <Text style={styles.nameText}>{item.name}</Text>
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>{item.followup_time || '11:00 AM'}</Text>
        </View>
      </View>

      <Text style={styles.mobileText}>📞 {item.mobile}</Text>
      {item.treatment_interest ? (
        <Text style={styles.treatmentText}>🎯 {item.treatment_interest}</Text>
      ) : null}
      <Text style={styles.reasonText}>Reason: {item.reason || 'Follow-up discussion'}</Text>
      <Text style={styles.dateBadgeText}>Scheduled: {item.followup_date}</Text>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.callBtn} onPress={() => handleCall(item.mobile)}>
          <Text style={styles.callBtnText}>📞 Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.waBtn} onPress={() => handleWhatsApp(item)}>
          <Text style={styles.waBtnText}>💬 WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.doneBtn} 
          onPress={() => {
            setSelectedFollowup(item);
            setCompleteModal(true);
          }}>
          <Text style={styles.doneBtnText}>✓ Complete</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.openBtn} 
          onPress={() => navigation.navigate('LeadDetail', { lead_id: item.lead_id })}>
          <Text style={styles.openBtnText}>Open ›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const currentList = getListForTab();

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📅 Follow-up Agenda</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* TABS */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'TODAY' && styles.tabBtnActive]}
          onPress={() => setActiveTab('TODAY')}>
          <Text style={[styles.tabText, activeTab === 'TODAY' && styles.tabTextActive]}>
            Today ({dashboardData.counts?.today || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'OVERDUE' && styles.tabBtnActive, { borderBottomColor: activeTab === 'OVERDUE' ? '#ef4444' : 'transparent' }]}
          onPress={() => setActiveTab('OVERDUE')}>
          <Text style={[styles.tabText, activeTab === 'OVERDUE' && { color: '#ef4444', fontWeight: 'bold' }]}>
            Overdue ({dashboardData.counts?.overdue || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'UPCOMING' && styles.tabBtnActive]}
          onPress={() => setActiveTab('UPCOMING')}>
          <Text style={[styles.tabText, activeTab === 'UPCOMING' && styles.tabTextActive]}>
            Upcoming ({dashboardData.counts?.upcoming || 0})
          </Text>
        </TouchableOpacity>
      </View>

      {/* LIST */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5C0B0B" />
          <Text style={styles.loadingText}>Loading follow-up agenda...</Text>
        </View>
      ) : (
        <FlatList
          data={currentList}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🎉</Text>
              <Text style={styles.emptyTitle}>No pending follow-ups</Text>
              <Text style={styles.emptySubtitle}>All follow-up tasks in this category are completed!</Text>
            </View>
          }
        />
      )}

      {/* COMPLETE MODAL */}
      <Modal visible={completeModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>✓ Complete Follow-up</Text>
            {selectedFollowup && (
              <Text style={styles.modalSubtitle}>
                {selectedFollowup.lead_id} • {selectedFollowup.name}
              </Text>
            )}

            <Text style={styles.label}>Outcome / Call Notes</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              placeholder="e.g. Spoke with caller. Interested in Saturday visit."
              value={compNotes}
              onChangeText={setCompNotes}
              multiline
            />

            <Text style={styles.label}>Next Follow-up Date (Optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="YYYY-MM-DD (Leave empty if finished)"
              value={nextDate}
              onChangeText={setNextDate}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCompleteModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={submitCompleteFollowup}>
                <Text style={styles.modalSubmitText}>Save & Finish</Text>
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
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: '#5C0B0B' },
  tabText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  tabTextActive: { color: '#5C0B0B', fontWeight: 'bold' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  leadIdBadge: {
    backgroundColor: '#fef2f2',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
    marginRight: 8,
  },
  leadIdText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 12 },
  nameText: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', flex: 1 },
  timeBadge: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  timeText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  mobileText: { fontSize: 13, color: '#475569', marginBottom: 4 },
  treatmentText: { fontSize: 12, color: '#0369a1', fontWeight: '500', marginBottom: 4 },
  reasonText: { fontSize: 13, color: '#1e293b', marginBottom: 4 },
  dateBadgeText: { fontSize: 11, color: '#64748b', marginBottom: 8 },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    marginTop: 4,
  },
  callBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  callBtnText: { color: '#2563eb', fontWeight: 'bold', fontSize: 12 },
  waBtn: {
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  waBtnText: { color: '#16a34a', fontWeight: 'bold', fontSize: 12 },
  doneBtn: {
    backgroundColor: '#10b981',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  doneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  openBtn: {
    backgroundColor: '#5C0B0B',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  openBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, color: '#64748b', fontSize: 14 },
  emptyContainer: { alignItems: 'center', paddingVertical: 50 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 6 },
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
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#5C0B0B', fontWeight: 'bold', marginBottom: 12 },
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
