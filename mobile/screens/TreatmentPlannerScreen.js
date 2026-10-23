import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  generatePrebridalProtocolPdfAsync,
  sharePrebridalToWhatsAppAsync
} from '../utils/prebridalPdf';

const CLOUD_URL = 'https://skinssence-api.onrender.com';

export default function TreatmentPlannerScreen({ navigation, route }) {
  const { patient, existingPlan } = route.params || {};

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [masterProcedures, setMasterProcedures] = useState([]);
  const [planId, setPlanId] = useState(existingPlan?.id || null);

  // Form State
  const [planTitle, setPlanTitle] = useState(
    existingPlan?.plan_title || 'Customised Royal Pre-Bridal Glow Protocol'
  );
  const [eventName, setEventName] = useState(existingPlan?.event_name || 'Wedding');
  
  // Default target date: patient's event_date or 45 days from today
  const [targetEventDate, setTargetEventDate] = useState(() => {
    if (existingPlan?.target_event_date) return new Date(existingPlan.target_event_date);
    if (patient?.event_date) {
      const d = new Date(patient.event_date);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date();
    d.setDate(d.getDate() + 45);
    return d;
  });
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);

  // Commercials
  const [totalEstimatedValue, setTotalEstimatedValue] = useState(
    existingPlan?.total_estimated_value ? String(existingPlan.total_estimated_value) : ''
  );
  const [agreedPackagePrice, setAgreedPackagePrice] = useState(
    existingPlan?.agreed_package_price ? String(existingPlan.agreed_package_price) : ''
  );
  const [advanceAmount, setAdvanceAmount] = useState(
    existingPlan?.advance_amount ? String(existingPlan.advance_amount) : ''
  );
  const [paymentTerms, setPaymentTerms] = useState(
    existingPlan?.payment_terms || '50% Advance at booking, balance 50% at Milestone 2'
  );
  const [doctorNotes, setDoctorNotes] = useState(
    existingPlan?.doctor_notes || 'Patient advised strict compliance with homecare protocol and appointment timings for optimal bridal glow.'
  );

  // Milestones State
  const [milestones, setMilestones] = useState(() => {
    if (existingPlan?.milestones && existingPlan.milestones.length > 0) {
      return existingPlan.milestones.map((m, idx) => ({
        id: m.id || `temp_${Date.now()}_${idx}`,
        sequence_order: m.sequence_order || (idx + 1),
        milestone_title: m.milestone_title || `Step ${idx + 1}`,
        target_date: m.target_date ? new Date(m.target_date) : new Date(),
        days_before_event: m.days_before_event || 0,
        procedures: Array.isArray(m.procedures) ? m.procedures : [],
        notes: m.notes || '',
        status: m.status || 'PLANNED'
      }));
    }
    // Default 3 initial sequenced milestones
    const today = new Date();
    const d1 = new Date(today);
    d1.setDate(d1.getDate() + 7);
    const d2 = new Date(today);
    d2.setDate(d2.getDate() + 21);
    const d3 = new Date(today);
    d3.setDate(d3.getDate() + 40);

    return [
      {
        id: 'm_1',
        sequence_order: 1,
        milestone_title: 'Step 1: Deep Clarification, Exfoliation & Priming',
        target_date: d1,
        days_before_event: 38,
        procedures: [{ name: 'BODY POLISHING', area: 'Full Body' }, { name: 'HYDRAFACIAL', area: 'Face' }],
        notes: 'Strict sun protection SPF 50; drink 3L water daily',
        status: 'PLANNED'
      },
      {
        id: 'm_2',
        sequence_order: 2,
        milestone_title: 'Step 2: Texture Correction, Collagen & Radiance',
        target_date: d2,
        days_before_event: 24,
        procedures: [{ name: 'LASER FACIAL', area: 'Face & Neck' }, { name: 'LIP LASER', area: 'Lips' }],
        notes: 'Pause active serums 3 days before session',
        status: 'PLANNED'
      },
      {
        id: 'm_3',
        sequence_order: 3,
        milestone_title: 'Step 3: Final Bridal Glass Glow (Zero Downtime)',
        target_date: d3,
        days_before_event: 5,
        procedures: [{ name: 'WATERLESS FACIAL', area: 'Face' }, { name: 'KORIAN HAIR SPA', area: 'Scalp' }],
        notes: 'Gentle hydration only; ready for wedding ceremony',
        status: 'PLANNED'
      }
    ];
  });

  // Procedure Picker Modal State
  const [procModalVisible, setProcModalVisible] = useState(false);
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(null);
  const [procSearchQ, setProcSearchQ] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customProcName, setCustomProcName] = useState('');
  const [customProcArea, setCustomProcArea] = useState('');

  // DatePicker state per milestone
  const [activeDatePickerIndex, setActiveDatePickerIndex] = useState(null);

  // PDF Preview State
  const [generatedPdf, setGeneratedPdf] = useState(null);

  useEffect(() => {
    fetchMasterProcedures();
  }, []);

  const fetchMasterProcedures = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${CLOUD_URL}/api/procedures/master`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMasterProcedures(res.data || []);
    } catch (err) {
      console.warn('Could not fetch master procedures:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate days to wedding
  const getDaysToEvent = (date) => {
    if (!date) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  };

  const daysToWedding = getDaysToEvent(targetEventDate);

  // Recalculate days_before_event for milestones whenever wedding date changes
  const updateDaysBeforeEvent = (weddingDate, currentMilestones) => {
    if (!weddingDate) return currentMilestones;
    const wTime = new Date(weddingDate);
    wTime.setHours(0, 0, 0, 0);

    return currentMilestones.map(m => {
      const mTime = new Date(m.target_date);
      mTime.setHours(0, 0, 0, 0);
      const diff = Math.ceil((wTime - mTime) / (1000 * 60 * 60 * 24));
      return {
        ...m,
        days_before_event: Math.max(0, diff)
      };
    });
  };

  const handleEventDateChange = (event, selectedDate) => {
    setShowEventDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setTargetEventDate(selectedDate);
      setMilestones(prev => updateDaysBeforeEvent(selectedDate, prev));
    }
  };

  // Template Loader
  const loadTemplate = (type) => {
    const wDate = new Date(targetEventDate);
    const ms = [];

    if (type === '4_WEEK') {
      const d1 = new Date(wDate); d1.setDate(d1.getDate() - 25);
      const d2 = new Date(wDate); d2.setDate(d2.getDate() - 14);
      const d3 = new Date(wDate); d3.setDate(d3.getDate() - 3);

      ms.push({
        id: `m_${Date.now()}_1`,
        sequence_order: 1,
        milestone_title: 'Step 1: Deep Priming & Clarification',
        target_date: d1,
        days_before_event: 25,
        procedures: [{ name: 'BODY POLISHING' }, { name: 'HYDRAFACIAL' }],
        notes: 'Strict SPF 50 sun protection',
        status: 'PLANNED'
      });
      ms.push({
        id: `m_${Date.now()}_2`,
        sequence_order: 2,
        milestone_title: 'Step 2: Laser Toning & Radiance Booster',
        target_date: d2,
        days_before_event: 14,
        procedures: [{ name: 'LASER FACIAL' }, { name: 'LIP LASER' }],
        notes: 'Deep skin hydration; avoid scrubbing',
        status: 'PLANNED'
      });
      ms.push({
        id: `m_${Date.now()}_3`,
        sequence_order: 3,
        milestone_title: 'Step 3: Royal Bridal Glow (Zero Downtime)',
        target_date: d3,
        days_before_event: 3,
        procedures: [{ name: 'WATERLESS FACIAL' }, { name: 'KORIAN HAIR SPA' }],
        notes: 'Ready for wedding festivities!',
        status: 'PLANNED'
      });

      setPlanTitle('4-Week Express Bridal Glow Protocol');
      setAgreedPackagePrice('18000');
      setTotalEstimatedValue('24000');
    } else if (type === '8_WEEK') {
      const d1 = new Date(wDate); d1.setDate(d1.getDate() - 50);
      const d2 = new Date(wDate); d2.setDate(d2.getDate() - 35);
      const d3 = new Date(wDate); d3.setDate(d3.getDate() - 18);
      const d4 = new Date(wDate); d4.setDate(d4.getDate() - 4);

      ms.push({
        id: `m_${Date.now()}_1`,
        sequence_order: 1,
        milestone_title: 'Step 1: Cellular Detox & Deep Exfoliation',
        target_date: d1,
        days_before_event: 50,
        procedures: [{ name: 'BODY PEEL' }, { name: 'SALIPEEL' }],
        notes: 'Prime skin barrier with prescribed moisturizer',
        status: 'PLANNED'
      });
      ms.push({
        id: `m_${Date.now()}_2`,
        sequence_order: 2,
        milestone_title: 'Step 2: Collagen Rejuvenation & Hair Nourishment',
        target_date: d2,
        days_before_event: 35,
        procedures: [{ name: 'MNRF FACE' }, { name: 'SCALP GFC PRP' }],
        notes: 'Skin healing phase; avoid steam/sauna for 48h',
        status: 'PLANNED'
      });
      ms.push({
        id: `m_${Date.now()}_3`,
        sequence_order: 3,
        milestone_title: 'Step 3: Tone Evening & Under-Eye Brightening',
        target_date: d3,
        days_before_event: 18,
        procedures: [{ name: 'LASER FACIAL' }, { name: 'UE GFC' }],
        notes: 'Targeting pigment and dark circles',
        status: 'PLANNED'
      });
      ms.push({
        id: `m_${Date.now()}_4`,
        sequence_order: 4,
        milestone_title: 'Step 4: Ultimate Bridal Glass Skin Glow',
        target_date: d4,
        days_before_event: 4,
        procedures: [{ name: 'WATERLESS FACIAL' }, { name: 'BODY POLISHING' }],
        notes: 'Final zero-downtime glow for wedding ceremony',
        status: 'PLANNED'
      });

      setPlanTitle('8-Week Royal Pre-Bridal Transformation');
      setAgreedPackagePrice('32000');
      setTotalEstimatedValue('42000');
    }

    setMilestones(ms);
    Alert.alert('Template Loaded', `Populated ${ms.length} sequenced milestones. You can adjust dates and procedures freely.`);
  };

  // Add Milestone
  const handleAddMilestone = () => {
    const nextSeq = milestones.length + 1;
    const lastDate = milestones.length > 0 
      ? new Date(milestones[milestones.length - 1].target_date) 
      : new Date();
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 14);

    const wTime = new Date(targetEventDate);
    const diff = Math.max(0, Math.ceil((wTime - nextDate) / (1000 * 60 * 60 * 24)));

    const newM = {
      id: `m_${Date.now()}`,
      sequence_order: nextSeq,
      milestone_title: `Step ${nextSeq}: Radiance & Refinement`,
      target_date: nextDate,
      days_before_event: diff,
      procedures: [],
      notes: '',
      status: 'PLANNED'
    };

    setMilestones(prev => [...prev, newM]);
  };

  // Delete Milestone
  const handleDeleteMilestone = (index) => {
    if (milestones.length <= 1) {
      Alert.alert('Minimum Requirement', 'A treatment plan requires at least 1 milestone step.');
      return;
    }
    setMilestones(prev => {
      const filtered = prev.filter((_, i) => i !== index);
      return filtered.map((m, i) => ({
        ...m,
        sequence_order: i + 1
      }));
    });
  };

  // Milestone Procedure Management
  const openProcPicker = (index) => {
    setActiveMilestoneIndex(index);
    setProcSearchQ('');
    setSelectedCategory('All');
    setCustomProcName('');
    setCustomProcArea('');
    setProcModalVisible(true);
  };

  const handleSelectProcedure = (proc) => {
    if (activeMilestoneIndex === null) return;
    setMilestones(prev => {
      const copy = [...prev];
      const targetM = { ...copy[activeMilestoneIndex] };
      const currentProcs = Array.isArray(targetM.procedures) ? [...targetM.procedures] : [];
      currentProcs.push({
        id: proc.id,
        name: proc.name,
        category: proc.category,
        area: 'Face'
      });
      targetM.procedures = currentProcs;
      copy[activeMilestoneIndex] = targetM;
      return copy;
    });
    setProcModalVisible(false);
  };

  const handleAddCustomProcedure = () => {
    if (!customProcName.trim()) {
      Alert.alert('Error', 'Please enter procedure name.');
      return;
    }
    if (activeMilestoneIndex === null) return;
    setMilestones(prev => {
      const copy = [...prev];
      const targetM = { ...copy[activeMilestoneIndex] };
      const currentProcs = Array.isArray(targetM.procedures) ? [...targetM.procedures] : [];
      currentProcs.push({
        name: customProcName.trim().toUpperCase(),
        area: customProcArea.trim() || 'Custom Area'
      });
      targetM.procedures = currentProcs;
      copy[activeMilestoneIndex] = targetM;
      return copy;
    });
    setCustomProcName('');
    setCustomProcArea('');
    setProcModalVisible(false);
  };

  const handleRemoveProcedure = (mIdx, pIdx) => {
    setMilestones(prev => {
      const copy = [...prev];
      const targetM = { ...copy[mIdx] };
      targetM.procedures = (targetM.procedures || []).filter((_, i) => i !== pIdx);
      copy[mIdx] = targetM;
      return copy;
    });
  };

  const handleMilestoneDateChange = (event, selectedDate) => {
    const idx = activeDatePickerIndex;
    setActiveDatePickerIndex(null);
    if (selectedDate && idx !== null) {
      setMilestones(prev => {
        const copy = [...prev];
        const wTime = new Date(targetEventDate);
        const diff = Math.max(0, Math.ceil((wTime - selectedDate) / (1000 * 60 * 60 * 24)));
        copy[idx] = {
          ...copy[idx],
          target_date: selectedDate,
          days_before_event: diff
        };
        return copy;
      });
    }
  };

  // Save Protocol to Backend
  const handleSaveProtocol = async () => {
    if (!planTitle.trim()) {
      Alert.alert('Validation Error', 'Please provide a protocol title.');
      return;
    }

    try {
      setSaving(true);
      const token = await AsyncStorage.getItem('userToken');

      const payload = {
        patient_id: patient.id,
        plan_type: 'PRE_BRIDAL',
        plan_title: planTitle.trim(),
        event_name: eventName,
        target_event_date: targetEventDate.toISOString().split('T')[0],
        total_estimated_value: parseFloat(totalEstimatedValue) || 0,
        agreed_package_price: parseFloat(agreedPackagePrice) || 0,
        advance_amount: parseFloat(advanceAmount) || 0,
        payment_terms: paymentTerms.trim(),
        doctor_notes: doctorNotes.trim(),
        milestones: milestones.map((m, idx) => ({
          sequence_order: idx + 1,
          milestone_title: m.milestone_title,
          target_date: (m.target_date instanceof Date ? m.target_date : new Date(m.target_date)).toISOString().split('T')[0],
          days_before_event: m.days_before_event,
          procedures: m.procedures,
          notes: m.notes,
          status: m.status || 'PLANNED'
        }))
      };

      if (planId) {
        await axios.put(`${CLOUD_URL}/api/treatment-plans/${planId}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        Alert.alert('Protocol Saved', 'Pre-Bridal treatment plan updated successfully.');
      } else {
        const res = await axios.post(`${CLOUD_URL}/api/treatment-plans`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPlanId(res.data.plan_id);
        Alert.alert('Protocol Created', 'Pre-Bridal treatment plan created and saved successfully.');
      }
    } catch (err) {
      console.error('Error saving plan:', err);
      Alert.alert('Error', err.response?.data?.error || 'Failed to save treatment plan.');
    } finally {
      setSaving(false);
    }
  };

  // Generate & Share PDF
  const handleGenerateAndSharePdf = async () => {
    try {
      setLoading(true);
      const planObj = {
        plan_title: planTitle,
        event_name: eventName,
        target_event_date: targetEventDate.toISOString().split('T')[0],
        total_estimated_value: parseFloat(totalEstimatedValue) || 0,
        agreed_package_price: parseFloat(agreedPackagePrice) || 0,
        advance_amount: parseFloat(advanceAmount) || 0,
        payment_terms: paymentTerms,
        doctor_notes: doctorNotes
      };

      const result = await generatePrebridalProtocolPdfAsync({
        patient,
        plan: planObj,
        milestones
      });

      setGeneratedPdf(result);
      setLoading(false);

      // Prompt user to share to WhatsApp directly
      Alert.alert(
        '📄 Protocol PDF Ready!',
        `Created "${result.filename}". Would you like to share it with the bride on WhatsApp?`,
        [
          {
            text: 'Share on WhatsApp',
            onPress: () => {
              sharePrebridalToWhatsAppAsync({
                pdfUri: result.uri,
                filename: result.filename,
                patient,
                plan: planObj
              });
            }
          },
          {
            text: 'System Share / Print',
            onPress: () => {
              sharePrebridalToWhatsAppAsync({
                pdfUri: result.uri,
                filename: result.filename,
                patient,
                plan: planObj
              });
            }
          },
          { text: 'Done', style: 'cancel' }
        ]
      );
    } catch (err) {
      setLoading(false);
      Alert.alert('PDF Error', 'Failed to generate protocol PDF document.');
    }
  };

  // Filter master procedures in modal
  const filteredProcedures = masterProcedures.filter(p => {
    const matchesQ = p.name.toLowerCase().includes(procSearchQ.toLowerCase()) ||
                     (p.category && p.category.toLowerCase().includes(procSearchQ.toLowerCase()));
    const matchesCat = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesQ && matchesCat;
  });

  const categories = ['All', 'Facial', 'Laser', 'Hair', 'Body', 'General'];

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Pre-Bridal Treatment Planner</Text>
          <Text style={styles.headerSubtitle}>
            {patient.first_name} {patient.last_name} ({patient.skinssence_id || `#${patient.id}`})
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerShareBtn}
          onPress={handleGenerateAndSharePdf}
          disabled={loading}
        >
          <Ionicons name="share-social-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Protocol Title & Target Event Banner */}
        <View style={styles.bannerCard}>
          <Text style={styles.label}>Protocol / Plan Title *</Text>
          <TextInput
            style={styles.input}
            value={planTitle}
            onChangeText={setPlanTitle}
            placeholder="e.g. Customised Royal Pre-Bridal Glow Protocol"
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Occasion</Text>
              <TextInput
                style={styles.input}
                value={eventName}
                onChangeText={setEventName}
                placeholder="e.g. Wedding"
              />
            </View>

            <View style={{ flex: 1.2 }}>
              <Text style={styles.label}>Target Event Date *</Text>
              <TouchableOpacity
                style={styles.dateSelectorBtn}
                onPress={() => setShowEventDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color="#5C0B0B" style={{ marginRight: 6 }} />
                <Text style={styles.dateSelectorText}>
                  {targetEventDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {showEventDatePicker && (
            <DateTimePicker
              value={targetEventDate}
              mode="date"
              display="default"
              onChange={handleEventDateChange}
            />
          )}

          {/* Countdown Pill */}
          <View style={styles.countdownBadge}>
            <Ionicons name="sparkles" size={16} color="#d97706" style={{ marginRight: 6 }} />
            <Text style={styles.countdownBadgeText}>
              {daysToWedding > 0
                ? `⏰ ${daysToWedding} Days to ${eventName} • ${milestones.length} Sequenced Milestones`
                : `Target: ${targetEventDate.toLocaleDateString('en-IN')}`}
            </Text>
          </View>
        </View>

        {/* Quick Template Presets */}
        <View style={styles.presetSection}>
          <Text style={styles.sectionHeading}>⚡ Quick Pre-Bridal Presets</Text>
          <View style={styles.presetRow}>
            <TouchableOpacity style={styles.presetBtn} onPress={() => loadTemplate('4_WEEK')}>
              <Text style={styles.presetBtnText}>✨ 4-Week Express</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.presetBtn, { backgroundColor: '#5C0B0B' }]} onPress={() => loadTemplate('8_WEEK')}>
              <Text style={[styles.presetBtnText, { color: '#fff' }]}>👑 8-Week Royal</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Milestones Timeline */}
        <View style={styles.timelineSection}>
          <View style={styles.timelineHeaderRow}>
            <Text style={styles.sectionHeading}>✦ Sequenced Milestones Roadmap</Text>
            <TouchableOpacity style={styles.addMilestoneHeaderBtn} onPress={handleAddMilestone}>
              <Ionicons name="add-circle" size={18} color="#5C0B0B" style={{ marginRight: 4 }} />
              <Text style={styles.addMilestoneHeaderText}>Add Step</Text>
            </TouchableOpacity>
          </View>

          {milestones.map((m, mIdx) => (
            <View key={m.id || mIdx} style={styles.milestoneCard}>
              {/* Step Ribbon */}
              <View style={styles.stepRibbon}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepBadgeText}>STEP {m.sequence_order || (mIdx + 1)}</Text>
                  {m.days_before_event !== null && (
                    <Text style={styles.stepDaysText}>D - {m.days_before_event} Days</Text>
                  )}
                </View>

                {/* Date Picker Button */}
                <TouchableOpacity
                  style={styles.milestoneDateBtn}
                  onPress={() => setActiveDatePickerIndex(mIdx)}
                >
                  <Ionicons name="calendar-outline" size={14} color="#1e1b4b" style={{ marginRight: 4 }} />
                  <Text style={styles.milestoneDateText}>
                    {m.target_date ? new Date(m.target_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Set Date'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => handleDeleteMilestone(mIdx)}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>

              {/* Milestone Title */}
              <TextInput
                style={styles.milestoneTitleInput}
                value={m.milestone_title}
                onChangeText={(val) => {
                  setMilestones(prev => {
                    const copy = [...prev];
                    copy[mIdx] = { ...copy[mIdx], milestone_title: val };
                    return copy;
                  });
                }}
                placeholder="Milestone Focus / Phase Name"
              />

              {/* Procedures Chips */}
              <View style={styles.procsWrapper}>
                <Text style={styles.procsLabel}>Planned Clinical Procedures:</Text>
                <View style={styles.procsList}>
                  {(m.procedures || []).map((p, pIdx) => (
                    <View key={pIdx} style={styles.procChip}>
                      <Text style={styles.procChipText}>
                        ✦ {p.name} {p.area ? `(${p.area})` : ''}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemoveProcedure(mIdx, pIdx)}>
                        <Ionicons name="close-circle" size={16} color="#6b21a8" style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.addProcChipBtn}
                    onPress={() => openProcPicker(mIdx)}
                  >
                    <Ionicons name="add" size={14} color="#5C0B0B" />
                    <Text style={styles.addProcChipText}>Add Procedure</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Milestone Clinical Notes */}
              <TextInput
                style={styles.milestoneNotesInput}
                value={m.notes}
                onChangeText={(val) => {
                  setMilestones(prev => {
                    const copy = [...prev];
                    copy[mIdx] = { ...copy[mIdx], notes: val };
                    return copy;
                  });
                }}
                placeholder="Clinical care instruction for this session (e.g. SPF 50; no waxing for 5 days)"
              />
            </View>
          ))}

          {activeDatePickerIndex !== null && (
            <DateTimePicker
              value={milestones[activeDatePickerIndex]?.target_date ? new Date(milestones[activeDatePickerIndex].target_date) : new Date()}
              mode="date"
              display="default"
              onChange={handleMilestoneDateChange}
            />
          )}

          <TouchableOpacity style={styles.addStepBottomBtn} onPress={handleAddMilestone}>
            <Ionicons name="add" size={18} color="#5C0B0B" style={{ marginRight: 6 }} />
            <Text style={styles.addStepBottomText}>Add Next Milestone Step</Text>
          </TouchableOpacity>
        </View>

        {/* Commercials & Payment Terms */}
        <View style={styles.card}>
          <Text style={styles.sectionHeading}>💰 Package Investment & Payment Terms</Text>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Standard Value (₹)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={totalEstimatedValue}
                onChangeText={setTotalEstimatedValue}
                placeholder="e.g. 35000"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: '#15803d' }]}>Agreed Package Price (₹) *</Text>
              <TextInput
                style={[styles.input, { borderColor: '#16a34a', fontWeight: 'bold', color: '#166534' }]}
                keyboardType="numeric"
                value={agreedPackagePrice}
                onChangeText={setAgreedPackagePrice}
                placeholder="e.g. 28000"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Advance Paid (₹)</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={advanceAmount}
                onChangeText={setAdvanceAmount}
                placeholder="e.g. 10000"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Balance Remaining (₹)</Text>
              <View style={[styles.input, { backgroundColor: '#f1f5f9', justifyContent: 'center' }]}>
                <Text style={{ fontWeight: 'bold', color: '#b91c1c' }}>
                  ₹{Math.max(0, (parseFloat(agreedPackagePrice) || 0) - (parseFloat(advanceAmount) || 0)).toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.label}>Payment Milestone Schedule</Text>
          <TextInput
            style={styles.input}
            value={paymentTerms}
            onChangeText={setPaymentTerms}
            placeholder="e.g. 50% Advance at booking, balance 50% at Step 2"
          />

          <Text style={styles.label}>Doctor & Homecare Notes</Text>
          <TextInput
            style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
            multiline
            numberOfLines={3}
            value={doctorNotes}
            onChangeText={setDoctorNotes}
            placeholder="Homecare directions, sunscreen instructions, water intake guidelines..."
          />
        </View>

        {/* Primary Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSaveProtocol}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>Save Protocol</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pdfBtn, loading && { opacity: 0.7 }]}
            onPress={handleGenerateAndSharePdf}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.pdfBtnText}>Share Protocol PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Procedure Picker Modal */}
      <Modal visible={procModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Master Procedure</Text>
              <TouchableOpacity onPress={() => setProcModalVisible(false)}>
                <Ionicons name="close" size={24} color="#334155" />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <TextInput
              style={styles.modalSearchInput}
              placeholder="🔍 Search procedures (e.g. Hydrafacial, Laser, Peel)..."
              value={procSearchQ}
              onChangeText={setProcSearchQ}
            />

            {/* Category Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catPillsRow}>
              {categories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catPill, selectedCategory === cat && styles.catPillActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.catPillText, selectedCategory === cat && styles.catPillTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Procedures List */}
            <ScrollView style={{ maxHeight: 280, marginVertical: 10 }}>
              {filteredProcedures.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.procListItem}
                  onPress={() => handleSelectProcedure(p)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.procListItemName}>{p.name}</Text>
                    <Text style={styles.procListItemSub}>
                      Category: {p.category} {p.avg_price ? `• Avg Ref: ₹${p.avg_price}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color="#5C0B0B" />
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Custom Procedure Input */}
            <View style={styles.customProcBox}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#5C0B0B', marginBottom: 4 }}>
                Or Add Custom Bespoke Procedure:
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TextInput
                  style={[styles.input, { flex: 1.5, marginBottom: 0 }]}
                  placeholder="Procedure Name (e.g. Glow Therapy)"
                  value={customProcName}
                  onChangeText={setCustomProcName}
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Area (Face/Neck)"
                  value={customProcArea}
                  onChangeText={setCustomProcArea}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { paddingHorizontal: 12, borderRadius: 6 }]}
                  onPress={handleAddCustomProcedure}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C0B0B',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16
  },
  backBtn: { marginRight: 12 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: '#fde68a', fontSize: 12, marginTop: 2 },
  headerShareBtn: {
    backgroundColor: '#831843',
    padding: 8,
    borderRadius: 8,
    marginLeft: 8
  },
  scrollContent: { padding: 14, paddingBottom: 40 },

  bannerCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2
  },
  label: { fontSize: 12, fontWeight: 'bold', color: '#475569', marginBottom: 4, marginTop: 6 },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 6
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  dateSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1.5,
    borderColor: '#ea580c',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 6
  },
  dateSelectorText: { fontSize: 13, fontWeight: 'bold', color: '#9a3412' },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 6,
    padding: 8,
    marginTop: 6
  },
  countdownBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#92400e' },

  presetSection: { marginBottom: 14 },
  sectionHeading: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', marginBottom: 8 },
  presetRow: { flexDirection: 'row', gap: 10 },
  presetBtn: {
    flex: 1,
    backgroundColor: '#fce7f3',
    borderWidth: 1,
    borderColor: '#f472b6',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center'
  },
  presetBtnText: { color: '#9d174d', fontWeight: 'bold', fontSize: 13 },

  timelineSection: { marginBottom: 16 },
  timelineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addMilestoneHeaderBtn: { flexDirection: 'row', alignItems: 'center', padding: 4 },
  addMilestoneHeaderText: { fontSize: 13, fontWeight: 'bold', color: '#5C0B0B' },

  milestoneCard: {
    backgroundColor: '#fff',
    borderLeftWidth: 4,
    borderLeftColor: '#5C0B0B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 10,
    elevation: 1
  },
  stepRibbon: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 6,
    marginBottom: 8
  },
  stepBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBadgeText: {
    backgroundColor: '#5C0B0B',
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  stepDaysText: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fde68a'
  },
  milestoneDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  milestoneDateText: { fontSize: 11, fontWeight: 'bold', color: '#1e1b4b' },
  milestoneTitleInput: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 4,
    marginBottom: 8
  },

  procsWrapper: { backgroundColor: '#faf5ff', borderRadius: 6, padding: 8, marginBottom: 8 },
  procsLabel: { fontSize: 11, fontWeight: 'bold', color: '#6b21a8', marginBottom: 6 },
  procsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  procChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e8ff',
    borderColor: '#d8b4fe',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  procChipText: { fontSize: 11, fontWeight: 'bold', color: '#581c87' },
  addProcChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fce7f3',
    borderColor: '#f472b6',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  addProcChipText: { fontSize: 11, fontWeight: 'bold', color: '#831843', marginLeft: 2 },
  milestoneNotesInput: {
    fontSize: 12,
    color: '#475569',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },

  addStepBottomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#5C0B0B',
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 4
  },
  addStepBottomText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 13 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2
  },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#5C0B0B',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  pdfBtn: {
    flex: 1.2,
    flexDirection: 'row',
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pdfBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '85%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#5C0B0B' },
  modalSearchInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 10
  },
  catPillsRow: { flexDirection: 'row', marginBottom: 6 },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    marginRight: 6
  },
  catPillActive: { backgroundColor: '#5C0B0B' },
  catPillText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  catPillTextActive: { color: '#fff' },

  procListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  procListItemName: { fontSize: 13, fontWeight: 'bold', color: '#1e293b' },
  procListItemSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  customProcBox: {
    backgroundColor: '#fdf2f8',
    borderColor: '#fbcfe8',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8
  }
});
