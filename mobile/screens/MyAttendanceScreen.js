import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export default function MyAttendanceScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get('https://skinssence-api.onrender.com/api/staff/my-attendance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAttendance(res.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch attendance history.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={styles.backText}>Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>My Attendance</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <ActivityIndicator size="large" color="#5C0B0B" />
        ) : attendance.length === 0 ? (
          <Text style={styles.emptyText}>No attendance records found.</Text>
        ) : (
          attendance.map((rec, index) => (
            <View key={index} style={styles.card}>
              <Text style={styles.date}>{rec.date}</Text>
              <Text style={[styles.status, rec.status === 'PRESENT' ? styles.present : styles.absent]}>{rec.status}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C0B0B', padding: 20, paddingTop: 50 },
  backBtn: { marginRight: 15 },
  backText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  scrollContent: { padding: 20 },
  emptyText: { textAlign: 'center', color: '#6b7280', marginTop: 20, fontStyle: 'italic' },
  card: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 20, borderRadius: 10, marginBottom: 10, elevation: 1 },
  date: { fontSize: 16, fontWeight: 'bold', color: '#374151' },
  status: { fontSize: 14, fontWeight: 'bold' },
  present: { color: '#10b981' },
  absent: { color: '#ef4444' }
});
