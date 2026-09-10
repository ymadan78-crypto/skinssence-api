import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AllPatientsScreen({ navigation }) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const API_URL = 'https://skinssence-api.onrender.com/api/patients';

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPatients(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const renderPatient = ({ item }) => (
    <TouchableOpacity 
      style={styles.patientCard} 
      onPress={() => navigation.navigate('PatientProfile', { patient: item })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.patientName}>{item.first_name} {item.last_name}</Text>
        <Text style={styles.patientId}>{item.skinssence_id}</Text>
      </View>
      <Text style={styles.patientDetail}>Mobile: {item.mobile}</Text>
      <Text style={styles.patientDetail}>DOB: {item.dob} | City: {item.city}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>All Patients Database</Text>
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>Total Patients: {patients.length}</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={patients}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderPatient}
          contentContainerStyle={styles.listContainer}
          initialNumToRender={20}
          maxToRenderPerBatch={50}
          windowSize={10}
        />
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
  statsBar: { backgroundColor: '#3A0707', padding: 10, alignItems: 'center' },
  statsText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  listContainer: { padding: 15 },
  patientCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  patientName: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  patientId: { fontSize: 14, fontWeight: 'bold', color: '#5C0B0B' },
  patientDetail: { fontSize: 14, color: '#6b7280', marginTop: 2 }
});
