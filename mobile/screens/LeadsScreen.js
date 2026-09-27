import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
  Modal
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import {
  getClinicDeviceRole,
  designateThisDeviceAsClinicPhone,
  revokeClinicPhoneRole,
  getDeviceDisplayName
} from '../utils/deviceRole';
import {
  getRecentClinicCalls,
  requestCallLogPermission,
  checkCallLogPermission
} from '../utils/callLogService';
import {
  requestRecordingFolderPermission,
  getLinkedFolderUri,
  unlinkRecordingFolder,
  scanRecordingsInFolder,
  findMatchingRecording,
  readRecordingAsBase64,
  normalizeMobileForMatching
} from '../utils/recordingService';

const API_BASE = 'https://skinssence-api.onrender.com/api/leads';

function LeadsScreenInner({ navigation }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'DUE_TODAY', 'OVERDUE', 'INTERESTED', 'CONVERTED'
  const [stats, setStats] = useState({ total: 0, dueToday: 0, overdue: 0, converted: 0, interested: 0 });

  // Device Role & Clinic Phone Designation State
  const [deviceRole, setDeviceRole] = useState({
    isConfigured: false,
    isDesignatedClinicPhone: false,
    designatedDeviceName: '',
    myDeviceName: ''
  });
  const [userRole, setUserRole] = useState('');
  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);

  // Assisted Caller Resolution State (Clinic Phone Only)
  const [callerInput, setCallerInput] = useState('');
  const [callerResolving, setCallerResolving] = useState(false);
  const [callerResult, setCallerResult] = useState(null);
  const [patientCallModalVisible, setPatientCallModalVisible] = useState(false);
  const [patientCallOutcome, setPatientCallOutcome] = useState('Inquired / Discussed Treatment');
  const [patientCallNotes, setPatientCallNotes] = useState('');
  const [patientCallLogging, setPatientCallLogging] = useState(false);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [callLogPermGranted, setCallLogPermGranted] = useState(false);

  // Xiaomi Call Recording & AI Transcription State
  const [recordingFolderUri, setRecordingFolderUri] = useState(null);
  const [recordingsList, setRecordingsList] = useState([]);
  const [scanningRecordings, setScanningRecordings] = useState(false);
  const [aiDrafts, setAiDrafts] = useState([]);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [selectedRecordingFile, setSelectedRecordingFile] = useState(null);
  const [targetCallForAi, setTargetCallForAi] = useState(null);
  const [aiConfirming, setAiConfirming] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [recordingPickerVisible, setRecordingPickerVisible] = useState(false);
  const [pendingCallForPicker, setPendingCallForPicker] = useState(null);

  const extractTimestampFromFilename = (fileName) => {
    if (!fileName) return null;
    const digitsOnly = fileName.replace(/\D/g, '');
    const yearIdx = digitsOnly.indexOf('202');
    if (yearIdx !== -1 && digitsOnly.length >= yearIdx + 14) {
      const timeStr = digitsOnly.substring(yearIdx, yearIdx + 14);
      const yr = parseInt(timeStr.substring(0, 4), 10);
      const mo = parseInt(timeStr.substring(4, 6), 10) - 1;
      const dy = parseInt(timeStr.substring(6, 8), 10);
      const hr = parseInt(timeStr.substring(8, 10), 10);
      const mn = parseInt(timeStr.substring(10, 12), 10);
      const sc = parseInt(timeStr.substring(12, 14), 10);
      const t = new Date(yr, mo, dy, hr, mn, sc).getTime();
      return isNaN(t) ? null : t;
    }
    return null;
  };

  const matchRecordingFromList = (files, mobile, callTimestamp, processedSet = null) => {
    if (!files || !Array.isArray(files) || files.length === 0) return null;
    const norm = normalizeMobileForMatching(mobile);

    // Filter candidate pool to prefer unprocessed files if available
    const pool = processedSet ? files.filter(f => !processedSet.has(f.name)) : files;
    const searchFiles = pool.length > 0 ? pool : files;

    if (norm && norm.length >= 10) {
      const numberMatches = searchFiles.filter(f => f.name && f.name.includes(norm));
      if (numberMatches.length === 1) {
        return numberMatches[0];
      }
      if (numberMatches.length > 1) {
        if (callTimestamp) {
          const callTime = new Date(callTimestamp).getTime();
          if (!isNaN(callTime)) {
            let closest = numberMatches[0];
            let minDiff = Infinity;
            for (const f of numberMatches) {
              const fileTime = extractTimestampFromFilename(f.name);
              if (fileTime) {
                const diff = Math.abs(fileTime - callTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = f;
                }
              }
            }
            return closest;
          }
        }
        return numberMatches[0];
      }
    }

    // Proximity fallback if mobile number wasn't directly in filename
    if (callTimestamp) {
      const callTime = new Date(callTimestamp).getTime();
      if (!isNaN(callTime)) {
        for (const f of searchFiles) {
          const fileTime = extractTimestampFromFilename(f.name);
          if (fileTime && Math.abs(fileTime - callTime) < 15 * 60 * 1000) {
            return f;
          }
        }
      }
    }
    return null;
  };

  const refreshRecordings = async (autoProcess = false, currentCalls = recentCalls) => {
    try {
      setScanningRecordings(true);
      const uri = await getLinkedFolderUri();
      setRecordingFolderUri(uri);
      if (uri) {
        const files = await scanRecordingsInFolder(uri);
        setRecordingsList(files);

        // Load processed recordings list
        const processedJson = await AsyncStorage.getItem('clinic_processed_recordings');
        const processedSet = new Set(processedJson ? JSON.parse(processedJson) : []);

        // Load existing drafts
        const draftsJson = await AsyncStorage.getItem('clinic_ai_call_drafts');
        const existingDrafts = draftsJson ? JSON.parse(draftsJson) : [];
        setAiDrafts(existingDrafts);

        // Auto-detect new recordings matching recent calls consecutively
        if (autoProcess && files.length > 0 && currentCalls && currentCalls.length > 0) {
          const draftedNames = new Set(existingDrafts.map(d => d.recording_file_name));
          for (const call of currentCalls.slice(0, 10)) {
            const norm = normalizeMobileForMatching(call.phoneNumber || call.normalizedMobile);
            if (!norm || norm.length < 10) continue;

            const matchedRec = matchRecordingFromList(files, norm, call.timestamp, processedSet);
            if (matchedRec && !processedSet.has(matchedRec.name) && !draftedNames.has(matchedRec.name)) {
              draftedNames.add(matchedRec.name);
              console.log('Auto-analyzing recording:', matchedRec.name);
              try {
                await runAiAnalysisForRecording(call, matchedRec, true);
              } catch (recErr) {
                console.warn('Error auto-analyzing recording:', matchedRec.name, recErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error refreshing recordings:', err);
    } finally {
      setScanningRecordings(false);
    }
  };

  const handleConnectRecordingFolder = async () => {
    try {
      const res = await requestRecordingFolderPermission();
      if (res.success && res.folderUri) {
        setRecordingFolderUri(res.folderUri);
        Alert.alert('Folder Connected!', 'Successfully linked to MIUI Call Recordings folder. Skinssence can now read recordings.');
        refreshRecordings(true);
      } else if (res.error && res.error !== 'Permission not granted by user') {
        Alert.alert('Folder Error', res.error);
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleDisconnectFolder = async () => {
    Alert.alert(
      'Disconnect Folder',
      'Do you want to disconnect the call recordings folder?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await unlinkRecordingFolder();
            setRecordingFolderUri(null);
            setRecordingsList([]);
            setAiDrafts([]);
          }
        }
      ]
    );
  };

  const runAiAnalysisForRecording = async (arg1, arg2, isAuto = false) => {
    try {
      if (!isAuto) setAiAnalyzing(true);

      // Support either order: (callItem, recFile) or (recFile, callItem)
      const isArg1Recording = arg1 && (arg1.uri || (typeof arg1.name === 'string' && arg1.name.includes('.')));
      let recFile = isArg1Recording ? arg1 : arg2;
      let callItem = isArg1Recording ? arg2 : arg1;

      // Handle case where recFile is an unresolved Promise
      if (recFile && typeof recFile.then === 'function') {
        recFile = await recFile;
      }

      // If recFile is missing or invalid, search in recordingsList
      if (!recFile || !recFile.uri) {
        recFile = matchRecordingFromList(recordingsList, callItem?.phoneNumber || callItem?.mobile, callItem?.timestamp);
        if (!recFile) {
          recFile = await findMatchingRecording(callItem?.phoneNumber || callItem?.mobile, callItem?.timestamp);
        }
      }

      if (!recFile || !recFile.uri) {
        if (!isAuto) {
          Alert.alert(
            'Recording Not Found',
            'No matching recording audio file was found for this call in the linked folder. You can tap the 📎 icon to select the recording manually.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Select Manually (📎)',
                onPress: () => {
                  setTargetCallForAi(callItem);
                  setPendingCallForPicker(callItem);
                  setRecordingPickerVisible(true);
                }
              }
            ]
          );
        }
        return;
      }

      const base64Audio = await readRecordingAsBase64(recFile.uri);
      const token = await AsyncStorage.getItem('userToken');

      const phone = callItem?.phoneNumber || callItem?.mobile || callItem?.normalizedMobile || '';
      const name = callItem?.name || '';

      const res = await axios.post(
        `${API_BASE}/ai-transcribe-call`,
        {
          audio_base64: base64Audio,
          recording_file_name: recFile.name,
          mobile: phone,
          caller_name: name,
          call_type: callItem?.callType || callItem?.type || 'INCOMING',
          call_duration: callItem?.durationSeconds || callItem?.duration || 0
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success && res.data?.ai_summary) {
        const summary = res.data.ai_summary;
        const newDraft = {
          id: Date.now().toString(),
          recording_file_name: recFile.name,
          rec_uri: recFile.uri,
          call_item: callItem,
          ai_summary: summary,
          timestamp: new Date().toISOString()
        };

        const draftsJson = await AsyncStorage.getItem('clinic_ai_call_drafts');
        const currentDrafts = draftsJson ? JSON.parse(draftsJson) : [];
        const filtered = currentDrafts.filter(d => d.recording_file_name !== recFile.name);
        const updatedDrafts = [newDraft, ...filtered];
        await AsyncStorage.setItem('clinic_ai_call_drafts', JSON.stringify(updatedDrafts));
        setAiDrafts(updatedDrafts);

        if (!isAuto) {
          setSelectedRecordingFile(recFile);
          setTargetCallForAi(callItem);
          setAiSummary(summary);
          setAiModalVisible(true);
        }
      } else {
        if (!isAuto) Alert.alert('AI Analysis Error', res.data?.error || 'Failed to analyze recording.');
      }
    } catch (err) {
      console.error('runAiAnalysisForRecording error:', err);
      if (!isAuto) Alert.alert('Error', err.response?.data?.error || err.message || 'Failed to analyze audio.');
    } finally {
      if (!isAuto) setAiAnalyzing(false);
    }
  };

  const handleReviewDraft = (draft) => {
    setSelectedRecordingFile({ name: draft.recording_file_name, uri: draft.rec_uri });
    setTargetCallForAi(draft.call_item);
    setAiSummary(draft.ai_summary);
    setAiModalVisible(true);
  };

  const handleDiscardDraft = async (draftId, recFileName) => {
    try {
      const updated = aiDrafts.filter(d => d.id !== draftId);
      setAiDrafts(updated);
      await AsyncStorage.setItem('clinic_ai_call_drafts', JSON.stringify(updated));

      if (recFileName) {
        const processedJson = await AsyncStorage.getItem('clinic_processed_recordings');
        const processedSet = new Set(processedJson ? JSON.parse(processedJson) : []);
        processedSet.add(recFileName);
        await AsyncStorage.setItem('clinic_processed_recordings', JSON.stringify(Array.from(processedSet)));
      }
    } catch (e) {
      console.warn('Error discarding draft:', e);
    }
  };

  const handleAttachExistingPatientCall = async (draftOrSummary = null, customRecFile = null) => {
    try {
      setAiConfirming(true);
      const isDraft = draftOrSummary && draftOrSummary.ai_summary;
      const summary = isDraft ? draftOrSummary.ai_summary : (draftOrSummary || aiSummary);
      const recFile = isDraft 
        ? { name: draftOrSummary.recording_file_name, uri: draftOrSummary.rec_uri } 
        : (customRecFile || selectedRecordingFile);
      const draftId = isDraft ? draftOrSummary.id : null;

      const patient = summary?.existing_patient;
      if (!patient) {
        Alert.alert('No Patient Found', 'Could not locate existing patient details to attach.');
        return;
      }

      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        patient_id: patient.id,
        skinssence_id: patient.skinssence_id,
        mobile: summary.phone_number || patient.mobile,
        call_type: summary.call_type || 'Incoming Call',
        call_outcome: `Existing Patient Call: ${summary.service_interest || 'Consultation inquiry'}`,
        notes: `AI Summary: ${summary.main_concern || ''}\nQuestions: ${(summary.questions_asked || []).join(', ')}\nAction: ${summary.staff_action_required || ''}\nNotes: ${summary.important_notes || ''}`,
        ai_transcript: summary.transcript || '',
        ai_summary_json: summary,
        recording_file_name: recFile?.name || ''
      };

      await axios.post(
        `${API_BASE}/log-patient-call`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (recFile?.name) {
        const processedJson = await AsyncStorage.getItem('clinic_processed_recordings');
        const processedSet = new Set(processedJson ? JSON.parse(processedJson) : []);
        processedSet.add(recFile.name);
        await AsyncStorage.setItem('clinic_processed_recordings', JSON.stringify(Array.from(processedSet)));

        const updatedDrafts = aiDrafts.filter(d => d.recording_file_name !== recFile.name && (!draftId || d.id !== draftId));
        setAiDrafts(updatedDrafts);
        await AsyncStorage.setItem('clinic_ai_call_drafts', JSON.stringify(updatedDrafts));
      }

      setAiModalVisible(false);
      Alert.alert(
        'Attached to Patient Profile',
        `Call notes and recording attached to existing patient ${patient.name} (${patient.skinssence_id}). Patient record preserved and no duplicate lead was created.`
      );
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || e.message);
    } finally {
      setAiConfirming(false);
    }
  };

  const handleDismissNonLeadCall = async (classification = 'Dismissed') => {
    try {
      const recFile = selectedRecordingFile;
      if (recFile?.name) {
        const processedJson = await AsyncStorage.getItem('clinic_processed_recordings');
        const processedSet = new Set(processedJson ? JSON.parse(processedJson) : []);
        processedSet.add(recFile.name);
        await AsyncStorage.setItem('clinic_processed_recordings', JSON.stringify(Array.from(processedSet)));

        const updatedDrafts = aiDrafts.filter(d => d.recording_file_name !== recFile.name);
        setAiDrafts(updatedDrafts);
        await AsyncStorage.setItem('clinic_ai_call_drafts', JSON.stringify(updatedDrafts));
      }

      setAiModalVisible(false);
      Alert.alert(
        'Call Dismissed',
        `Marked as ${String(classification).replace(/_/g, ' ')}. Recording archived and not added to Leads.`
      );
    } catch (e) {
      console.warn('Error dismissing non-lead call:', e);
      setAiModalVisible(false);
    }
  };

  const handleConfirmAiLead = async () => {
    try {
      setAiConfirming(true);
      const token = await AsyncStorage.getItem('userToken');

      const payload = {
        lead_id: targetCallForAi?.lead_id || null,
        name: aiSummary.lead_name || targetCallForAi?.name || '',
        mobile: aiSummary.phone_number || targetCallForAi?.phoneNumber || targetCallForAi?.mobile,
        treatment_interest: aiSummary.service_interest,
        main_concern: aiSummary.main_concern,
        notes: aiSummary.important_notes,
        conversation_summary: `AI Summary: ${aiSummary.main_concern || ''}. Questions: ${(aiSummary.questions_asked || []).join(', ')}. Action: ${aiSummary.staff_action_required || ''}`,
        budget_info: aiSummary.price_discussed,
        preferred_visit_timing: aiSummary.preferred_appointment,
        urgency: aiSummary.urgency || 'Normal',
        lead_temperature: aiSummary.lead_temperature || 'Warm',
        status: aiSummary.lead_status || 'New',
        followup_date: aiSummary.follow_up_date,
        ai_transcript: aiSummary.transcript,
        ai_summary_json: aiSummary,
        recording_file_name: selectedRecordingFile?.name || ''
      };

      const res = await axios.post(
        `${API_BASE}/ai-confirm-lead`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data?.success) {
        if (selectedRecordingFile?.name) {
          const processedJson = await AsyncStorage.getItem('clinic_processed_recordings');
          const processedSet = new Set(processedJson ? JSON.parse(processedJson) : []);
          processedSet.add(selectedRecordingFile.name);
          await AsyncStorage.setItem('clinic_processed_recordings', JSON.stringify(Array.from(processedSet)));

          const updatedDrafts = aiDrafts.filter(d => d.recording_file_name !== selectedRecordingFile.name);
          setAiDrafts(updatedDrafts);
          await AsyncStorage.setItem('clinic_ai_call_drafts', JSON.stringify(updatedDrafts));
        }

        setAiModalVisible(false);
        fetchLeads();

        Alert.alert(
          'Lead Saved!',
          `Lead ${res.data.lead_id} successfully saved with structured AI call data.\n\nWould you like to send a follow-up WhatsApp message now?`,
          [
            { text: 'Done', style: 'cancel' },
            {
              text: '💬 Send WhatsApp',
              onPress: () => {
                const phone = payload.mobile;
                const text = `Hello ${payload.name || ''}, thank you for contacting Skinssence Clinic regarding ${payload.treatment_interest || 'our aesthetic treatments'}. We would be happy to assist you with your consultation with Dr. Ashima.`;
                Linking.openURL(`whatsapp://send?phone=91${phone}&text=${encodeURIComponent(text)}`);
              }
            }
          ]
        );
      }
    } catch (err) {
      Alert.alert('Save Failed', err.response?.data?.error || err.message || 'Failed to save lead');
    } finally {
      setAiConfirming(false);
    }
  };

  const fetchRecentCalls = async (promptUser = false) => {
    try {
      setLoadingCalls(true);
      if (typeof requestCallLogPermission === 'function') {
        const perm = await requestCallLogPermission(promptUser);
        setCallLogPermGranted(!!perm);
        if (perm && typeof getRecentClinicCalls === 'function') {
          const calls = await getRecentClinicCalls(10);
          const safeCalls = Array.isArray(calls) ? calls : [];
          setRecentCalls(safeCalls);
          await refreshRecordings(true, safeCalls);
        }
      }
    } catch (e) {
      console.warn('Could not fetch recent calls:', e);
    } finally {
      setLoadingCalls(false);
    }
  };

  const fetchDeviceRole = async () => {
    try {
      const roleInfo = await getClinicDeviceRole();
      setDeviceRole(roleInfo);
      const role = await AsyncStorage.getItem('userRole');
      setUserRole(role ? role.toUpperCase() : '');
    } catch (e) {
      console.warn('Could not fetch device role', e);
    }
  };

  const fetchLeads = async (search = searchQuery, filter = activeFilter) => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      let url = `${API_BASE}?limit=100`;
      
      if (search && search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }

      if (filter === 'CONVERTED') {
        url += '&status=Converted to Patient';
      } else if (filter === 'INTERESTED') {
        url += '&status=Interested';
      }

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      let fetchedLeads = res.data?.leads || [];
      if (res.data?.stats) {
        setStats(res.data.stats);
      }

      // Filter on client if Due Today or Overdue selected
      const todayStr = new Date().toISOString().split('T')[0];
      if (filter === 'DUE_TODAY') {
        fetchedLeads = fetchedLeads.filter(l => l.followup_date === todayStr && l.status !== 'Converted to Patient');
      } else if (filter === 'OVERDUE') {
        fetchedLeads = fetchedLeads.filter(l => l.followup_date && l.followup_date < todayStr && l.status !== 'Converted to Patient');
      }

      setLeads(fetchedLeads);
    } catch (e) {
      console.error('Error fetching leads:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLeads(searchQuery, activeFilter);
      fetchDeviceRole();
      try {
        if (typeof checkCallLogPermission === 'function') {
          checkCallLogPermission()
            .then(async (granted) => {
              setCallLogPermGranted(!!granted);
              if (granted) {
                await fetchRecentCalls(false);
              } else {
                await refreshRecordings(false);
              }
            })
            .catch((err) => {
              console.warn('checkCallLogPermission error:', err);
              refreshRecordings(false);
            });
        } else {
          refreshRecordings(false);
        }
      } catch (e) {
        console.warn('Could not check call log permission:', e);
      }
    }, [activeFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeads(searchQuery, activeFilter);
    try {
      if (deviceRole.isDesignatedClinicPhone && typeof fetchRecentCalls === 'function') {
        fetchRecentCalls(false);
      } else {
        refreshRecordings(true);
      }
    } catch (e) {}
  };

  const handleSearchSubmit = () => {
    fetchLeads(searchQuery, activeFilter);
  };

  const handleDesignateDevice = async (override = false) => {
    setDeviceLoading(true);
    try {
      const res = await designateThisDeviceAsClinicPhone(override);
      Alert.alert('Success', res.message || 'This device is now the single Clinic Call/Lead Phone.');
      setDeviceModalVisible(false);
      fetchDeviceRole();
    } catch (e) {
      if (e.response && e.response.status === 409) {
        Alert.alert(
          'Transfer Clinic Phone',
          e.response.data?.message || 'Another phone is currently designated. Transfer designation to this phone?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Transfer Now', onPress: () => handleDesignateDevice(true) }
          ]
        );
      } else {
        Alert.alert('Error', e.response?.data?.error || 'Failed to designate clinic phone');
      }
    } finally {
      setDeviceLoading(false);
    }
  };

  const handleResolveCaller = async (inputNum = callerInput) => {
    const trimmed = (inputNum || '').trim();
    if (!trimmed) {
      Alert.alert('Phone Number Required', 'Please enter or paste a phone number to resolve.');
      return;
    }

    // Strict Indian mobile validation (10 digits starting with 6-9, optional 0 or 91)
    const digits = trimmed.replace(/\D/g, '');
    let validNormMobile = '';
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
      validNormMobile = digits;
    } else if (digits.length === 11 && digits.startsWith('0') && /^[6-9]\d{9}$/.test(digits.slice(1))) {
      validNormMobile = digits.slice(1);
    } else if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) {
      validNormMobile = digits.slice(2);
    }

    if (!validNormMobile) {
      setCallerResolving(false);
      setCallerResult({
        error: `"${trimmed}" is not a valid Indian mobile number. Indian numbers must be 10 digits starting with 6, 7, 8, or 9 (optional +91, 91, or 0).`,
        priorityAction: 'ERROR'
      });
      return;
    }

    setCallerResolving(true);
    setCallerResult(null);

    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await axios.get(`${API_BASE}/check-duplicate?mobile=${encodeURIComponent(validNormMobile)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const data = res.data || {};
      const normalizedMobile = data.normalizedMobile || validNormMobile;

      // Resiliently resolve priorityAction for both new & legacy backend versions
      let priorityAction = data.priorityAction;
      if (!priorityAction) {
        if (data.existingPatient) {
          priorityAction = 'OPEN_PATIENT';
        } else if (data.existingLead) {
          priorityAction = 'OPEN_LEAD';
        } else {
          priorityAction = 'CREATE_LEAD';
        }
      }

      setCallerResult({
        ...data,
        normalizedMobile,
        priorityAction
      });
    } catch (err) {
      console.error('Caller resolution error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Failed to resolve caller number. Please check format.';
      setCallerResult({
        error: errMsg,
        priorityAction: 'ERROR'
      });
    } finally {
      setCallerResolving(false);
    }
  };

  const handleClearCaller = () => {
    setCallerInput('');
    setCallerResult(null);
  };

  const handleLogPatientCall = async () => {
    if (!callerResult?.existingPatient) return;
    setPatientCallLogging(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      await axios.post(
        `${API_BASE}/log-patient-call`,
        {
          patient_id: callerResult.existingPatient.id,
          skinssence_id: callerResult.existingPatient.skinssence_id,
          call_type: 'Incoming / Missed Call',
          call_outcome: patientCallOutcome,
          notes: patientCallNotes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert(
        'Call Logged',
        `Successfully logged call for Patient ${callerResult.existingPatient.name} (${callerResult.existingPatient.skinssence_id}). Patient record preserved.`
      );
      setPatientCallModalVisible(false);
      setPatientCallNotes('');
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to log patient call');
    } finally {
      setPatientCallLogging(false);
    }
  };

  const handleRevokeDevice = async () => {
    Alert.alert(
      'Revoke Designation',
      'Are you sure you want to revoke clinic phone designation? All phones will revert to personal staff mode.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setDeviceLoading(true);
            try {
              const res = await revokeClinicPhoneRole();
              Alert.alert('Revoked', res.message);
              setDeviceModalVisible(false);
              fetchDeviceRole();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.error || 'Failed to revoke designation');
            } finally {
              setDeviceLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleFilterSelect = (filterKey) => {
    setActiveFilter(filterKey);
    fetchLeads(searchQuery, filterKey);
  };

  const handleCall = (mobile) => {
    if (!mobile) return Alert.alert('No Number', 'Mobile number not found');
    const clean = String(mobile).replace(/\D/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {
      Alert.alert('Error', 'Unable to launch phone dialer');
    });
  };

  const handleWhatsApp = (item) => {
    if (!item.mobile) return Alert.alert('No Number', 'Mobile number not found');
    const clean = String(item.mobile).replace(/\D/g, '');
    const phoneWithCode = clean.startsWith('91') ? clean : `91${clean}`;
    const greeting = `Hello ${item.name || 'Client'}, thank you for contacting Skinssence Laser & Skincare Clinic. How may we assist you today?`;
    Linking.openURL(`whatsapp://send?phone=${phoneWithCode}&text=${encodeURIComponent(greeting)}`).catch(() => {
      Alert.alert('WhatsApp Error', 'WhatsApp does not appear to be installed');
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'New': return { bg: '#e0f2fe', text: '#0369a1' };
      case 'Interested': return { bg: '#dcfce7', text: '#15803d' };
      case 'Follow-up Due': return { bg: '#fef3c7', text: '#b45309' };
      case 'Appointment Booked': return { bg: '#ede9fe', text: '#6d28d9' };
      case 'Converted to Patient': return { bg: '#d1fae5', text: '#065f46' };
      case 'Lost': return { bg: '#fee2e2', text: '#b91c1c' };
      default: return { bg: '#f1f5f9', text: '#475569' };
    }
  };

  const renderLeadCard = ({ item }) => {
    const statusStyle = getStatusColor(item.status);
    const todayStr = new Date().toISOString().split('T')[0];
    const isOverdue = item.followup_date && item.followup_date < todayStr && item.status !== 'Converted to Patient';
    const isToday = item.followup_date === todayStr && item.status !== 'Converted to Patient';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('LeadDetail', { lead_id: item.lead_id })}
      >
        <View style={styles.cardTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <View style={styles.leadIdBadge}>
              <Text style={styles.leadIdText}>{item.lead_id}</Text>
            </View>
            <Text style={styles.leadName} numberOfLines={1}>{item.name}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{item.status}</Text>
          </View>
        </View>

        <View style={styles.cardMiddleRow}>
          <Text style={styles.mobileText}>📞 {item.mobile}</Text>
          {item.source && (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceText}>{item.source}</Text>
            </View>
          )}
        </View>

        {item.treatment_interest ? (
          <View style={styles.treatmentRow}>
            <Text style={styles.treatmentText} numberOfLines={1}>
              🎯 {item.treatment_interest}
            </Text>
          </View>
        ) : null}

        {item.followup_date ? (
          <View style={[styles.followupBanner, isOverdue ? styles.followupOverdue : (isToday ? styles.followupToday : styles.followupUpcoming)]}>
            <Text style={[styles.followupText, isOverdue ? { color: '#b91c1c' } : (isToday ? { color: '#92400e' } : { color: '#1e40af' })]}>
              {isOverdue ? '⚠️ Overdue' : (isToday ? '📅 Follow-up Today' : '⏳ Follow-up')}: {item.followup_date} {item.followup_time || ''}
            </Text>
          </View>
        ) : null}

        {item.converted_patient_s_id ? (
          <View style={styles.convertedRow}>
            <Text style={styles.convertedText}>✓ Converted Patient: {item.converted_patient_s_id}</Text>
          </View>
        ) : null}

        <View style={styles.cardActionRow}>
          <TouchableOpacity style={styles.cardCallBtn} onPress={() => handleCall(item.mobile)}>
            <Text style={styles.cardCallBtnText}>📞 Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cardWaBtn} onPress={() => handleWhatsApp(item)}>
            <Text style={styles.cardWaBtnText}>💬 WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.cardViewBtn} 
            onPress={() => navigation.navigate('LeadDetail', { lead_id: item.lead_id })}>
            <Text style={styles.cardViewBtnText}>Details ›</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <View style={styles.listHeaderWrapper}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 }}>
        {/* SUMMARY STATS BAR */}
        <View style={styles.statsBar}>
          <TouchableOpacity 
            style={[styles.statChip, activeFilter === 'ALL' && styles.statChipActive]} 
            onPress={() => handleFilterSelect('ALL')}>
            <Text style={styles.statLabel}>Total</Text>
            <Text style={styles.statValue}>{stats.total}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statChip, activeFilter === 'DUE_TODAY' && styles.statChipActive, { borderLeftColor: '#f59e0b' }]} 
            onPress={() => handleFilterSelect('DUE_TODAY')}>
            <Text style={[styles.statLabel, { color: '#b45309' }]}>Today</Text>
            <Text style={[styles.statValue, { color: '#b45309' }]}>{stats.dueToday}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statChip, activeFilter === 'OVERDUE' && styles.statChipActive, { borderLeftColor: '#ef4444' }]} 
            onPress={() => handleFilterSelect('OVERDUE')}>
            <Text style={[styles.statLabel, { color: '#b91c1c' }]}>Overdue</Text>
            <Text style={[styles.statValue, { color: '#b91c1c' }]}>{stats.overdue}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statChip, activeFilter === 'CONVERTED' && styles.statChipActive, { borderLeftColor: '#10b981' }]} 
            onPress={() => handleFilterSelect('CONVERTED')}>
            <Text style={[styles.statLabel, { color: '#065f46' }]}>Converted</Text>
            <Text style={[styles.statValue, { color: '#065f46' }]}>{stats.converted}</Text>
          </TouchableOpacity>
        </View>

        {/* AGENDA BUTTON */}
        <TouchableOpacity 
          style={styles.agendaNavBtn}
          onPress={() => navigation.navigate('LeadFollowups')}>
          <Text style={styles.agendaNavText}>📅 Open Follow-up Agenda & Reminders ›</Text>
        </TouchableOpacity>

        {/* CLINIC PHONE ROLE BANNER */}
        <View style={deviceRole.isDesignatedClinicPhone ? styles.deviceBannerActive : styles.deviceBannerInactive}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <Text style={deviceRole.isDesignatedClinicPhone ? styles.deviceBannerTextActive : styles.deviceBannerTextInactive} numberOfLines={1}>
              {deviceRole.isDesignatedClinicPhone 
                ? '🟢 Clinic Phone • AI Call & Audio Active'
                : '📱 Staff Phone • Audio Scanning Dormant'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!deviceRole.isDesignatedClinicPhone && (
              <TouchableOpacity
                style={styles.setClinicPhoneBtn}
                onPress={() => handleDesignateDevice(false)}
              >
                <Text style={styles.setClinicPhoneBtnText}>⭐ Set as Clinic Phone</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setDeviceModalVisible(true)} style={styles.manageDeviceLink}>
              <Text style={styles.manageDeviceLinkText}>Manage ⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 1. XIAOMI CALL RECORDINGS FOLDER CONNECTION CARD (ALWAYS PROMINENT & ACCESSIBLE) */}
      <View style={styles.recFolderCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16 }}>🎙️</Text>
              <Text style={styles.recFolderTitle}>Xiaomi Call Recordings</Text>
            </View>
            <Text style={styles.recFolderSub}>
              {recordingFolderUri
                ? `✅ Connected: MIUI/sound_recorder/call_rec (${recordingsList.length} files)`
                : 'Connect MIUI/sound_recorder/call_rec folder once to enable AI voice listening & extraction.'}
            </Text>
          </View>

          {recordingFolderUri ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                style={styles.recFolderActionBtn}
                onPress={() => refreshRecordings(true)}
                disabled={scanningRecordings}
              >
                {scanningRecordings ? (
                  <ActivityIndicator size="small" color="#0369a1" />
                ) : (
                  <Text style={styles.recFolderActionBtnText}>🔄 Rescan</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.recFolderConnectBtn}
              onPress={handleConnectRecordingFolder}
            >
              <Text style={styles.recFolderConnectBtnText}>📁 Connect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 2. AI DRAFT SUMMARIES REVIEW QUEUE */}
      {aiDrafts.length > 0 && (
        <View style={styles.aiDraftsContainer}>
          <View style={styles.aiDraftsHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 16 }}>✨</Text>
              <Text style={styles.aiDraftsTitle}>AI Call Summaries ({aiDrafts.length} to Review)</Text>
            </View>
            <Text style={styles.aiDraftsSubtitle}>Review before committing to CRM</Text>
          </View>

          {aiDrafts.map((draft) => {
            const isClient = draft.ai_summary?.call_classification === 'POTENTIAL_CLIENT';
            const isExisting = draft.ai_summary?.call_classification === 'EXISTING_CLIENT';
            const isSupplier = draft.ai_summary?.call_classification === 'SUPPLIER_VENDOR';
            const isStaff = draft.ai_summary?.call_classification === 'STAFF_INTERNAL';
            const isSpam = draft.ai_summary?.call_classification === 'SPAM_WRONG_NUMBER';

            const classLabel = isClient
              ? '🟢 Potential Client'
              : isExisting
              ? '🔵 Existing Patient'
              : isSupplier
              ? '🟠 Supplier / Vendor'
              : isStaff
              ? '🟣 Staff / Internal'
              : isSpam
              ? '⚪ Spam / Wrong No.'
              : '⚪ Other Call';

            return (
              <View key={draft.id} style={styles.aiDraftCard}>
                <View style={styles.aiDraftCardHeader}>
                  <View style={styles.aiClassBadge}>
                    <Text style={styles.aiClassBadgeText}>{classLabel}</Text>
                  </View>
                  <Text style={styles.aiDraftRecName} numberOfLines={1}>
                    🎙️ {draft.recording_file_name}
                  </Text>
                </View>

                <Text style={styles.aiDraftCaller}>
                  {draft.ai_summary?.lead_name || 'Caller'} ({draft.ai_summary?.phone_number || draft.call_item?.phoneNumber})
                </Text>

                {draft.ai_summary?.service_interest ? (
                  <Text style={styles.aiDraftDetail}>
                    🎯 Interest: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{draft.ai_summary.service_interest}</Text>
                  </Text>
                ) : null}

                {draft.ai_summary?.main_concern ? (
                  <Text style={styles.aiDraftDetail} numberOfLines={2}>
                    📝 Concern: {draft.ai_summary.main_concern}
                  </Text>
                ) : null}

                {draft.ai_summary?.price_discussed && draft.ai_summary.price_discussed !== 'Not Discussed' ? (
                  <Text style={styles.aiDraftDetail}>
                    💵 Budget/Price: <Text style={{ fontWeight: '700', color: '#059669' }}>{draft.ai_summary.price_discussed}</Text>
                  </Text>
                ) : null}

                <View style={styles.aiDraftActionsRow}>
                  <TouchableOpacity
                    style={styles.aiDraftDiscardBtn}
                    onPress={() => handleDiscardDraft(draft)}
                  >
                    <Text style={styles.aiDraftDiscardBtnText}>✕ Discard</Text>
                  </TouchableOpacity>

                  {isExisting ? (
                    <TouchableOpacity
                      style={styles.aiDraftConfirmBtn}
                      onPress={() => handleAttachExistingPatientCall(draft)}
                    >
                      <Text style={styles.aiDraftConfirmBtnText}>📎 Attach to Patient</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.aiDraftEditBtn}
                        onPress={() => handleReviewDraft(draft)}
                      >
                        <Text style={styles.aiDraftEditBtnText}>✏️ Edit Grid</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.aiDraftConfirmBtn}
                        onPress={() => handleReviewDraft(draft)}
                      >
                        <Text style={styles.aiDraftConfirmBtnText}>✓ Review & Confirm</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* 3. ASSISTED CALL RESOLVER (DESIGNATED CLINIC PHONE ONLY) */}
      {deviceRole.isDesignatedClinicPhone && (
        <View style={styles.assistantCard}>
          <View style={styles.assistantHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.assistantTitle}>📞 Incoming / Missed Call Assistant</Text>
              <Text style={styles.assistantSubtitle}>Resolve incoming/missed number against Patients & Leads</Text>
            </View>
            <View style={styles.liveIndicatorBadge}>
              <Text style={styles.liveIndicatorText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.assistantInputRow}>
            <TextInput
              style={styles.assistantInput}
              placeholder="Paste or enter 10-digit number..."
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              value={callerInput}
              onChangeText={(t) => {
                setCallerInput(t);
                if (callerResult) setCallerResult(null);
              }}
              onSubmitEditing={() => handleResolveCaller()}
              returnKeyType="search"
            />
            {callerInput.length > 0 && (
              <TouchableOpacity style={styles.assistantClearBtn} onPress={handleClearCaller}>
                <Text style={{ color: '#64748b', fontSize: 16, fontWeight: 'bold' }}>✕</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.assistantResolveBtn, callerResolving && { opacity: 0.7 }]}
              onPress={() => handleResolveCaller()}
              disabled={callerResolving}
            >
              {callerResolving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.assistantResolveBtnText}>Resolve</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* DYNAMIC RESOLUTION RESULT */}
          {callerResult && (
            <View style={styles.assistantResultContainer}>
              {/* CASE 1: EXISTING PATIENT MATCH */}
              {(callerResult.priorityAction === 'OPEN_PATIENT' || !!callerResult.existingPatient) && !callerResult.error && (
                <View style={styles.patientMatchBox}>
                  <View style={styles.resultBadgeRow}>
                    <View style={styles.patientMatchBadge}>
                      <Text style={styles.patientMatchBadgeText}>✓ Existing Patient Match</Text>
                    </View>
                    <Text style={styles.patientIdTag}>{callerResult.existingPatient.skinssence_id}</Text>
                  </View>

                  <Text style={styles.resultPersonName}>
                    {callerResult.existingPatient.name || 'Skinssence Patient'}
                  </Text>
                  <Text style={styles.resultDetailsText}>
                    📞 {callerResult.existingPatient.mobile} {callerResult.existingPatient.city ? `• 📍 ${callerResult.existingPatient.city}` : ''}
                  </Text>

                  <View style={styles.patientPriorityBanner}>
                    <Text style={styles.patientPriorityBannerText}>
                      🛡️ Patient Priority: Duplicate Lead creation is disabled.
                    </Text>
                  </View>

                  <View style={styles.resultActionRow}>
                    <TouchableOpacity
                      style={styles.openPatientActionBtn}
                      onPress={() => navigation.navigate('PatientProfile', { patient: callerResult.existingPatient })}
                    >
                      <Text style={styles.openPatientActionBtnText}>👤 Open Patient File</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.logCallPatientBtn}
                      onPress={() => {
                        setPatientCallOutcome('Consultation inquiry');
                        setPatientCallNotes('');
                        setPatientCallModalVisible(true);
                      }}
                    >
                      <Text style={styles.logCallPatientBtnText}>📝 Log Call Notes</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* CASE 2: EXISTING LEAD MATCH */}
              {callerResult.priorityAction === 'OPEN_LEAD' && !!callerResult.existingLead && !callerResult.error && (
                <View style={styles.leadMatchBox}>
                  <View style={styles.resultBadgeRow}>
                    <View style={styles.leadMatchBadge}>
                      <Text style={styles.leadMatchBadgeText}>✓ Existing Lead Match</Text>
                    </View>
                    <Text style={styles.leadIdTag}>{callerResult.existingLead.lead_id}</Text>
                  </View>

                  <Text style={styles.resultPersonName}>
                    {callerResult.existingLead.name || 'Potential Client'}
                  </Text>
                  <Text style={styles.resultDetailsText}>
                    📞 {callerResult.existingLead.mobile} • Status: {callerResult.existingLead.status || 'New'}
                  </Text>

                  <View style={styles.resultActionRow}>
                    <TouchableOpacity
                      style={styles.openLeadActionBtn}
                      onPress={() => navigation.navigate('LeadDetail', { lead_id: callerResult.existingLead.lead_id })}
                    >
                      <Text style={styles.openLeadActionBtnText}>🎯 Open Lead Details</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addInteractionActionBtn}
                      onPress={() => navigation.navigate('LeadDetail', { lead_id: callerResult.existingLead.lead_id, autoOpenInteraction: true })}
                    >
                      <Text style={styles.addInteractionActionBtnText}>+ Add Call Interaction</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* CASE 3: NEW UNKNOWN NUMBER */}
              {callerResult.priorityAction === 'CREATE_LEAD' && !callerResult.error && (
                <View style={styles.newNumberBox}>
                  <View style={styles.resultBadgeRow}>
                    <View style={styles.newNumberBadge}>
                      <Text style={styles.newNumberBadgeText}>✨ New Caller / Prospective Lead</Text>
                    </View>
                  </View>

                  <Text style={styles.newNumberPrompt}>
                    Number <Text style={{ fontWeight: 'bold' }}>{callerResult.normalizedMobile}</Text> is not yet registered.
                  </Text>

                  <View style={styles.newNumberActionsRow}>
                    <TouchableOpacity
                      style={styles.createLeadActionBtn}
                      onPress={() =>
                        navigation.navigate('AddLead', {
                          initialMobile: callerResult.normalizedMobile,
                          initialSource: 'Phone Call',
                          isCallNotesMode: true
                        })
                      }
                    >
                      <Text style={styles.createLeadActionBtnText}>📝 Record Enquiry & Call Notes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.missedLeadActionBtn}
                      onPress={() =>
                        navigation.navigate('AddLead', {
                          initialMobile: callerResult.normalizedMobile,
                          initialSource: 'Missed Call',
                          isCallNotesMode: true
                        })
                      }
                    >
                      <Text style={styles.missedLeadActionBtnText}>📞 Record Missed Call Note</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* CASE 4: ERROR / INVALID NUMBER */}
              {(callerResult.priorityAction === 'ERROR' || !!callerResult.error) && (
                <View style={styles.errorResultBox}>
                  <Text style={styles.errorResultText}>⚠️ {callerResult.error}</Text>
                </View>
              )}
            </View>
          )}

          {/* RECENT INCOMING / MISSED CALLS FEED */}
          {recentCalls.length > 0 && (
            <View style={styles.recentCallsContainer}>
              <View style={styles.recentCallsHeader}>
                <Text style={styles.recentCallsTitle}>Recent Calls (Auto-Tracked)</Text>
                <TouchableOpacity onPress={fetchRecentCalls} disabled={loadingCalls}>
                  <Text style={styles.recentCallsRefreshText}>
                    {loadingCalls ? 'Scanning...' : '🔄 Scan Logs'}
                  </Text>
                </TouchableOpacity>
              </View>

              {recentCalls.slice(0, 5).map((call, idx) => {
                const callDate = new Date(parseInt(call.timestamp, 10));
                const timeStr = !isNaN(callDate.getTime())
                  ? callDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';
                const dateStr = !isNaN(callDate.getTime())
                  ? callDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
                  : '';

                const isMissed = call.type === 'MISSED' || call.type === 'REJECTED';
                const isIncoming = call.type === 'INCOMING';
                const typeColor = isMissed ? '#ef4444' : isIncoming ? '#0284c7' : '#10b981';

                const matchedRec = matchRecordingFromList(recordingsList, call.phoneNumber, call.timestamp);

                return (
                  <View key={call.rawId || idx} style={styles.callItemRow}>
                    <View style={[styles.callTypeBadge, { borderColor: typeColor }]}>
                      <Text style={[styles.callTypeBadgeText, { color: typeColor }]}>
                        {isMissed ? 'MISSED' : isIncoming ? 'IN' : 'OUT'}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.callPhoneNumber} numberOfLines={1}>
                        {call.name ? `${call.name} (${call.phoneNumber})` : call.phoneNumber}
                      </Text>
                      <Text style={styles.callMetaText}>
                        {dateStr} {timeStr} • {call.duration > 0 ? `${call.duration}s` : 'No Answer'}
                        {matchedRec ? ' • 🎙️ Recording Found' : ''}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {matchedRec ? (
                        <TouchableOpacity
                          style={styles.aiScanBtn}
                          onPress={() => runAiAnalysisForRecording(matchedRec, call)}
                          disabled={aiAnalyzing}
                        >
                          <Text style={styles.aiScanBtnText}>
                            {aiAnalyzing ? '⏳' : '✨ AI'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.pickRecBtn}
                          onPress={() => {
                            setTargetCallForAi(call);
                            setPendingCallForPicker(call);
                            setRecordingPickerVisible(true);
                          }}
                        >
                          <Text style={styles.pickRecBtnText}>📎</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.resolveCallBtn}
                        onPress={() => handleResolveCaller(call.phoneNumber)}
                      >
                        <Text style={styles.resolveCallBtnText}>Resolve ›</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}

      {/* 4. SEARCH SECTION */}
      <View style={styles.searchSection}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Lead ID, Name, or Mobile..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearchSubmit}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity 
            style={styles.clearSearchBtn}
            onPress={() => { setSearchQuery(''); fetchLeads('', activeFilter); }}>
            <Text style={{ color: '#64748b', fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearchSubmit}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* PINNED TOP NAV HEADER */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Potential Clients / Leads</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('AddLead')}
          >
            <Text style={styles.addBtnText}>+ Add Lead</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* FLUID SCROLLABLE BODY (HEADER + AI CARDS + LEADS LIST) */}
      <FlatList
        data={leads}
        keyExtractor={(item) => item.lead_id}
        renderItem={renderLeadCard}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={
          loading && !refreshing ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#5C0B0B" />
              <Text style={styles.loadingText}>Loading leads...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🎯</Text>
              <Text style={styles.emptyTitle}>No leads found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? 'Try another search term or filter' : 'Tap "+ Add Lead" to record a new client enquiry'}
              </Text>
            </View>
          )
        }
      />


      {/* MODAL: LOG PATIENT CALL ACTIVITY */}
      <Modal visible={patientCallModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.deviceModalBox}>
            <Text style={styles.deviceModalTitle}>📝 Log Patient Call Activity</Text>
            <Text style={styles.deviceModalSubtitle}>
              Record call details for {callerResult?.existingPatient?.name} ({callerResult?.existingPatient?.skinssence_id}). Patient record is preserved without creating a Lead.
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Call Outcome</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {['Inquiry / Discussed Treatment', 'Appointment Booked', 'Follow-up Scheduled', 'Price Inquiry', 'Missed Call / Follow-up Needed', 'General Inquiry'].map((outcome) => (
                <TouchableOpacity
                  key={outcome}
                  style={[
                    styles.outcomeChip,
                    patientCallOutcome === outcome && styles.outcomeChipActive
                  ]}
                  onPress={() => setPatientCallOutcome(outcome)}
                >
                  <Text
                    style={[
                      styles.outcomeChipText,
                      patientCallOutcome === outcome && styles.outcomeChipTextActive
                    ]}
                  >
                    {outcome}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Notes / Call Details</Text>
            <TextInput
              style={styles.modalNotesInput}
              placeholder="Enter notes from the call..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
              value={patientCallNotes}
              onChangeText={setPatientCallNotes}
            />

            <View style={styles.deviceModalActions}>
              <TouchableOpacity
                style={[styles.designateBtn, patientCallLogging && { opacity: 0.6 }]}
                onPress={handleLogPatientCall}
                disabled={patientCallLogging}
              >
                {patientCallLogging ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.designateBtnText}>Save Call Activity</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeModalBtn}
                onPress={() => setPatientCallModalVisible(false)}
              >
                <Text style={styles.closeModalBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: CLINIC PHONE DESIGNATION MANAGEMENT */}
      <Modal visible={deviceModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.deviceModalBox}>
            <Text style={styles.deviceModalTitle}>📱 Clinic Phone Configuration</Text>
            <Text style={styles.deviceModalSubtitle}>
              Ensure incoming-call tracking and lead scanning run exclusively on the ONE designated clinic handset.
            </Text>

            <View style={styles.deviceInfoCard}>
              <Text style={styles.deviceInfoLabel}>This Device:</Text>
              <Text style={styles.deviceInfoValue}>{deviceRole.myDeviceName || 'This Phone'}</Text>
              <Text style={styles.deviceInfoSub}>{deviceRole.isDesignatedClinicPhone ? '✓ Active Designated Clinic Phone' : 'Personal / Staff Handset'}</Text>
            </View>

            <View style={styles.deviceInfoCard}>
              <Text style={styles.deviceInfoLabel}>Currently Designated Phone:</Text>
              <Text style={[styles.deviceInfoValue, { color: deviceRole.isConfigured ? '#0369a1' : '#64748b' }]}>
                {deviceRole.designatedDeviceName || 'None configured (All devices in staff mode)'}
              </Text>
            </View>

            <View style={styles.securityNotice}>
              <Text style={styles.securityNoticeText}>
                🔒 Privacy Guarantee: Personal and staff phones are never prompted for call-log or telephony permissions.
              </Text>
            </View>

            <View style={styles.deviceModalActions}>
              {deviceRole.isDesignatedClinicPhone ? (
                <TouchableOpacity 
                  style={[styles.revokeBtn, deviceLoading && { opacity: 0.6 }]} 
                  onPress={handleRevokeDevice}
                  disabled={deviceLoading}>
                  <Text style={styles.revokeBtnText}>Revoke Designation</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity 
                  style={[styles.designateBtn, deviceLoading && { opacity: 0.6 }]} 
                  onPress={() => handleDesignateDevice(false)}
                  disabled={deviceLoading}>
                  <Text style={styles.designateBtnText}>Designate This Phone as Clinic Phone</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.closeModalBtn} 
                onPress={() => setDeviceModalVisible(false)}>
                <Text style={styles.closeModalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 3. EXCEL-STYLE AI CALL SUMMARY MODAL */}
      <Modal
        visible={aiModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setAiModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: 40 }}>
          {/* Header */}
          <View style={styles.excelModalHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <View style={styles.excelAiBadge}>
                  <Text style={styles.excelAiBadgeText}>✨ AI INTERPRETED</Text>
                </View>
                <Text style={styles.excelFileBadge} numberOfLines={1}>
                  🎙️ {selectedRecordingFile?.name || 'Call Audio'}
                </Text>
              </View>
              <Text style={styles.excelModalTitle}>AI Call Summary (Review & Edit)</Text>
            </View>
            <TouchableOpacity onPress={() => setAiModalVisible(false)} style={styles.excelCloseBtn}>
              <Text style={{ fontSize: 20, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: 14 }}>
            {/* Classification & Intent Row */}
            <View style={styles.classificationHeroBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.classificationLabel}>Call Classification:</Text>
                <View style={[styles.classificationBadge, { backgroundColor: aiSummary?.call_classification === 'POTENTIAL_CLIENT' ? '#dcfce7' : (aiSummary?.call_classification === 'EXISTING_CLIENT' ? '#dbeafe' : '#f1f5f9') }]}>
                  <Text style={[styles.classificationBadgeText, { color: aiSummary?.call_classification === 'POTENTIAL_CLIENT' ? '#15803d' : (aiSummary?.call_classification === 'EXISTING_CLIENT' ? '#1d4ed8' : '#475569') }]}>
                    {aiSummary?.call_classification || 'POTENTIAL_CLIENT'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.classificationLabel}>Lead Intent:</Text>
                <View style={styles.intentBadge}>
                  <Text style={styles.intentBadgeText}>{aiSummary?.lead_intent || 'INQUIRY'}</Text>
                </View>
              </View>
            </View>

            {/* Excel-like Table Grid */}
            <View style={styles.excelTableContainer}>
              {/* Header */}
              <View style={styles.excelTableHeaderRow}>
                <Text style={[styles.excelTh, { flex: 1.2 }]}>CRM Data Field</Text>
                <Text style={[styles.excelTh, { flex: 2.2 }]}>Extracted Info (Editable)</Text>
              </View>

              {/* Row 1: Name */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>👤 Caller Name</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2 }]}
                  value={aiSummary?.lead_name}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, lead_name: t })}
                  placeholder="Caller name"
                />
              </View>

              {/* Row 2: Phone */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>📞 Phone Number</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2 }]}
                  value={aiSummary?.phone_number}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, phone_number: t })}
                  placeholder="Mobile number"
                  keyboardType="phone-pad"
                />
              </View>

              {/* Row 3: Treatment Category */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>📋 Treatment Interest</Text>
                <View style={{ flex: 2.2 }}>
                  <TextInput
                    style={styles.excelTdInput}
                    value={aiSummary?.service_interest}
                    onChangeText={(t) => setAiSummary({ ...aiSummary, service_interest: t })}
                    placeholder="Treatment interest"
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    {['Laser Hair Removal', 'Acne', 'Acne Scars', 'Pigmentation', 'Melasma', 'Hair Loss', 'PRP/GFC', 'Hydrafacial', 'Carbon Laser', 'Tattoo Removal', 'Under-eye', 'Skin Rejuvenation', 'Other'].map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        onPress={() => setAiSummary({ ...aiSummary, service_interest: cat })}
                        style={[styles.miniChip, aiSummary?.service_interest === cat && styles.miniChipActive]}
                      >
                        <Text style={[styles.miniChipText, aiSummary?.service_interest === cat && styles.miniChipTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Row 4: Main Concern */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>🎯 Main Concern</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2, minHeight: 48 }]}
                  value={aiSummary?.main_concern}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, main_concern: t })}
                  multiline
                  placeholder="Primary concern discussed"
                />
              </View>

              {/* Row 5: Questions Asked */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>❓ Questions Asked</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2, minHeight: 48 }]}
                  value={Array.isArray(aiSummary?.questions_asked) ? aiSummary.questions_asked.join('\n• ') : (aiSummary?.questions_asked || '')}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, questions_asked: t.split('\n') })}
                  multiline
                  placeholder="Specific questions patient asked"
                />
              </View>

              {/* Row 6: Price Discussed */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>💵 Price / Budget</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2 }]}
                  value={aiSummary?.price_discussed}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, price_discussed: t })}
                  placeholder="e.g. ₹3,500 package or Not Discussed"
                />
              </View>

              {/* Row 7: Preferred Appointment */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>📅 Preferred Timing</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2 }]}
                  value={aiSummary?.preferred_appointment}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, preferred_appointment: t })}
                  placeholder="e.g. Saturday afternoon"
                />
              </View>

              {/* Row 8: Follow-up Date */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>🗓️ Follow-up Date</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2 }]}
                  value={aiSummary?.follow_up_date}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, follow_up_date: t })}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              {/* Row 9: Lead Intent & Temperature */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>🔥 Lead Temperature</Text>
                <View style={{ flex: 2.2, flexDirection: 'row', gap: 6 }}>
                  {['Hot', 'Warm', 'Cold'].map((temp) => (
                    <TouchableOpacity
                      key={temp}
                      onPress={() => setAiSummary({ ...aiSummary, lead_temperature: temp })}
                      style={[styles.miniChip, aiSummary?.lead_temperature === temp && styles.miniChipActive]}
                    >
                      <Text style={[styles.miniChipText, aiSummary?.lead_temperature === temp && styles.miniChipTextActive]}>{temp}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Row 10: Staff Action */}
              <View style={styles.excelTableRow}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>⚡ Staff Action</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2 }]}
                  value={aiSummary?.staff_action_required}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, staff_action_required: t })}
                  placeholder="Action for clinic receptionist"
                />
              </View>

              {/* Row 11: Clinical Notes */}
              <View style={[styles.excelTableRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.excelTdLabel, { flex: 1.2 }]}>📝 Important Notes</Text>
                <TextInput
                  style={[styles.excelTdInput, { flex: 2.2, minHeight: 48 }]}
                  value={aiSummary?.important_notes}
                  onChangeText={(t) => setAiSummary({ ...aiSummary, important_notes: t })}
                  multiline
                  placeholder="Key conversation notes"
                />
              </View>
            </View>

            {/* Collapsible Transcript Section */}
            <View style={styles.transcriptCard}>
              <TouchableOpacity
                onPress={() => setShowTranscript(!showTranscript)}
                style={styles.transcriptHeader}
              >
                <Text style={styles.transcriptTitle}>
                  📜 {showTranscript ? 'Hide' : 'View'} Verbatim Call Transcript (Hindi/English)
                </Text>
                <Text style={{ fontSize: 16 }}>{showTranscript ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {showTranscript && (
                <View style={styles.transcriptBody}>
                  <Text style={styles.transcriptText}>
                    {aiSummary?.transcript || 'No transcript text available.'}
                  </Text>
                </View>
              )}
            </View>

            {/* Existing Patient Detection Banner */}
            {(aiSummary?.existing_patient || aiSummary?.call_classification === 'EXISTING_CLIENT') && (
              <View style={{ backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#bfdbfe' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Text style={{ fontSize: 16 }}>👤</Text>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#1e40af' }}>
                    Registered Clinic Patient: {aiSummary?.existing_patient?.name || aiSummary?.lead_name}
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#2563eb', marginBottom: 2 }}>
                  ID: {aiSummary?.existing_patient?.skinssence_id || 'Registered'} • Phone: {aiSummary?.phone_number}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748b' }}>
                  Attaching preserves patient records and avoids duplicate entries in Potential Leads.
                </Text>
              </View>
            )}

            {/* Bottom Actions */}
            <View style={{ marginBottom: 40, marginTop: 10 }}>
              {(aiSummary?.existing_patient || aiSummary?.call_classification === 'EXISTING_CLIENT') ? (
                <>
                  <TouchableOpacity
                    style={[styles.confirmSaveBtn, { backgroundColor: '#0284c7', marginBottom: 10 }]}
                    onPress={() => handleAttachExistingPatientCall()}
                    disabled={aiConfirming}
                  >
                    {aiConfirming ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmSaveBtnText}>
                        📋 Attach to Patient Profile ({aiSummary?.existing_patient?.skinssence_id || 'Patient'})
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cancelModalBtn, { borderColor: '#cbd5e1', marginBottom: 10 }]}
                    onPress={handleConfirmAiLead}
                    disabled={aiConfirming}
                  >
                    <Text style={[styles.cancelModalBtnText, { color: '#475569' }]}>
                      ➕ Save as New Potential Lead Anyway
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (aiSummary?.call_classification === 'SPAM_WRONG_NUMBER' || aiSummary?.call_classification === 'SUPPLIER_VENDOR' || aiSummary?.call_classification === 'STAFF_INTERNAL') ? (
                <>
                  <TouchableOpacity
                    style={[styles.confirmSaveBtn, { backgroundColor: '#dc2626', marginBottom: 10 }]}
                    onPress={() => handleDismissNonLeadCall(aiSummary?.call_classification)}
                  >
                    <Text style={styles.confirmSaveBtnText}>
                      🚫 Dismiss & Mark as {aiSummary?.call_classification?.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cancelModalBtn, { borderColor: '#cbd5e1', marginBottom: 10 }]}
                    onPress={handleConfirmAiLead}
                    disabled={aiConfirming}
                  >
                    <Text style={[styles.cancelModalBtnText, { color: '#475569' }]}>
                      ➕ Save as Potential Lead Anyway
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.confirmSaveBtn}
                  onPress={handleConfirmAiLead}
                  disabled={aiConfirming}
                >
                  {aiConfirming ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.confirmSaveBtnText}>✅ Confirm & Save to Potential Leads</Text>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setAiModalVisible(false)}
              >
                <Text style={styles.cancelModalBtnText}>Close Modal</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* 4. MANUAL RECORDINGS PICKER MODAL */}
      <Modal
        visible={recordingPickerVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRecordingPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.deviceModalBox, { maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text style={styles.deviceModalTitle}>Select Call Recording</Text>
                <Text style={styles.deviceModalSubtitle}>
                  Pick the matching MP3 file for {pendingCallForPicker?.phoneNumber || 'this call'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRecordingPickerVisible(false)}>
                <Text style={{ fontSize: 20, color: '#64748b' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={recordingsList}
              keyExtractor={(item) => item.uri}
              style={{ maxHeight: 350 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItemRow}
                  onPress={() => {
                    setRecordingPickerVisible(false);
                    runAiAnalysisForRecording(pendingCallForPicker, item, false);
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 8 }}>🎙️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.pickerItemSub}>Tap to transcribe & extract with AI</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#64748b' }}>No recordings found in linked folder.</Text>
                </View>
              }
            />

            <TouchableOpacity
              style={[styles.closeModalBtn, { marginTop: 12 }]}
              onPress={() => setRecordingPickerVisible(false)}
            >
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}



class LeadsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error ? String(error.message || error) : 'Render error' };
  }
  componentDidCatch(error, info) {
    console.error('LeadsScreen ErrorBoundary caught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 8, textAlign: 'center' }}>
            Unable to load Leads screen
          </Text>
          <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20 }}>
            {this.state.errorMessage}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#5C0B0B', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}
            onPress={() => this.setState({ hasError: false, errorMessage: '' })}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}


