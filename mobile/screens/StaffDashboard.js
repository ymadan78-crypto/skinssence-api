import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import PendingFollowupReminderModal from '../components/PendingFollowupReminderModal';

export default function StaffDashboard({ navigation }) {
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
  const [canSeeDailyDiary, setCanSeeDailyDiary] = useState(false);
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

  const loadStaffData = async () => {
    try {
      const name = await AsyncStorage.getItem('userName');
      if (name) setUserName(name);

      const token = await AsyncStorage.getItem('userToken');

      // Fetch user profile & staff permissions
      try {
        let meRes;
        try {
          meRes = await axios.get('https://skinssence-api.onrender.com/api/users/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (cloudErr) {
          meRes = await axios.get('http://localhost:3000/api/users/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        if (meRes.data && meRes.data.permissions) {
          const perms = meRes.data.permissions;
          const allowed = !!(perms.can_see_daily_diary || perms.can_view_diary);
          setCanSeeDailyDiary(allowed);
          await AsyncStorage.setItem('userPermissions', JSON.stringify(perms));
        }
      } catch (permErr) {
        // Fallback to cached permissions
        const cached = await AsyncStorage.getItem('userPermissions');
        if (cached) {
          try {
            const cp = JSON.parse(cached);
            setCanSeeDailyDiary(!!(cp.can_see_daily_diary || cp.can_view_diary));
          } catch (e) {}
        }
      }

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
      console.log('Error loading staff dashboard', e);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStaffData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadStaffData();
  };

  const handleLogout = async () => {
    await AsyncStorage.clear();
    navigation.replace('Login');
  };

  const handleSelfAttendance = async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'We need GPS access to verify you are at the clinic.');
        return;
      }

      let location;
      try {
        location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeout: 10000 });
      } catch (locErr) {
        location = await Location.getLastKnownPositionAsync({});
        if (!location) throw new Error('Could not get location. Please ensure GPS is enabled and try again outside.');
      }
      
      const token = await AsyncStorage.getItem('userToken');
      
      const res = await axios.post('https://skinssence-api.onrender.com/api/staff/attendance/geotag', {
        lat: location.coords.latitude,
        lng: location.coords.longitude
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      Alert.alert('Attendance Result', res.data.message);
    } catch (error) {
      if (error.response) {
        Alert.alert('Attendance Failed', error.response.data.error);
      } else {
        Alert.alert('Error', 'Could not get location. Ensure GPS is enabled.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Staff Dashboard</Text>
        <Text style={styles.headerSubtitle}>Welcome, {userName}</Text>
      </View>
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        
        {/* EXPIRY ALARM */}
        {expiringItems.length > 0 && (
          <TouchableOpacity 
            style={{ backgroundColor: '#fee2e2', padding: 14, marginHorizontal: 20, marginTop: 15, borderRadius: 10, borderWidth: 1.5, borderColor: '#ef4444' }}
            onPress={() => navigation.navigate('PharmacyAnalytics')}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <Text style={{ color: '#991b1b', fontWeight: 'bold', fontSize: 15 }}>⚠️ MEDICINE EXPIRY ALARM</Text>
              <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 12 }}>{expiringItems.length} Urgent ›</Text>
            </View>
            <Text style={{ color: '#7f1d1d', fontSize: 13, marginBottom: 4 }}>
              {expiringItems.length} medicine(s) expiring soon or expired. Tap to view full list.
            </Text>
            {expiringItems.slice(0, 2).map((item, idx) => (
              <Text key={idx} style={{ color: '#991b1b', fontSize: 12, marginTop: 2 }}>
                • {item.name} — {item.daysRemaining !== null ? (item.daysRemaining < 0 ? `Expired ${Math.abs(item.daysRemaining)}d ago` : `${item.daysRemaining}d left`) : (item.formattedExpiry || item.expiry)}
              </Text>
            ))}
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

        {/* TOP STATS CARDS */}
        <View style={styles.statsRow}>
          <TouchableOpacity style={styles.statCard} onPress={() => navigation.navigate('TodayPatients')}>
            <Text style={styles.statTitle}>Today's Patients</Text>
            <Text style={styles.statValue}>{todayStats.patients}</Text>
            <Text style={styles.statHint}>View Visits ›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard} onPress={() => navigation.navigate('StaffCollection')}>
            <Text style={styles.statTitle}>Today's Collection</Text>
            <Text style={styles.statValue}>₹ {parseFloat(todayStats.collection || 0).toFixed(2)}</Text>
            <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 3, fontWeight: '500' }}>
              Proc: ₹{parseFloat(todayStats.procedure_collection || 0).toFixed(0)} • Med: ₹{parseFloat(todayStats.medicine_collection || 0).toFixed(0)}
            </Text>
            <Text style={styles.statHint}>View Details ›</Text>
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
            marginHorizontal: 20,
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
                0 payments on Clinic QR today. Next UPI payment will prompt for Clinic QR.
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
            marginHorizontal: 20,
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

        {/* QUICK ACTION GRID */}
        <View style={styles.grid}>
          <TouchableOpacity style={[styles.card, { backgroundColor: '#f0fdf4', borderColor: '#10b981', borderWidth: 2 }]} onPress={handleSelfAttendance}>
            <Text style={[styles.cardText, { color: '#10b981' }]}>Mark My Attendance</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { backgroundColor: '#f0fdf4', borderColor: '#10b981', borderWidth: 2 }]} onPress={() => navigation.navigate('MyAttendance')}>
            <Text style={[styles.cardText, { color: '#10b981' }]}>Attendance History</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { backgroundColor: '#fff7ed', borderColor: '#f97316', borderWidth: 1.5 }]} onPress={() => navigation.navigate('Leads')}>
            <Text style={[styles.cardText, { color: '#c2410c', fontWeight: 'bold' }]}>🎯 Potential Clients / Leads</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PatientRegistration')}>
            <Text style={styles.cardText}>+ New Patient</Text>
          </TouchableOpacity>

          
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('SearchPatient')}>
            <Text style={styles.cardText}>Search Patient</Text>
          </TouchableOpacity>

          {canSeeDailyDiary && (
            <TouchableOpacity style={[styles.card, { backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1 }]} onPress={() => navigation.navigate('DailyDiary')}>
              <Text style={[styles.cardText, { color: '#5C0B0B', fontWeight: 'bold' }]}>📖 Daily Diary</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('TodayPatients')}>
            <Text style={[styles.cardText, { color: '#5C0B0B' }]}>👥 Today's Visits</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PharmacyBilling')}>
            <Text style={styles.cardText}>💊 Pharmacy / Create Bill</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.card, { backgroundColor: '#eff6ff', borderColor: '#3b82f6', borderWidth: 1 }]} onPress={() => navigation.navigate('InventoryManagement')}>
            <Text style={[styles.cardText, { color: '#1d4ed8', fontWeight: 'bold' }]}>📦 Stock / Add Medicine</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('UpcomingEvents')}>
            <Text style={styles.cardText}>Upcoming Events</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AppointmentCalendar')}>
            <Text style={styles.cardText}>Appt Calendar</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AppointmentReminders')}>
            <Text style={styles.cardText}>Call Reminders</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('PharmacyAnalytics')}>
            <Text style={styles.cardText}>📅 Medicine Expiry</Text>
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
        onUpdated={loadStaffData}
        initialPatients={pendingFollowupPatients}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  scrollContent: { paddingBottom: 30 },
  header: {
    backgroundColor: '#5C0B0B',
    padding: 20,
    paddingTop: 50,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 16, color: '#e2e8f0', marginTop: 5 },
  followupBanner: {
    backgroundColor: '#f8fafc',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 15,
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 15
  },
  statCard: {
    backgroundColor: '#fff',
    width: '48%',
    padding: 15,
    borderRadius: 10,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#5C0B0B'
  },
  statTitle: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  statValue: { color: '#5C0B0B', fontSize: 18, fontWeight: 'bold', marginVertical: 4 },
  statHint: { color: '#3b82f6', fontSize: 11, fontWeight: '600' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 20,
    marginTop: 5,
  },
  card: {
    backgroundColor: '#fff',
    width: '48%',
    padding: 18,
    marginVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardText: { fontSize: 14, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  logoutButton: {
    marginHorizontal: 20,
    marginTop: 10,
    backgroundColor: '#ef4444',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
