import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateFollowUpMessage } from '../utils/whatsappHelper';

export default function AppointmentCalendarScreen({ navigation, route }) {
  const [loading, setLoading] = useState(false);
  
  // Date selection (defaults to today)
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [appointments, setAppointments] = useState([]);
  
  // Follow-up Purpose Presets
  const [purposeType, setPurposeType] = useState('Follow-up Consultation');
  const [customNotes, setCustomNotes] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    patient_name: route.params?.patient?.first_name 
      ? `${route.params.patient.first_name} ${route.params.patient.last_name || ''}`.trim() 
      : (route.params?.lead?.name || ''),
    mobile: route.params?.patient?.mobile || (route.params?.lead?.mobile || ''),
    patient_id: route.params?.patient?.skinssence_id || (route.params?.lead?.lead_id || ''),
    appointment_time: '11:00 AM'
  });


  const generateTimeSlots = (dateStr) => {
    const isSunday = new Date(dateStr).getDay() === 0;
    
    const formatTime = (hour, min) => {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const h = hour % 12 || 12;
      const m = min.toString().padStart(2, '0');
      return `${h}:${m} ${ampm}`;
    };

    const slots = [];
    
    // Morning Session: 11:00 AM to 1:30 PM
    let h = 11, m = 0;
    while (h < 13 || (h === 13 && m <= 30)) {
      slots.push(formatTime(h, m));
      m += 10;
      if (m >= 60) { m -= 60; h += 1; }
    }

    // Evening Session: 4:30 PM to 7:30 PM (Skip if Sunday)
    if (!isSunday) {
      let eh = 16, em = 30;
      while (eh < 19 || (eh === 19 && em <= 30)) {
        slots.push(formatTime(eh, em));
        em += 10;
        if (em >= 60) { em -= 60; eh += 1; }
      }
    }
    return slots;
  };

  const timeSlots = generateTimeSlots(selectedDate);
  const API_URL = 'https://skinssence-api.onrender.com/api/appointments';

  useEffect(() => {
    fetchAppointmentsForDate(selectedDate);
  }, [selectedDate]);

  const fetchAppointmentsForDate = async (dateStr) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_URL}?date=${dateStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAppointments(res.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAutoFill = async () => {
    if (!formData.patient_id) return;
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`https://skinssence-api.onrender.com/api/patients/by-snumber/${formData.patient_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setFormData(prev => ({
          ...prev,
          patient_name: `${res.data.first_name} ${res.data.last_name || ''}`.trim(),
          mobile: res.data.mobile
        }));
      }
    } catch (e) {
      console.log('Patient not found for auto-fill');
    }
  };

  const getCombinedNotes = () => {
    if (customNotes.trim()) return `${purposeType}: ${customNotes.trim()}`;
    return purposeType;
  };

  const handleBook = async (sendWhatsAppAfter = false) => {
    if (!formData.patient_name || !formData.mobile) {
      Alert.alert('Error', 'Name and Mobile are required.');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const combinedNotes = getCombinedNotes();
      
      const apptPayload = {
        patient_id: formData.patient_id,
        patient_name: formData.patient_name,
        mobile: formData.mobile,
        appointment_date: selectedDate,
        appointment_time: formData.appointment_time,
        notes: combinedNotes,
        status: purposeType === 'Confirmed Appointment' ? 'CONFIRMED' : 'SCHEDULED'
      };

      await axios.post(API_URL, apptPayload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (route.params?.returnToBilling && route.params?.visit) {
        Alert.alert(
          'Appointment Booked!',
          `Follow-up booked for ${selectedDate}! Returning to bill generation...`,
          [
            {
              text: 'Generate Bill Now',
              onPress: () => {
                navigation.navigate('PatientProfile', {
                  patient: route.params.patient,
                  autoPrintVisitId: route.params.visit.visit_id
                });
              }
            }
          ]
        );
        return;
      }

      if (sendWhatsAppAfter) {
        const msg = generateFollowUpMessage(apptPayload);
        const cleanMobile = formData.mobile.replace(/\D/g, '');
        const phoneWithCode = cleanMobile.startsWith('91') ? cleanMobile : `91${cleanMobile}`;
        Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}&phone=${phoneWithCode}`);
      } else {
        Alert.alert('Success', `Follow-up / Appointment booked for ${selectedDate}!`);
      }

      setFormData(prev => ({ ...prev, patient_name: '', mobile: '', patient_id: '' }));
      setCustomNotes('');
      fetchAppointmentsForDate(selectedDate);
    } catch (error) {
      Alert.alert('Error', 'Could not book appointment.');
    } finally {
      setLoading(false);
    }
  };

  // Preset Days offset button
  const setDateByOffset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const shiftDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Preview message
  const previewAppt = {
    patient_name: formData.patient_name || 'Client Name',
    appointment_date: selectedDate,
    appointment_time: formData.appointment_time,
    notes: getCombinedNotes(),
    status: purposeType === 'Confirmed Appointment' ? 'CONFIRMED' : 'SCHEDULED'
  };
  const previewMsg = generateFollowUpMessage(previewAppt);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Follow-up & Appt Calendar</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* QUICK INTERVAL CHIPS */}
        <View style={styles.quickIntervalSection}>
          <Text style={styles.quickIntervalTitle}>Quick Follow-up Interval:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
            {[
              { label: 'Today', days: 0 },
              { label: '+7 Days', days: 7 },
              { label: '+14 Days', days: 14 },
              { label: '+21 Days', days: 21 },
              { label: '+28 Days', days: 28 },
              { label: '+30 Days', days: 30 },
              { label: '+45 Days', days: 45 },
              { label: '+60 Days', days: 60 }
            ].map(item => (
              <TouchableOpacity key={item.label} style={styles.intervalChip} onPress={() => setDateByOffset(item.days)}>
                <Text style={styles.intervalChipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Date Selector */}
        <View style={styles.dateSelector}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => shiftDate(-1)}><Text style={styles.dateBtnText}>◀ Prev</Text></TouchableOpacity>
          <Text style={styles.dateDisplay}>{new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => shiftDate(1)}><Text style={styles.dateBtnText}>Next ▶</Text></TouchableOpacity>
        </View>

        {/* Booking Form */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Book Follow-up / Appointment</Text>
          
          <Text style={styles.label}>Patient S Number (Auto-fills name & phone)</Text>
          <TextInput 
            style={styles.input} 
            value={formData.patient_id} 
            onChangeText={(v) => setFormData({...formData, patient_id: v})} 
            onEndEditing={handleAutoFill}
            placeholder="e.g., 3000-5" 
          />

          <Text style={styles.label}>Patient Name *</Text>
          <TextInput style={styles.input} value={formData.patient_name} onChangeText={(v) => setFormData({...formData, patient_name: v})} placeholder="Client name" />

          <Text style={styles.label}>Mobile Number *</Text>
          <TextInput style={styles.input} keyboardType="phone-pad" value={formData.mobile} onChangeText={(v) => setFormData({...formData, mobile: v})} placeholder="e.g. 9509197578" />

          <Text style={styles.label}>Purpose of Follow-up:</Text>
          <View style={styles.purposeRow}>
            {[
              'Follow-up Consultation',
              'Next Session (Package)',
              'Post-Procedure Review',
              'Confirmed Appointment'
            ].map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.purposeChip, purposeType === type && styles.purposeChipActive]}
                onPress={() => setPurposeType(type)}>
                <Text style={[styles.purposeChipText, purposeType === type && styles.purposeChipTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Treatment / Details (e.g. Acne Follow-up, Hydrafacial Session 2)</Text>
          <TextInput 
            style={styles.input} 
            value={customNotes} 
            onChangeText={setCustomNotes} 
            placeholder="e.g. Acne follow-up / Hydrafacial session 2" 
          />

          <Text style={styles.label}>Select Slot / Time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.slotScroll}>
            {timeSlots.map(time => (
              <TouchableOpacity 
                key={time} 
                style={[styles.slotBtn, formData.appointment_time === time && styles.slotBtnActive]} 
                onPress={() => setFormData({...formData, appointment_time: time})}>
                <Text style={[styles.slotText, formData.appointment_time === time && styles.slotTextActive]}>{time}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* REAL-TIME WHATSAPP MESSAGE PREVIEW */}
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>💬 Generated WhatsApp Message:</Text>
            <Text style={styles.previewBody}>{previewMsg}</Text>
          </View>

          {/* ACTION BUTTONS */}
          <TouchableOpacity style={styles.bookAndSendBtn} onPress={() => handleBook(true)} disabled={loading}>
            <Text style={styles.bookAndSendText}>📲 Book & Send WhatsApp Confirmation</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.bookOnlyBtn} onPress={() => handleBook(false)} disabled={loading}>
            <Text style={styles.bookOnlyText}>✓ Book Follow-up Only</Text>
          </TouchableOpacity>
        </View>

        {/* Existing Appointments for Date */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Appointments on {selectedDate} ({appointments.length})</Text>
          {appointments.length === 0 ? (
            <Text style={styles.emptyText}>No appointments booked for this date yet.</Text>
          ) : (
            appointments.map(a => (
              <View key={a.id} style={styles.apptRow}>
                <View style={{flex: 1}}>
                  <Text style={styles.apptTime}>{a.appointment_time}</Text>
                  <Text style={styles.apptName}>{a.patient_name} {a.patient_id ? `(${a.patient_id})` : ''}</Text>
                  {a.notes ? <Text style={styles.apptNotes}>• {a.notes}</Text> : null}
                  <Text style={{fontSize: 12, color: '#059669', marginTop: 2}}>📞 {a.mobile}</Text>
                </View>
                <TouchableOpacity 
                  style={styles.waIconBtn} 
                  onPress={() => {
                    const msg = generateFollowUpMessage(a);
                    const cleanMobile = a.mobile.replace(/\D/g, '');
                    const phoneWithCode = cleanMobile.startsWith('91') ? cleanMobile : `91${cleanMobile}`;
                    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}&phone=${phoneWithCode}`);
                  }}>
                  <Text style={styles.waIconText}>💬 WA</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

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
  scrollContent: { padding: 15, paddingBottom: 40 },
  quickIntervalSection: { backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 12, elevation: 1 },
  quickIntervalTitle: { fontSize: 13, fontWeight: 'bold', color: '#5C0B0B' },
  intervalChip: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 6 },
  intervalChipText: { color: '#991b1b', fontSize: 12, fontWeight: 'bold' },
  dateSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 15, elevation: 1 },
  dateBtn: { padding: 8 },
  dateBtnText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 15 },
  dateDisplay: { fontSize: 15, fontWeight: 'bold', color: '#1f2937' },
  card: { backgroundColor: '#fff', padding: 16, borderRadius: 10, elevation: 2, marginBottom: 15 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 5 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 4, marginTop: 10 },
  input: { backgroundColor: '#f9fafc', borderWidth: 1, borderColor: '#e1e5eb', borderRadius: 8, padding: 10, fontSize: 15 },
  purposeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  purposeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  purposeChipActive: { backgroundColor: '#5C0B0B', borderColor: '#5C0B0B' },
  purposeChipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  purposeChipTextActive: { color: '#fff', fontWeight: 'bold' },
  slotScroll: { flexDirection: 'row', marginVertical: 8 },
  slotBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: '#f3f4f6', marginRight: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  slotBtnActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  slotText: { color: '#4b5563', fontSize: 12, fontWeight: '600' },
  slotTextActive: { color: '#fff', fontWeight: 'bold' },
  previewBox: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 12, marginTop: 12, marginBottom: 12 },
  previewTitle: { fontSize: 12, fontWeight: 'bold', color: '#15803d', marginBottom: 4 },
  previewBody: { fontSize: 12, color: '#1f2937', lineHeight: 17, fontStyle: 'italic' },
  bookAndSendBtn: { backgroundColor: '#25D366', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  bookAndSendText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  bookOnlyBtn: { backgroundColor: '#f3f4f6', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db' },
  bookOnlyText: { color: '#374151', fontSize: 14, fontWeight: 'bold' },
  emptyText: { color: '#9ca3af', fontStyle: 'italic', marginVertical: 10 },
  apptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  apptTime: { fontSize: 13, fontWeight: 'bold', color: '#5C0B0B' },
  apptName: { fontSize: 15, fontWeight: 'bold', color: '#111827' },
  apptNotes: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  waIconBtn: { backgroundColor: '#dcfce7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  waIconText: { color: '#15803d', fontWeight: 'bold', fontSize: 12 }
});
