import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function HRDashboardScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' or 'salary'
  
  // Attendance State
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [staffList, setStaffList] = useState([]);
  
  // Salary State
  const [salaryMonth, setSalaryMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [salaryReport, setSalaryReport] = useState([]);

  const API_URL = 'https://skinssence-api.onrender.com/api';

  useEffect(() => {
    if (activeTab === 'attendance') fetchStaffForAttendance();
    else fetchSalaryReport();
  }, [activeTab, salaryMonth]);

  const fetchStaffForAttendance = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      // Just fetch all users, we'll mark them
      const response = await axios.get(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` } });
      const staffOnly = response.data.filter(u => u.role === 'STAFF').map(u => ({ ...u, status: 'PRESENT' }));
      setStaffList(staffOnly);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSalaryReport = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(`${API_URL}/attendance/summary?month=${salaryMonth}`, { headers: { Authorization: `Bearer ${token}` } });
      setSalaryReport(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const submitAttendance = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        date: attendanceDate,
        attendanceData: staffList.map(s => ({ user_id: s.id, status: s.status }))
      };
      await axios.post(`${API_URL}/attendance`, payload, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert('Success', `Attendance saved for ${attendanceDate}`);
    } catch (error) {
      Alert.alert('Error', 'Could not save attendance.');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = (index) => {
    const updated = [...staffList];
    updated[index].status = updated[index].status === 'PRESENT' ? 'ABSENT' : 'PRESENT';
    setStaffList(updated);
  };

  // Geofencing State
  const [clinicLat, setClinicLat] = useState(null);
  const [clinicLng, setClinicLng] = useState(null);

  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchStaffForAttendance();
      fetchSettings();
    } else {
      fetchSalaryReport();
    }
  }, [activeTab, salaryMonth]);

  const fetchSettings = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(`${API_URL}/settings`, { headers: { Authorization: `Bearer ${token}` } });
      setClinicLat(response.data.clinic_lat);
      setClinicLng(response.data.clinic_lng);
    } catch (error) {
      console.log(error);
    }
  };

  const handleSetClinicLocation = async () => {
    try {
      // Lazy load to avoid crash if unsupported on web without https
      const Location = require('expo-location');
      
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Please grant location permissions.');
        return;
      }

      setLoading(true);
      let location = await Location.getCurrentPositionAsync({});
      const token = await AsyncStorage.getItem('userToken');
      
      await axios.post(`${API_URL}/settings`, { key: 'clinic_lat', value: location.coords.latitude.toString() }, { headers: { Authorization: `Bearer ${token}` } });
      await axios.post(`${API_URL}/settings`, { key: 'clinic_lng', value: location.coords.longitude.toString() }, { headers: { Authorization: `Bearer ${token}` } });
      
      Alert.alert('Success', 'Clinic location locked! Staff must be within 150m of here to mark attendance.');
      fetchSettings();
    } catch (error) {
      Alert.alert('Error', 'Could not get location. Note: On web, location requires HTTPS.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>HR & Payroll</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'attendance' && styles.activeTab]} onPress={() => setActiveTab('attendance')}>
          <Text style={[styles.tabText, activeTab === 'attendance' && styles.activeTabText]}>Daily Attendance</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'salary' && styles.activeTab]} onPress={() => setActiveTab('salary')}>
          <Text style={[styles.tabText, activeTab === 'salary' && styles.activeTabText]}>Salary Report</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          
          {/* TAB 1: ATTENDANCE */}
          {activeTab === 'attendance' && (
            <View>
              {/* Geofencing Setup Box */}
              <View style={styles.geoBox}>
                <Text style={styles.geoTitle}>📍 Geotagged Attendance System</Text>
                {clinicLat ? (
                  <Text style={styles.geoText}>Clinic coordinates locked. Staff can self-mark their attendance from their mobile phone when they arrive.</Text>
                ) : (
                  <Text style={styles.geoTextWarning}>Clinic location is not set! Staff cannot use mobile attendance.</Text>
                )}
                <TouchableOpacity style={styles.geoBtn} onPress={handleSetClinicLocation}>
                  <Text style={styles.geoBtnText}>Lock Current Location as Clinic Boundary</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Manual Attendance Override for {attendanceDate}</Text>
                
                {staffList.length === 0 ? (
                  <Text style={styles.emptyText}>No staff accounts found.</Text>
                ) : (
                  <>
                    {staffList.map((staff, idx) => (
                      <View key={staff.id} style={styles.attRow}>
                        <Text style={styles.staffName}>{staff.name}</Text>
                        <TouchableOpacity 
                          style={[styles.statusBtn, staff.status === 'PRESENT' ? styles.statusPresent : styles.statusAbsent]}
                          onPress={() => toggleStatus(idx)}
                        >
                          <Text style={styles.statusBtnText}>{staff.status}</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity style={styles.submitBtn} onPress={submitAttendance}>
                      <Text style={styles.submitBtnText}>Save Manual Attendance</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}

          {/* TAB 2: SALARY REPORT */}
          {activeTab === 'salary' && (
            <View>
              <View style={styles.monthSelector}>
                <Text style={styles.monthSelectorLabel}>Report Month: {salaryMonth}</Text>
              </View>

              {salaryReport.length === 0 ? (
                <Text style={styles.emptyText}>No salary data available.</Text>
              ) : (
                salaryReport.map(staff => (
                  <View key={staff.id} style={styles.salaryCard}>
                    <Text style={styles.salaryName}>{staff.name}</Text>
                    <Text style={styles.baseSalary}>Fixed Salary: ₹{staff.monthly_salary} /mo</Text>
                    
                    <View style={styles.divider} />
                    
                    <View style={styles.statsGrid}>
                      <View style={styles.statBox}>
                        <Text style={styles.statVal}>{staff.days_worked}</Text>
                        <Text style={styles.statLabel}>Days Worked</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statVal}>{staff.days_absent}</Text>
                        <Text style={styles.statLabel}>Days Absent</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statVal}>{staff.earned_leaves}</Text>
                        <Text style={styles.statLabel}>Paid Leaves</Text>
                      </View>
                    </View>

                    <View style={styles.calcRow}>
                      <Text style={styles.calcLabel}>Total Payable Days:</Text>
                      <Text style={styles.calcVal}>{staff.payable_days} days</Text>
                    </View>
                    <Text style={styles.note}>(Worked + Paid Leaves)</Text>

                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Estimated Payout:</Text>
                      <Text style={styles.totalVal}>₹ {staff.calculated_salary}</Text>
                    </View>

                    {staff.payable_days > 30 && (
                      <Text style={styles.bonusNote}>* Includes bonus pay for extra days!</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { marginRight: 15 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#5C0B0B' },
  tabText: { fontSize: 16, fontWeight: 'bold', color: '#6b7280' },
  activeTabText: { color: '#5C0B0B' },
  scrollContent: { padding: 15 },
  
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 15 },
  attRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  staffName: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  statusBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
  statusPresent: { backgroundColor: '#10b981' },
  statusAbsent: { backgroundColor: '#ef4444' },
  statusBtnText: { color: '#fff', fontWeight: 'bold' },
  submitBtn: { backgroundColor: '#5C0B0B', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  monthSelector: { backgroundColor: '#fff', padding: 15, borderRadius: 10, elevation: 2, marginBottom: 15, alignItems: 'center' },
  monthSelectorLabel: { fontSize: 16, fontWeight: 'bold', color: '#374151' },
  
  salaryCard: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#3b82f6' },
  salaryName: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  baseSalary: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  statBox: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: 'bold', color: '#1f2937' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  
  calcRow: { flexDirection: 'row', justifyContent: 'space-between' },
  calcLabel: { fontSize: 16, color: '#374151', fontWeight: 'bold' },
  calcVal: { fontSize: 16, color: '#10b981', fontWeight: 'bold' },
  note: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginBottom: 15 },
  
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f0fdf4', padding: 15, borderRadius: 8, marginTop: 5 },
  totalLabel: { fontSize: 18, fontWeight: 'bold', color: '#10b981' },
  totalVal: { fontSize: 18, fontWeight: 'bold', color: '#10b981' },
  bonusNote: { fontSize: 12, color: '#f59e0b', fontWeight: 'bold', marginTop: 10, textAlign: 'center' },
  
  emptyText: { textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', marginTop: 20 },

  geoBox: { backgroundColor: '#f0f9ff', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#bae6fd', marginBottom: 20 },
  geoTitle: { fontSize: 16, fontWeight: 'bold', color: '#0369a1', marginBottom: 5 },
  geoText: { fontSize: 13, color: '#0ea5e9', marginBottom: 10 },
  geoTextWarning: { fontSize: 13, color: '#ef4444', marginBottom: 10, fontWeight: 'bold' },
  geoBtn: { backgroundColor: '#0284c7', padding: 10, borderRadius: 6, alignItems: 'center' },
  geoBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});
