import { Alert, Linking } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://skinssence-api.onrender.com';

/**
 * Normalizes an Indian mobile number to a clean 10-digit string.
 * Returns null if the number does not contain at least 10 valid digits.
 */
export function normalizeIndianMobile(rawMobile) {
  if (!rawMobile || typeof rawMobile !== 'string') return null;
  const digits = rawMobile.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return null;
}

/**
 * Fetches the current, up-to-date patient master record from the backend
 * using the permanent Patient S-Number (e.g. S3135) or numeric ID.
 * Never relies on stale cached state.
 */
export async function fetchFreshPatientMaster(patientIdentifier, token) {
  if (!patientIdentifier) return null;
  const cleanId = String(patientIdentifier).trim();

  try {
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    // First try by-snumber endpoint
    try {
      const snRes = await axios.get(`${API_BASE_URL}/api/patients/by-snumber/${encodeURIComponent(cleanId)}`, {
        headers: authHeaders,
        timeout: 8000
      });
      if (snRes.data && (snRes.data.id || snRes.data.skinssence_id)) {
        return snRes.data;
      }
    } catch (snErr) {
      // If 404, fallback to /api/patients/:id
    }

    // Fallback to /api/patients/:id
    const idRes = await axios.get(`${API_BASE_URL}/api/patients/${encodeURIComponent(cleanId)}`, {
      headers: authHeaders,
      timeout: 8000
    });
    if (idRes.data && (idRes.data.id || idRes.data.skinssence_id)) {
      return idRes.data;
    }
  } catch (err) {
    console.warn('[WhatsAppShare] Failed to fetch fresh patient master:', err.message);
  }

  return null;
}

/**
 * Completely independent Preview function.
 * Opens the native print/preview dialog directly on device.
 * Never opens WhatsApp, share sheet, or contact picker.
 */
export async function previewBillPdfAsync(pdfUri, filename = 'Bill Preview') {
  if (!pdfUri) {
    Alert.alert('File Error', 'PDF bill URI is not available for preview.');
    return;
  }

  try {
    const info = await FileSystem.getInfoAsync(pdfUri);
    if (!info.exists) {
      Alert.alert('File Error', 'The bill PDF file could not be found. Please regenerate the bill.');
      return;
    }

    await Print.printAsync({ uri: pdfUri });
  } catch (err) {
    console.error('[WhatsAppShare] Preview error:', err);
    Alert.alert('Preview Error', `Unable to preview document: ${err.message || 'Unknown error'}`);
  }
}

/**
 * Executes the verified Skinssence WhatsApp bill sharing flow.
 *
 * 1. Checks file existence
 * 2. Retrieves current mobile from Patient Master via permanent S-number
 * 3. Validates 10-digit mobile
 * 4. Checks WhatsApp installation
 * 5. Shows mandatory confirmation modal with Patient Name, S ID, Mobile, and File
 * 6. Launches WhatsApp with the actual branded PDF attached
 *
 * @param {Object} params
 * @param {string} params.pdfUri - The URI of the generated branded PDF
 * @param {string} params.filename - Canonical filename: [Patient_Name]_Skinssence_[Invoice_Number].pdf
 * @param {Object} params.patient - Patient object containing skinssence_id and/or id
 * @param {Object} params.inFlightRef - Optional ref object to prevent duplicate simultaneous taps
 */