export default function LeadsScreen(props) {
  return (
    <LeadsErrorBoundary>
      <LeadsScreenInner {...props} />
    </LeadsErrorBoundary>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  header: {
    backgroundColor: '#5C0B0B',
    paddingTop: 45,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  backText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', flex: 1, textAlign: 'center' },
  addBtn: {
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  addBtnText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 13 },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  statChip: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    width: '23%',
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: '#5C0B0B',
    elevation: 1,
  },
  statChipActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#5C0B0B',
    borderWidth: 1.5,
  },
  statLabel: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  statValue: { fontSize: 14, color: '#1e293b', fontWeight: 'bold', marginTop: 2 },
  agendaNavBtn: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 10,
    alignItems: 'center',
    elevation: 1,
  },
  agendaNavText: { color: '#5C0B0B', fontSize: 12, fontWeight: '700' },
  deviceBannerActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceBannerInactive: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceBannerTextActive: {
    fontSize: 12,
    color: '#15803d',
    fontWeight: '700',
    flex: 1,
  },
  deviceBannerTextInactive: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  manageDeviceLink: {
    paddingLeft: 8,
    paddingVertical: 2,
  },
  manageDeviceLinkText: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: 'bold',
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1e293b',
  },
  clearSearchBtn: { padding: 8 },
  searchBtn: {
    backgroundColor: '#5C0B0B',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  searchBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  listContainer: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  leadIdBadge: {
    backgroundColor: '#fef2f2',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
    marginRight: 8,
  },
  leadIdText: { color: '#5C0B0B', fontWeight: 'bold', fontSize: 12 },
  leadName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b', flex: 1 },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusText: { fontSize: 11, fontWeight: 'bold' },
  cardMiddleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  mobileText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  sourceBadge: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  sourceText: { fontSize: 11, color: '#64748b' },
  treatmentRow: { marginBottom: 6 },
  treatmentText: { fontSize: 12, color: '#0369a1', fontWeight: '500' },
  followupBanner: {
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  followupOverdue: { backgroundColor: '#fee2e2' },
  followupToday: { backgroundColor: '#fef3c7' },
  followupUpcoming: { backgroundColor: '#eff6ff' },
  followupText: { fontSize: 12, fontWeight: '600' },
  convertedRow: {
    backgroundColor: '#d1fae5',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  convertedText: { color: '#065f46', fontSize: 12, fontWeight: 'bold' },
  cardActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
    marginTop: 4,
  },
  cardCallBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  cardCallBtnText: { color: '#2563eb', fontWeight: 'bold', fontSize: 12 },
  cardWaBtn: {
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  cardWaBtnText: { color: '#16a34a', fontWeight: 'bold', fontSize: 12 },
  cardViewBtn: {
    backgroundColor: '#5C0B0B',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cardViewBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 10, color: '#64748b', fontSize: 14 },
  emptyContainer: { alignItems: 'center', paddingVertical: 50 },
  emptyEmoji: { fontSize: 40, marginBottom: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 6, paddingHorizontal: 30 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  deviceModalBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    elevation: 5,
  },
  deviceModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  deviceModalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 14,
    lineHeight: 18,
  },
  deviceInfoCard: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  deviceInfoLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  deviceInfoValue: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: 'bold',
    marginTop: 2,
  },
  deviceInfoSub: {
    fontSize: 12,
    color: '#16a34a',
    marginTop: 2,
    fontWeight: '500',
  },
  securityNotice: {
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  securityNoticeText: {
    fontSize: 12,
    color: '#1d4ed8',
    lineHeight: 16,
  },
  deviceModalActions: {
    gap: 10,
  },
  designateBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  designateBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  revokeBtn: {
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  revokeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  closeModalBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeModalBtnText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },
  // ASSISTED CALL RESOLVER STYLES
  assistantCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0284c7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  assistantHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  assistantTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  assistantSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  liveIndicatorBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  liveIndicatorText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#15803d',
  },
  assistantInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assistantInput: {
    flex: 1,
    height: 42,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  assistantClearBtn: {
    position: 'absolute',
    right: 95,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  assistantResolveBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistantResolveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  assistantResultContainer: {
    marginTop: 12,
  },
  patientMatchBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    padding: 12,
  },
  patientMatchBadge: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  patientMatchBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  patientIdTag: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#15803d',
  },
  resultBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  resultPersonName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  resultDetailsText: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  patientPriorityBanner: {
    backgroundColor: '#dcfce7',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  patientPriorityBannerText: {
    fontSize: 11,
    color: '#166534',
    fontWeight: '500',
  },
  resultActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  openPatientActionBtn: {
    flex: 1,
    backgroundColor: '#16a34a',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  openPatientActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  logPatientCallActionBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  logPatientCallActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  leadMatchBox: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#7dd3fc',
    borderRadius: 10,
    padding: 12,
  },
  leadMatchBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  leadMatchBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  leadIdTag: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0369a1',
  },
  openLeadActionBtn: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  openLeadActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  leadWaActionBtn: {
    backgroundColor: '#25D366',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  leadWaActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  leadCallActionBtn: {
    backgroundColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  leadCallActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  unknownMatchBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    padding: 12,
  },
  unknownBadge: {
    backgroundColor: '#d97706',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  unknownBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  unknownSubtitleText: {
    fontSize: 12,
    color: '#78350f',
    marginTop: 2,
  },
  isolationBanner: {
    backgroundColor: '#fef3c7',
    padding: 6,
    borderRadius: 6,
    marginTop: 8,
    marginBottom: 10,
  },
  isolationBannerText: {
    fontSize: 11,
    color: '#92400e',
    fontWeight: '500',
  },
  createLeadActionBtn: {
    flex: 1,
    backgroundColor: '#d97706',
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  createLeadActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  missedLeadActionBtn: {
    backgroundColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    alignItems: 'center',
  },
  missedLeadActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  errorResultBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    padding: 10,
  },
  errorResultText: {
    fontSize: 12,
    color: '#b91c1c',
    fontWeight: '500',
  },
  modalNotesInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  outcomeChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  outcomeChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  outcomeChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  outcomeChipTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  // RECENT CALLS FEED STYLES
  callFeedContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  callFeedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  callFeedTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  refreshCallsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  refreshCallsBtnText: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: 'bold',
  },
  permPromptBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  permPromptTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
  },
  permPromptDesc: {
    fontSize: 11,
    color: '#3b82f6',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 15,
  },
  permPromptButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  permPromptButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  noCallsBox: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  noCallsText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  recentCallsList: {
    gap: 8,
  },
  callRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  callTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  callTypeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  callPhoneNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
  },
  callMetaText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  resolveCallBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  resolveCallBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },

  recFolderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  recFolderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  recFolderSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    maxWidth: 220,
  },
  recFolderConnectBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  recFolderActionBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  aiDraftsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  aiDraftsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  aiDraftsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#312e81',
  },
  aiDraftsSubtitle: {
    fontSize: 11,
    color: '#6366f1',
    fontWeight: '600',
  },
  aiDraftCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
  },
  aiDraftCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  aiClassBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiClassBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  aiDraftRecName: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  aiDraftCaller: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  aiDraftDetail: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 3,
  },
  aiDraftActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  aiDraftConfirmBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  aiDraftConfirmBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  aiDraftEditBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  aiDraftEditBtnText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
  },
  aiDraftDiscardBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  aiDraftDiscardBtnText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '600',
  },
  aiScanBtn: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  aiScanBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  pickRecBtn: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pickRecBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  recFoundBadge: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
  },
  excelModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  excelModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  excelAiBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  excelAiBadgeText: {
    color: '#4338ca',
    fontSize: 10,
    fontWeight: '700',
  },
  excelFileBadge: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  excelCloseBtn: {
    padding: 6,
  },
  classificationHeroBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  classificationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  classificationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  classificationBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  intentBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  intentBadgeText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '700',
  },
  excelTableContainer: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#fff',
  },
  excelTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  excelTh: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  excelTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    alignItems: 'center',
  },
  excelTdLabel: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    backgroundColor: '#f8fafc',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  excelTdInput: {
    fontSize: 12,
    color: '#0f172a',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  miniChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  miniChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  miniChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  miniChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  transcriptCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    overflow: 'hidden',
  },
  transcriptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f1f5f9',
  },
  transcriptTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  transcriptBody: {
    padding: 10,
    maxHeight: 180,
  },
  transcriptText: {
    fontSize: 12,
    color: '#1e293b',
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  confirmSaveBtn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  confirmSaveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelModalBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  cancelModalBtnText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  pickerItemSub: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2,
  },


  listHeaderWrapper: {
    paddingBottom: 6,
  },
  setClinicPhoneBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  setClinicPhoneBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

});
