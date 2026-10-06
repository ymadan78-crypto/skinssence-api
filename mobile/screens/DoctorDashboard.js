import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import PendingFollowupReminderModal from '../components/PendingFollowupReminderModal';

export default function DoctorDashboard({ navigation }) {
  const [userName, setUserName] = useState('');
  const [expiringItems, setExpiringItems] = useState([]);
  const [todayStats, setTodayStats] = useState({
    patients: 0,
    collection: 0,
    procedure_collection: 0,
    medicine_collection: 0
  });
  const [pendingFollowupsCount, setPendingFollowupsCount] = useState(0);
  const [pendingFollowupPatients, setPendingFollowupPatients] = useState([]);
  const [followupModalVisible, setFollowupModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [clinicQrStatus, setClinicQrStatus] = useState({ completed: true, count: 0 });

  const checkHourlyReminder = async (count) => {
    try {
      if (!count || count <= 0) return;
      const lastTime = await AsyncStorage.getItem('@last_followup_reminder_time');
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;
      if (!lastTime || (now - parseInt(lastTime, 10)) >= ONE_HOUR) {
        setFollowupModalVisible(true);
        await AsyncStorage.setItem('@last_followup_reminder_time', now.toString());
      }
    } catch (e) {
      console.log('Error checking hourly reminder', e);
    }
  };

  const loadDashboardData = async () => {
    try {
      const name = await AsyncStorage.getItem('userName');
      if (name) setUserName(name);

      const token = await AsyncStorage.getItem('userToken');
      const [analyticsRes, todayRes] = await Promise.all([
        axios.get('https://skinssence-api.onrender.com/api/inventory/analytics', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('https://skinssence-api.onrender.com/api/dashboard/today', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      if (analyticsRes.data && analyticsRes.data.expiringSoon) {
        setExpiringItems(analyticsRes.data.expiringSoon);
      }
      if (todayRes.data) {
        setTodayStats({
          patients: todayRes.data.patients || 0,
          collection: todayRes.data.collection || todayRes.data.total_collection || 0,
          procedure_collection: todayRes.data.procedure_collection || 0,
          medicine_collection: todayRes.data.medicine_collection || 0
        });
        setClinicQrStatus({
          completed: todayRes.data.clinic_qr_completed !== undefined ? !!todayRes.data.clinic_qr_completed : true,
          count: todayRes.data.clinic_qr_count || 0
        });
        const pCount = todayRes.data.pending_followups_count || 0;
        const pList = todayRes.data.pending_followup_patients || [];
        setPendingFollowupsCount(pCount);
        setPendingFollowupPatients(pList);
        if (pCount > 0) {
          checkHourlyReminder(pCount);
        }
      }
    } catch (e) {
      console.log('Error loading doctor dashboard', e);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    navigation.replace('Login');
  };

  const handleBackup = async () => {
    if (backupLoading) return;
    try {
      setBackupLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Authentication Required', 'Please log in again to download backup.');
        return;
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const filename = `Skinssence_Backup_${todayStr}.xlsx`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      const downloadUrl = 'https://skinssence-api.onrender.com/api/admin/backup';

      const downloadResult = await FileSystem.downloadAsync(downloadUrl, fileUri, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (downloadResult.status !== 200) {
        throw new Error(`Server returned HTTP status ${downloadResult.status}`);
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Save Skinssence Backup',
          UTI: 'com.microsoft.excel.xlsx'
        });
      } else {
        Alert.alert('Backup Ready', `Backup downloaded successfully:\n${filename}`);
      }
    } catch (e) {
      console.log('Error downloading backup:', e);
      Alert.alert(
        'Backup Download Notice',
        'Could not complete backup download. If the cloud service is waking up, please retry in 30 seconds.'
      );
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Skinssence Doctor</Text>
      </View>

      <ScrollView 
        contentContainerStyle={{ paddingBottom: 50 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text style={styles.welcomeText}>Welcome, {userName}</Text>

        {/* EXPIRY ALARM */}
        {expiringItems.length > 0 && (
          <TouchableOpacity 
            style={{ backgroundColor: '#fee2e2', padding: 14, margin: 15, borderRadius: 10, borderWidth: 1.5, borderColor: '#ef4444' }}
            onPress={() => navigation.navigate('PharmacyAnalytics')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={{ color: '#991b1b', fontWeight: 'bold', fontSize: 15 }}>⚠️ MEDICINE EXPIRY ALARM</Text>
              <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>{expiringItems.length} Urgent Items ›</Text>
            </View>
            <Text style={{ color: '#7f1d1d', fontSize: 13, marginBottom: 6 }}>
              {expiringItems.length} medicine(s) are already expired or expiring within 3 months.
            </Text>
            {expiringItems.slice(0, 3).map((item, idx) => (
              <Text key={idx} style={{ color: '#991b1b', fontSize: 12, marginTop: 2 }}>
                • {item.name} {item.batch ? `(${item.batch})` : ''} — {item.statusLabel || 'Urgent'} ({item.daysRemaining !== null ? (item.daysRemaining < 0 ? `Expired ${Math.abs(item.daysRemaining)}d ago` : `${item.daysRemaining}d left`) : (item.formattedExpiry || item.expiry)})
              </Text>
            ))}
            <Text style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: 12, marginTop: 8, textAlign: 'right' }}>
              🔍 Tap to open Expiry Dashboard →
            </Text>
          </TouchableOpacity>
        )}

        {/* PENDING FOLLOW-UP REMINDER BANNER */}
        {pendingFollowupsCount > 0 && (
          <TouchableOpacity 
            style={styles.followupBanner}
            onPress={() => setFollowupModalVisible(true)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="calendar-outline" size={17} color="#334155" style={{ marginRight: 8 }} />
                <Text style={styles.followupBannerTitle}>
                  Follow-ups pending: <Text style={{ fontWeight: 'bold' }}>{pendingFollowupsCount}</Text>
                </Text>
              </View>
              <Text style={styles.followupActionText}>Review ›</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* METRICS CARDS */}
        <View style={styles.dashboardCards}>
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('TodayPatients')}>
            <Text style={styles.cardTitle}>Today's Patients</Text>
            <Text style={styles.cardValue}>{todayStats.patients}</Text>
            <Text style={styles.cardHint}>Tap for Today's List ›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('StaffCollection')}>
            <Text style={styles.cardTitle}>Today's Collection</Text>
            <Text style={styles.cardValue}>₹ {parseFloat(todayStats.collection || 0).toFixed(2)}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 3, fontWeight: '500' }}>
              Proc: ₹{parseFloat(todayStats.procedure_collection || 0).toFixed(0)} • Med: ₹{parseFloat(todayStats.medicine_collection || 0).toFixed(0)}
            </Text>
            <Text style={styles.cardHint}>Tap for Details ›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cardSecondary} onPress={() => navigation.navigate('PatientRegistration')}>
            <Text style={styles.cardText}>+ New Patient</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cardSecondary} onPress={() => navigation.navigate('SearchPatient')}>
            <Text style={styles.cardText}>Search Patient</Text>
          </TouchableOpacity>
        </View>

        {/* DAILY CLINIC QR STATUS BANNER */}
        {!clinicQrStatus.completed ? (
          <View style={{
            backgroundColor: '#fffbeb',
            borderWidth: 1.5,
            borderColor: '#f59e0b',
            borderRadius: 10,
            padding: 12,
            marginHorizontal: 15,
            marginBottom: 15,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Ionicons name="alert-circle" size={24} color="#d97706" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#92400e' }}>
                Daily Mandate: 1 Clinic QR payment needed
              </Text>
              <Text style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
                0 payments on Clinic QR today. Ensure at least one UPI payment is received on Clinic QR.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{
            backgroundColor: '#f0fdf4',
            borderWidth: 1,
            borderColor: '#86efac',
            borderRadius: 10,
            padding: 10,
            marginHorizontal: 15,
            marginBottom: 15,
            flexDirection: 'row',
            alignItems: 'center'
          }}>
            <Ionicons name="checkmark-circle" size={20} color="#16a34a" style={{ marginRight: 8 }} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#166534' }}>
              Daily Clinic QR mandate completed ({clinicQrStatus.count} transaction{clinicQrStatus.count === 1 ? '' : 's'} today)
            </Text>
          </View>
        )}
        
        {/* MANAGEMENT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Management</Text>
          <TouchableOpacity style={[styles.listItem, { backgroundColor: '#fef2f2', paddingHorizontal: 8, borderRadius: 8, marginVertical: 4 }]} onPress={() => navigation.navigate('DailyDiary')}>
            <Text style={[styles.listText, { color: '#5C0B0B', fontWeight: 'bold', fontSize: 15 }]}>📖 Daily Diary / Day Book (Day-Wise Ledger)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('TodayPatients')}>
            <Text style={[styles.listText, { color: '#5C0B0B', fontWeight: 'bold' }]}>👥 Today's Visited Patients & Bills</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('AllPatients')}>
            <Text style={styles.listText}>All Patients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('UpcomingEvents')}>
            <Text style={styles.listText}>Upcoming Events (10 Days)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.listItem, { backgroundColor: '#fff7ed', paddingHorizontal: 8, borderRadius: 8, marginVertical: 4 }]} onPress={() => navigation.navigate('Leads')}>
            <Text style={[styles.listText, { color: '#c2410c', fontWeight: 'bold' }]}>🎯 Potential Clients / Leads & Follow-ups</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('AppointmentCalendar')}>
            <Text style={styles.listText}>Appointment Calendar</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('AppointmentReminders')}>
            <Text style={[styles.listText, { color: '#059669', fontWeight: 'bold' }]}>📞 Call & Follow-up Reminders</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('UserManagement')}>
            <Text style={styles.listText}>Manage Staff Accounts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('HRDashboard')}>
            <Text style={styles.listText}>HR & Payroll (Attendance)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('InventoryManagement')}>
            <Text style={styles.listText}>Inventory Management (Add Stock)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.listItem, { backgroundColor: '#fef3c7' }]} onPress={() => navigation.navigate('MasterProcedureCatalog')}>
            <Text style={[styles.listText, { color: '#92400e', fontWeight: 'bold' }]}>📋 Master Procedure Catalog (Locked Names)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('PharmacyAnalytics')}>
            <Text style={styles.listText}>📅 Medicine Expiry & Pharmacy Analytics</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('PharmacyBilling')}>
            <Text style={styles.listText}>💊 Pharmacy / Create Bill</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('ExpenseEntry')}>
            <Text style={styles.listText}>Expense Tracker (OCR)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.listItem} onPress={() => navigation.navigate('DoctorReports')}>
            <Text style={styles.listText}>Reports & Collections</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.listItem, {backgroundColor: '#dcfce7'}, backupLoading && {opacity: 0.7}]} 
            onPress={handleBackup}
            disabled={backupLoading}
          >
            {backupLoading ? (
              <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <ActivityIndicator size="small" color="#166534" style={{marginRight: 8}} />
                <Text style={[styles.listText, {color: '#166534', fontWeight: 'bold'}]}>Generating & Downloading Backup...</Text>
              </View>
            ) : (
              <Text style={[styles.listText, {color: '#166534', fontWeight: 'bold'}]}>Export Clinic Data (.xlsx)</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      <PendingFollowupReminderModal
        visible={followupModalVisible}
        onClose={() => setFollowupModalVisible(false)}
        navigation={navigation}
        onUpdated={loadDashboardData}
        initialPatients={pendingFollowupPatients}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50, borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  headerText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  welcomeText: { fontSize: 18, fontWeight: 'bold', margin: 20, color: '#333' },
  followupBanner: {
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 15,
    marginBottom: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  followupBannerTitle: {
    color: '#1e293b',
    fontSize: 13,
    fontWeight: '500'
  },
  followupActionText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 12
  },
  dashboardCards: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 15 },
  card: { backgroundColor: '#fff', width: '48%', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 3, borderLeftWidth: 4, borderLeftColor: '#5C0B0B' },
  cardTitle: { color: '#666', fontSize: 13, fontWeight: 'bold' },
  cardValue: { color: '#5C0B0B', fontSize: 20, fontWeight: 'bold', marginVertical: 6 },
  cardHint: { color: '#3b82f6', fontSize: 11, fontWeight: '600' },
  cardSecondary: { backgroundColor: '#fff', width: '48%', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  cardText: { color: '#333', fontSize: 14, fontWeight: 'bold' },
  section: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 10, elevation: 2 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 10 },
  listItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  listText: { fontSize: 15, color: '#444' },
  logoutButton: { margin: 20, backgroundColor: '#ef4444', padding: 15, borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
