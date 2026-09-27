import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, Alert } from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function UpcomingEventsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [activeTab, setActiveTab] = useState('events'); // 'events' or 'festivals'
  const [festivalType, setFestivalType] = useState('Raksha Bandhan'); 
  const [festivalPatients, setFestivalPatients] = useState([]);

  const API_URL = 'https://skinssence-api.onrender.com/api/events/upcoming';

  useEffect(() => {
    if (activeTab === 'events') fetchEvents();
    else fetchFestivalData(festivalType);
  }, [activeTab, festivalType]);

  const fetchFestivalData = async (type) => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const rel = type === 'Eid' ? 'muslim' : 'hindu';
      const res = await axios.get(`https://skinssence-api.onrender.com/api/events/festival/${rel}`, { headers: { Authorization: `Bearer ${token}` } });
      setFestivalPatients(res.data);
    } catch (err) { console.log(err); } finally { setLoading(false); }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await axios.get(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEvents(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleWhatsApp = (mobile, type, name) => {
    if (!mobile) return Alert.alert('Error', 'No mobile number found.');
    let message = '';
    
    const gmbLink = "\n\n📍 Visit us / Leave a Review:\nhttps://maps.app.goo.gl/isSTuVrYSsRjpKqj9";

    if (type === 'Eid') {
      message = `Dear ${name},\n\nToday, we celebrate the birth of Prophet Muhammad (PBUH) and remember his life, his character, and his message of compassion, kindness and peaceful coexistence.\n\nMay this blessed occasion of Eid-e-Milad bring peace, happiness and goodness to you and your family.\n\nWarm wishes,\nTeam Skinssence` + gmbLink;
    } else if (type === 'Raksha Bandhan') {
      message = `Dear ${name},\n\nHappy Raksha Bandhan! May the beautiful bond of love, protection, and care between siblings grow stronger this year. We wish you immense joy, prosperity, and wonderful moments with your family.\n\nWarm wishes,\nTeam Skinssence` + gmbLink;
    } else if (type.includes('Birthday')) {
      message = `Dear ${name},\n\nWishing you a beautiful and joyous Birthday in advance from Dr. Ashima and the entire Skinssence family! We hope your special day is filled with love, laughter, and happiness.\n\nWhenever you are ready to treat yourself and pamper your skin for your special day, we are always here for you.\n\nWarmest regards,\nSkinssence Clinic` + gmbLink;
    } else if (type.includes('Anniversary')) {
      message = `Dear ${name},\n\nWishing you a wonderful Anniversary in advance from Dr. Ashima and the Skinssence family! May this special milestone bring you endless joy and beautiful memories.\n\nIf you'd like to treat yourselves and glow on your special day, we would love to pamper you.\n\nWarmest regards,\nSkinssence Clinic` + gmbLink;
    } else {
      message = `Dear ${name},\n\nWe noticed your special event is just around the corner! Dr. Ashima and the Skinssence family wish you all the joy and happiness for your big day.\n\nIf you need a moment to relax and get that perfect radiant glow before the event, please let us know. We are always here to pamper you.\n\nWarmest regards,\nSkinssence Clinic` + gmbLink;
    }
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}&phone=91${mobile}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upcoming Events</Text>
      </View>
      <View style={{flexDirection: 'row', backgroundColor: '#fff' }}>
        <TouchableOpacity style={[{flex: 1, padding: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent'}, activeTab === 'events' && {borderBottomColor: '#5C0B0B'}]} onPress={() => setActiveTab('events')}>
          <Text style={[{fontWeight: 'bold', color: '#6b7280'}, activeTab === 'events' && {color: '#5C0B0B'}]}>Birthdays & Events</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[{flex: 1, padding: 15, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent'}, activeTab === 'festivals' && {borderBottomColor: '#5C0B0B'}]} onPress={() => setActiveTab('festivals')}>
          <Text style={[{fontWeight: 'bold', color: '#6b7280'}, activeTab === 'festivals' && {color: '#5C0B0B'}]}>Festivals</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#5C0B0B" style={{ marginTop: 50 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {activeTab === 'festivals' ? (
            <>
              <View style={{flexDirection: 'row', justifyContent: 'center', marginBottom: 15}}>
                <TouchableOpacity style={{backgroundColor: festivalType==='Eid' ? '#5C0B0B' : '#e5e7eb', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, marginRight: 10}} onPress={() => setFestivalType('Eid')}>
                  <Text style={{color: festivalType==='Eid' ? '#fff' : '#4b5563', fontWeight: 'bold'}}>Eid-e-Milad</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{backgroundColor: festivalType==='Raksha Bandhan' ? '#5C0B0B' : '#e5e7eb', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20}} onPress={() => setFestivalType('Raksha Bandhan')}>
                  <Text style={{color: festivalType==='Raksha Bandhan' ? '#fff' : '#4b5563', fontWeight: 'bold'}}>Raksha Bandhan</Text>
                </TouchableOpacity>
              </View>

              {festivalPatients.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No clients identified for {festivalType} greetings.</Text>
                </View>
              ) : (
                festivalPatients.map((p, idx) => (
                  <View key={idx} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.eventType}>{festivalType} Greeting</Text>
                      <Text style={styles.daysAway}>Identified by Name</Text>
                    </View>
                    <Text style={styles.patientName}>{p.first_name} {p.last_name}</Text>
                    <Text style={styles.patientDetails}>Mobile: {p.mobile}</Text>
                    
                    <TouchableOpacity style={styles.waBtn} onPress={() => handleWhatsApp(p.mobile, festivalType, p.first_name)}>
                      <Text style={styles.waBtnText}>Send WhatsApp Greeting</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          ) : events.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No upcoming birthdays or events in the next 10 days.</Text>
            </View>
          ) : (
            events.map((evt, idx) => (
              <View key={idx} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.eventType}>{evt.type}</Text>
                  <Text style={styles.daysAway}>
                    {evt.days_away === 0 ? 'TODAY!' : `in ${evt.days_away} days`}
                  </Text>
                </View>
                
                <Text style={styles.patientName}>{evt.patient_name}</Text>
                <Text style={styles.patientDetails}>ID: {evt.skinssence_id} | 📞 {evt.mobile}</Text>
                <Text style={styles.dateText}>Date: {evt.date}</Text>

                <TouchableOpacity 
                  style={styles.whatsappBtn} 
                  onPress={() => handleWhatsApp(evt.mobile, evt.type, evt.patient_name)}
                >
                  <Text style={styles.whatsappText}>💬 Send WhatsApp Offer</Text>
                </TouchableOpacity>
              </View>
            ))
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
  scrollContent: { padding: 15 },
  emptyBox: { backgroundColor: '#fff', padding: 30, borderRadius: 10, alignItems: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: '#ccc' },
  emptyText: { color: '#9ca3af', fontSize: 16, textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 2, marginBottom: 15, borderLeftWidth: 5, borderLeftColor: '#f59e0b' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  eventType: { fontSize: 16, fontWeight: 'bold', color: '#f59e0b' },
  daysAway: { fontSize: 16, fontWeight: 'bold', color: '#ef4444' },
  patientName: { fontSize: 20, fontWeight: 'bold', color: '#1f2937', marginBottom: 5 },
  patientDetails: { fontSize: 14, color: '#4b5563', marginBottom: 5 },
  dateText: { fontSize: 14, color: '#6b7280', fontStyle: 'italic', marginBottom: 15 },
  whatsappBtn: { backgroundColor: '#25D366', padding: 12, borderRadius: 8, alignItems: 'center' },
  whatsappText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
