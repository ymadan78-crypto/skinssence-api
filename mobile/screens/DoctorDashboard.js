import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export default function DoctorDashboard({ navigation }) {
  const [userName, setUserName] = useState('');
  const [expiringItems, setExpiringItems] = useState([]);
  const [todayStats, setTodayStats] = useState({
    patients: 0,
    collection: 0,
    procedure_collection: 0,
    medicine_collection: 0
  });
  const [refreshing, setRefreshing] = useState(false);

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
    try {
      const token = await AsyncStorage.getItem('userToken');
      const url = `https://skinssence-api.onrender.com/api/admin/backup?token=${token}`;
      Linking.openURL(url);
    } catch (e) {
      console.log('Error opening backup URL');
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
          <TouchableOpacity style={[styles.listItem, {backgroundColor: '#dcfce7'}]} onPress={handleBackup}>
            <Text style={[styles.listText, {color: '#166534', fontWeight: 'bold'}]}>Download Cloud Backup (.xlsx)</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50, borderBottomLeftRadius: 15, borderBottomRightRadius: 15 },
  headerText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  welcomeText: { fontSize: 18, fontWeight: 'bold', margin: 20, color: '#333' },
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
