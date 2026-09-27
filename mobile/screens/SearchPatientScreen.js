import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SearchPatientScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const API_URL = 'https://skinssence-api.onrender.com/api/patients/search';

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

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(`${API_URL}?query=${encodeURIComponent(query)}`, {
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
      setResults(sorted);
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
        <Text style={styles.headerTitle}>Search Patients</Text>
      </View>

      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by ID, Name, or Mobile..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderPatient}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            query && !loading ? <Text style={styles.emptyText}>No patients found.</Text> : null
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
  searchSection: { flexDirection: 'row', padding: 15, backgroundColor: '#fff', elevation: 2 },
  searchInput: { flex: 1, backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 12, fontSize: 16, marginRight: 10 },
  searchBtn: { backgroundColor: '#5C0B0B', paddingHorizontal: 20, justifyContent: 'center', borderRadius: 8 },
  searchBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  listContainer: { padding: 15 },
  patientCard: { backgroundColor: '#fff', padding: 15, borderRadius: 10, marginBottom: 10, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  patientName: { fontSize: 18, fontWeight: 'bold', color: '#1f2937' },
  patientId: { fontSize: 14, fontWeight: 'bold', color: '#5C0B0B' },
  patientDetail: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  patientDateTag: { fontSize: 12, color: '#15803d', fontWeight: '600', marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#6b7280', fontSize: 16 }
});
