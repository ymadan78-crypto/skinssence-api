import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function AllPatientsScreen({ navigation }) {
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const API_URL = 'https://skinssence-api.onrender.com/api/patients';

  function parsePatientRegistrationTimestamp(dStr) {
    if (!dStr || typeof dStr !== 'string') return 0;
    const s = dStr.trim();
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
      const parts = s.split(' ');
      const dParts = parts[0].split('/');
      const tParts = parts[1] ? parts[1].split(':') : ['00', '00', '00'];
      const dt = new Date(
        parseInt(dParts[2], 10),
        parseInt(dParts[1], 10) - 1,
        parseInt(dParts[0], 10),
        parseInt(tParts[0] || 0, 10),
        parseInt(tParts[1] || 0, 10),
        parseInt(tParts[2] || 0, 10)
      ).getTime();
      return isNaN(dt) ? 0 : dt;
    }
    const t = new Date(s).getTime();
    return isNaN(t) ? 0 : t;
  }

  function formatPatientDate(dStr) {
    if (!dStr) return '';
    const ts = parsePatientRegistrationTimestamp(dStr);
    if (!ts) return String(dStr);
    const d = new Date(ts);
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = Array.isArray(response.data) ? response.data : [];
      // Always show most recently registered/added clients first
      const sorted = [...data].sort((a, b) => {
        const timeA = parsePatientRegistrationTimestamp(a.created_at);
        const timeB = parsePatientRegistrationTimestamp(b.created_at);
        if (timeB !== timeA && timeA > 0 && timeB > 0) {
          return timeB - timeA;
        }
        return (b.id || 0) - (a.id || 0);
      });
      setPatients(sorted);
      setFilteredPatients(sorted);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setFilteredPatients(patients);
      return;
    }
    const q = text.toLowerCase().trim();
    const filtered = patients.filter(p => {
      const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
      const sId = (p.skinssence_id || '').toLowerCase();
      const mobile = (p.mobile || '').toLowerCase();
      const city = (p.city || '').toLowerCase();
      return name.includes(q) || sId.includes(q) || mobile.includes(q) || city.includes(q);
    });
    // Ensure filtered results also preserve newest-first order
    const sortedFiltered = [...filtered].sort((a, b) => {
      const timeA = parsePatientRegistrationTimestamp(a.created_at);
      const timeB = parsePatientRegistrationTimestamp(b.created_at);
      if (timeB !== timeA && timeA > 0 && timeB > 0) {
        return timeB - timeA;
      }
      return (b.id || 0) - (a.id || 0);
    });
    setFilteredPatients(sortedFiltered);
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
      {item.created_at ? (
        <Text style={styles.patientDateTag}>
          Registered: {formatPatientDate(item.created_at)}
        </Text>
      ) : null}
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

      {/* SEARCH BAR */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Filter by name, ID, or mobile..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {searchQuery ? `Matching: ${filteredPatients.length} of ${patients.length}` : `Total Patients: ${patients.length}`} (Newest First)
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filteredPatients}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderPatient}
          contentContainerStyle={styles.listContainer}
          initialNumToRender={20}
          maxToRenderPerBatch={50}
          windowSize={10}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery ? 'No matching patients found.' : 'No patients found.'}
            </Text>
          }
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
  searchSection: { padding: 12, backgroundColor: '#fff', elevation: 2 },
  searchInput: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 12, fontSize: 15 },
  listContainer: { padding: 15 },
  patientCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  patientName: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  patientId: { fontSize: 14, fontWeight: 'bold', color: '#5C0B0B' },
  patientDetail: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  patientDateTag: { fontSize: 12, color: '#15803d', fontWeight: '600', marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#6b7280', fontSize: 15 }
});
