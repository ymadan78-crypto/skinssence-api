import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://skinssence-api.onrender.com/api/leads';

const SOURCES = [
  'Phone Call',
  'WhatsApp',
  'Instagram',
  'Facebook',
  'Google',
  'Website',
  'Referral',
  'Walk-in',
  'Existing Patient Referral',
  'Other'
];

const TREATMENTS = [
  'Laser Hair Removal',
  'HIFU',
  'Hair Treatment',
  'PRP',
  'Acne Treatment',
  'Pigmentation',
  'Medifacial',
  'Skin Rejuvenation',
  'Botox',
  'Fillers',
  'Tattoo Removal',
  'Consultation'
];

export default function AddLeadScreen({ navigation, route }) {
  const initialMobile = route?.params?.initialMobile || '';
  const initialSource = route?.params?.initialSource || 'Phone Call';
  const initialNotes = route?.params?.initialNotes || '';
  const isCallNotesMode = route?.params?.isCallNotesMode || false;

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState(initialMobile);
  const [alternateMobile, setAlternateMobile] = useState('');
  const [source, setSource] = useState(initialSource);
  const [selectedTreatments, setSelectedTreatments] = useState([]);
  const [otherTreatment, setOtherTreatment] = useState('');
  const [notes, setNotes] = useState(initialNotes);
  const [skinConcern, setSkinConcern] = useState('');
  const [hairConcern, setHairConcern] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredVisit, setPreferredVisit] = useState('');
  const [urgency, setUrgency] = useState('Normal');

  // Follow-up State (defaults to 2 days ahead)
  const defaultFollowUp = new Date();
  defaultFollowUp.setDate(defaultFollowUp.getDate() + 2);
  const [followupDate, setFollowupDate] = useState(defaultFollowUp.toISOString().split('T')[0]);
  const [followupTime, setFollowupTime] = useState('11:00 AM');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);

  // Duplicate Check State
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [existingPatientMatch, setExistingPatientMatch] = useState(null);
  const [existingLeadMatch, setExistingLeadMatch] = useState(null);

  // Check duplicate when mobile number reaches 10 digits
  useEffect(() => {
    const clean = mobile.replace(/\D/g, '');
    if (clean.length >= 10) {
      checkDuplicate(clean);
    } else {
      setExistingPatientMatch(null);
      setExistingLeadMatch(null);
    }
  }, [mobile]);

  const checkDuplicate = async (phone) => {
    setCheckingDuplicate(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_BASE}/check-duplicate?mobile=${phone}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setExistingPatientMatch(res.data.existingPatient);
        setExistingLeadMatch(res.data.existingLead);
      }
    } catch (e) {
      console.log('Duplicate check error:', e);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const toggleTreatment = (t) => {
    if (selectedTreatments.includes(t)) {
      setSelectedTreatments(selectedTreatments.filter(item => item !== t));
    } else {
      setSelectedTreatments([...selectedTreatments, t]);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      return Alert.alert('Missing Field', 'Please enter caller or enquiry name.');
    }
    if (!mobile.trim() || mobile.replace(/\D/g, '').length < 10) {
      return Alert.alert('Invalid Mobile', 'Please enter a valid 10-digit mobile number.');
    }

    const allTreatments = [...selectedTreatments];
    if (otherTreatment.trim()) {
      allTreatments.push(otherTreatment.trim());
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        name: name.trim(),
        mobile: mobile.trim(),
        alternate_mobile: alternateMobile.trim() || null,
        source,
        treatment_interest: allTreatments,
        skin_concern: skinConcern.trim() || null,
        hair_concern: hairConcern.trim() || null,
        notes: notes.trim() || null,
        budget_info: budget.trim() || null,
        preferred_visit_timing: preferredVisit.trim() || null,
        urgency,
        followup_date: followupDate || null,
        followup_time: followupTime || '11:00 AM'
      };

      const res = await axios.post(API_BASE, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      Alert.alert(
        'Lead Created',
        `Potential Client registered with Lead ID: ${res.data.lead_id}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to save lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isCallNotesMode ? '📝 Record Enquiry & Call Notes' : '+ New Client Enquiry'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* DUPLICATE WARNING BANNERS */}
        {existingPatientMatch && (
          <View style={styles.duplicatePatientBanner}>
            <Text style={styles.dupTitle}>⚠️ Existing Registered Patient Found</Text>
            <Text style={styles.dupDetail}>
              {existingPatientMatch.name} ({existingPatientMatch.skinssence_id}) is already a registered patient with this mobile number.
            </Text>
            <Text style={styles.dupHint}>
              Note: This enquiry will be recorded as a Lead without modifying the patient record.
            </Text>
          </View>
        )}

        {existingLeadMatch && (
          <View style={styles.duplicateLeadBanner}>
            <Text style={styles.dupTitle}>ℹ️ Existing Lead Found</Text>
            <Text style={styles.dupDetail}>
              {existingLeadMatch.name} ({existingLeadMatch.lead_id}) has an existing enquiry with status: "{existingLeadMatch.status}".
            </Text>
          </View>
        )}

        {/* 1. CORE ESSENTIALS (DEFAULT OPEN) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Core Enquirer Information</Text>

          <Text style={styles.label}>Caller / Client Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Anita Sharma"
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.label}>Mobile Number *</Text>
          <View style={{ position: 'relative' }}>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9829012345"
              keyboardType="phone-pad"
              value={mobile}
              onChangeText={setMobile}
              maxLength={15}
            />
            {checkingDuplicate && (
              <ActivityIndicator size="small" color="#5C0B0B" style={styles.inputLoader} />
            )}
          </View>

          <Text style={styles.label}>Enquiry Source</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
            {SOURCES.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, source === s && styles.chipSelected]}
                onPress={() => setSource(s)}
              >
                <Text style={[styles.chipText, source === s && styles.chipTextSelected]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.label}>Treatment Interest (Select all that apply)</Text>
          <View style={styles.chipGrid}>
            {TREATMENTS.map((t) => {
              const isSelected = selectedTreatments.includes(t);
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => toggleTreatment(t)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {isSelected ? '✓ ' : ''}{t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[styles.input, { marginTop: 6 }]}
            placeholder="Other treatment interest (optional)..."
            value={otherTreatment}
            onChangeText={setOtherTreatment}
          />

          <Text style={styles.label}>📝 Written Conversation Summary / Call Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Enter staff's written summary from the call (pricing discussed, treatment asked, doubts). Note: Audio is recorded by the phone's native recorder."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* 2. FOLLOW-UP & PRIORITY (DEFAULT OPEN) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Follow-up Schedule & Urgency</Text>
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={followupDate}
                onChangeText={setFollowupDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Time</Text>
              <TextInput
                style={styles.input}
                value={followupTime}
                onChangeText={setFollowupTime}
                placeholder="11:00 AM"
              />
            </View>
          </View>

          <Text style={styles.label}>Urgency</Text>
          <View style={styles.chipGrid}>
            {['Normal', 'High', 'Immediate', 'Low'].map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.chip, urgency === u && styles.chipSelected]}
                onPress={() => setUrgency(u)}
              >
                <Text style={[styles.chipText, urgency === u && styles.chipTextSelected]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 3. OPTIONAL ADVANCED INTAKE (COLLAPSIBLE ACCORDION) */}
        <TouchableOpacity 
          style={styles.accordionToggle} 
          onPress={() => setShowAdvanced(!showAdvanced)}>
          <Text style={styles.accordionToggleText}>
            {showAdvanced ? '▲ Hide Intake Details' : '▼ Add Intake Details (Skin/Hair Concerns, Budget, Timing)'}
          </Text>
        </TouchableOpacity>

        {showAdvanced && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Detailed Intake (Optional)</Text>

            <Text style={styles.label}>Alternate Mobile</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 9829099999"
              keyboardType="phone-pad"
              value={alternateMobile}
              onChangeText={setAlternateMobile}
            />

            <Text style={styles.label}>Specific Skin Concern</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Melasma, Active acne, Open pores"
              value={skinConcern}
              onChangeText={setSkinConcern}
            />

            <Text style={styles.label}>Specific Hair Concern</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Receding hairline, Hair fall"
              value={hairConcern}
              onChangeText={setHairConcern}
            />

            <Text style={styles.label}>Preferred Visit Timing</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Next week Tuesday evening / Weekend"
              value={preferredVisit}
              onChangeText={setPreferredVisit}
            />

            <Text style={styles.label}>Budget Information (if stated)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Around ₹15,000 / Flexible"
              value={budget}
              onChangeText={setBudget}
            />
          </View>
        )}

        {/* SUBMIT BUTTON */}
        <TouchableOpacity 
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isCallNotesMode ? '💾 Save Call Notes & Potential Client' : '💾 Save Potential Client Lead'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: {
    backgroundColor: '#5C0B0B',
    paddingTop: 45,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  backText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scrollContent: { padding: 16, paddingBottom: 50 },
  duplicatePatientBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#f59e0b',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  duplicateLeadBanner: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  dupTitle: { fontSize: 13, fontWeight: 'bold', color: '#92400e', marginBottom: 2 },
  dupDetail: { fontSize: 12, color: '#1e293b', marginBottom: 4 },
  dupHint: { fontSize: 11, color: '#64748b', fontStyle: 'italic' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: '#1e293b', marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#1e293b',
  },
  textArea: { height: 75, textAlignVertical: 'top' },
  inputLoader: { position: 'absolute', right: 12, top: 12 },
  chipScroll: { flexDirection: 'row', marginVertical: 4 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 4 },
  chip: {
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipSelected: {
    backgroundColor: '#5C0B0B',
    borderColor: '#5C0B0B',
  },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  chipTextSelected: { color: '#fff', fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center' },
  accordionToggle: {
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  accordionToggleText: { color: '#2563eb', fontWeight: '600', fontSize: 13 },
  submitBtn: {
    backgroundColor: '#5C0B0B',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    elevation: 2,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