export async function shareBillToWhatsAppAsync({ pdfUri, filename, patient, inFlightRef }) {
  // Prevent duplicate taps
  if (inFlightRef && inFlightRef.current) {
    return;
  }
  if (inFlightRef) inFlightRef.current = true;

  const releaseLock = () => {
    if (inFlightRef) inFlightRef.current = false;
  };

  try {
    // 1. Verify PDF file exists
    if (!pdfUri) {
      Alert.alert('Bill Missing', 'The PDF bill document has not been generated yet.');
      releaseLock();
      return;
    }

    const fileInfo = await FileSystem.getInfoAsync(pdfUri);
    if (!fileInfo.exists) {
      Alert.alert('Bill Missing', `The bill file ${filename || ''} could not be found. Please regenerate the bill.`);
      releaseLock();
      return;
    }

    // 2. Retrieve latest patient master record via S-number
    const token = await AsyncStorage.getItem('userToken');
    const permanentSId = patient?.skinssence_id || patient?.s_number || patient?.id;

    let freshPatient = null;
    if (permanentSId) {
      freshPatient = await fetchFreshPatientMaster(permanentSId, token);
    }

    // Fallback if network lookup fails but local patient object is present
    const activePatient = freshPatient || patient || {};
    const rawMobile = activePatient.mobile || patient?.mobile;
    const normalizedMobile = normalizeIndianMobile(rawMobile);

    const patientDisplayName = `${activePatient.first_name || patient?.first_name || ''} ${activePatient.last_name || patient?.last_name || ''}`.trim() || 'Patient';
    const displaySId = activePatient.skinssence_id || patient?.skinssence_id || permanentSId || 'N/A';

    // 3. Mobile Number Validation
    if (!normalizedMobile) {
      Alert.alert(
        'Missing or Invalid Mobile',
        `Patient "${patientDisplayName}" (${displaySId}) does not have a valid 10-digit mobile number in the Patient Master record.\n\nCurrent value: ${rawMobile || 'Empty'}\n\nPlease update the mobile number in the patient record before sharing via WhatsApp.`
      );
      releaseLock();
      return;
    }

    // 4. WhatsApp Availability Check
    let isWhatsAppInstalled = false;
    try {
      isWhatsAppInstalled = await Linking.canOpenURL('whatsapp://send');
    } catch (linkErr) {
      // Some Android devices block canOpenURL queries without package visibility declarations; default to true
      isWhatsAppInstalled = true;
    }

    if (!isWhatsAppInstalled) {
      Alert.alert(
        'WhatsApp Not Found',
        'WhatsApp was not detected on this device. You can use standard sharing to send the bill via other apps or email.',
        [
          { text: 'Cancel', style: 'cancel', onPress: releaseLock },
          {
            text: 'Other Share Options',
            onPress: async () => {
              try {
                await Sharing.shareAsync(pdfUri, {
                  dialogTitle: filename || 'Skinssence Patient Bill',
                  mimeType: 'application/pdf',
                  UTI: 'com.adobe.pdf'
                });
              } finally {
                releaseLock();
              }
            }
          }
        ]
      );
      return;
    }

    // 5. Mandatory Staff Confirmation Dialog
    Alert.alert(
      'Send Bill on WhatsApp?',
      `Patient: ${patientDisplayName}\nS ID: ${displaySId}\nMobile: ${normalizedMobile}\nFile: ${filename}\n\nNote: WhatsApp will open with your official Skinssence PDF attached. Select ${patientDisplayName} in WhatsApp to send.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: releaseLock
        },
        {
          text: 'Continue to WhatsApp',
          onPress: async () => {
            try {
              const isAvailable = await Sharing.isAvailableAsync();
              if (!isAvailable) {
                Alert.alert('Sharing Unavailable', 'File sharing is not supported on this device.');
                return;
              }

              // Pass the actual branded PDF to the share sheet with WhatsApp targeted
              await Sharing.shareAsync(pdfUri, {
                dialogTitle: `Share ${filename} to WhatsApp (${patientDisplayName})`,
                mimeType: 'application/pdf',
                UTI: 'com.adobe.pdf'
              });
            } catch (shareErr) {
              console.error('[WhatsAppShare] Share error:', shareErr);
              Alert.alert('Share Failed', `Could not complete sharing: ${shareErr.message || 'Unknown error'}`);
            } finally {
              releaseLock();
            }
          }
        }
      ],
      { cancelable: true, onDismiss: releaseLock }
    );
  } catch (err) {
    console.error('[WhatsAppShare] Error:', err);
    Alert.alert('Error', `WhatsApp sharing encountered an issue: ${err.message || 'Unknown error'}`);
    releaseLock();
  }
}
