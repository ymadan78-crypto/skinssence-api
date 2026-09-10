import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function StaffCollectionScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [collections, setCollections] = useState([]);
  const [breakdown, setBreakdown] = useState({
    procedure_collection: 0,
    medicine_collection: 0,
    total_collection: 0
  });
  
  const API_URL = 'https://skinssence-api.onrender.com/api/staff/collection/today';

  useEffect(() => {
    fetchCollection();
  }, []);

  const fetchCollection = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(`${API_URL}?breakdown=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(response.data)) {
        setCollections(response.data);
      } else if (response.data && response.data.modes) {
        setCollections(response.data.modes);
        setBreakdown({
          procedure_collection: response.data.procedure_collection || 0,
          medicine_collection: response.data.medicine_collection || 0,
          total_collection: response.data.total_collection || 0
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const totalCash = collections
    .filter(item => item.mode && item.mode.toLowerCase() === 'cash')
    .reduce((sum, item) => sum + item.total, 0);

  const totalOnline = collections
    .filter(item => item.mode && item.mode.toLowerCase() !== 'cash')
    .reduce((sum, item) => sum + item.total, 0);

  const grandTotal = totalCash + totalOnline;
  const effectiveTotal = breakdown.total_collection || grandTotal;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Collection & Deposit</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* REVENUE STREAM BREAKDOWN */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Collection Breakdown</Text>
            
            <View style={styles.row}>
              <View style={styles.labelGroup}>
                <Text style={styles.icon}>🏥</Text>
                <Text style={styles.label}>Procedure Collection:</Text>
              </View>
              <Text style={styles.value}>₹ {breakdown.procedure_collection.toFixed(2)}</Text>
            </View>

            <View style={styles.row}>
              <View style={styles.labelGroup}>
                <Text style={styles.icon}>💊</Text>
                <Text style={styles.label}>Medicine / Pharmacy Collection:</Text>
              </View>
              <Text style={styles.value}>₹ {breakdown.medicine_collection.toFixed(2)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={[styles.row, { paddingVertical: 4, backgroundColor: '#fef2f2', paddingHorizontal: 10, borderRadius: 8 }]}>
              <View style={styles.labelGroup}>
                <Text style={styles.icon}>💰</Text>
                <Text style={styles.labelGrand}>Total Collection:</Text>
              </View>
              <Text style={styles.valueGrand}>₹ {effectiveTotal.toFixed(2)}</Text>
            </View>
          </View>

          {/* PAYMENT MODE & CASH DEPOSIT TALLY */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment Modes Settlement</Text>
            
            {collections.length === 0 ? (
              <Text style={styles.emptyText}>No collections recorded today.</Text>
            ) : (
              collections.map((item, index) => (
                <View key={index} style={styles.row}>
                  <Text style={styles.label}>{item.mode}:</Text>
                  <Text style={styles.value}>₹ {item.total.toFixed(2)}</Text>
                </View>
              ))
            )}

            <View style={styles.divider} />
            
            <View style={styles.row}>
              <Text style={styles.labelTotalOnline}>Total Online (Bank / UPI):</Text>
              <Text style={styles.valueTotalOnline}>₹ {totalOnline.toFixed(2)}</Text>
            </View>

            <View style={[styles.row, { marginTop: 10, padding: 10, backgroundColor: '#f0fdf4', borderRadius: 8 }]}>
              <Text style={styles.labelTotalCash}>Physical Cash to Deposit:</Text>
              <Text style={styles.valueTotalCash}>₹ {totalCash.toFixed(2)}</Text>
            </View>
            
            <View style={[styles.row, { marginTop: 15 }]}>
              <Text style={styles.labelGrand}>Modes Total:</Text>
              <Text style={styles.valueGrand}>₹ {grandTotal.toFixed(2)}</Text>
            </View>
          </View>
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
  scrollContent: { padding: 15 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, marginBottom: 20 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  labelGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  icon: { fontSize: 16, marginRight: 8 },
  label: { fontSize: 15, color: '#4b5563', fontWeight: '600' },
  value: { fontSize: 16, color: '#1f2937', fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 15 },
  labelTotalOnline: { fontSize: 15, color: '#3b82f6', fontWeight: 'bold' },
  valueTotalOnline: { fontSize: 16, color: '#3b82f6', fontWeight: 'bold' },
  labelTotalCash: { fontSize: 16, color: '#10b981', fontWeight: 'bold' },
  valueTotalCash: { fontSize: 18, color: '#10b981', fontWeight: 'bold' },
  labelGrand: { fontSize: 16, color: '#5C0B0B', fontWeight: 'bold' },
  valueGrand: { fontSize: 18, color: '#5C0B0B', fontWeight: 'bold' },
  emptyText: { color: '#9ca3af', fontStyle: 'italic', marginBottom: 10 }
});

